import { FC, useMemo, useState } from 'react';
import { AIResult, Issue, Diff } from '@docmate/shared/types';
import DiffView from './DiffView';

import { UnifiedResultSection } from './UnifiedResultSection';
import { vscodeApi } from '../vscodeApi';

interface UnifiedResultCardProps {
  result: AIResult;
  onDismissDiff?: () => void;
}

export const UnifiedResultCard: FC<UnifiedResultCardProps> = ({ result, onDismissDiff }) => {
  const [showDiffView, setShowDiffView] = useState(!result.dismissed);

  const hasActualChanges = (diffs: Diff[]) => {
    if (!diffs || diffs.length === 0) return false;
    let total = 0;
    for (const d of diffs) {
      if (d.type === 'insert' || d.type === 'delete') total += d.value.length;
    }
    return total > 0;
  };

  const originalFromDiffs = useMemo(() => {
    if (!result.diffs) return '';
    return result.diffs.filter(d => d.type !== 'insert').map(d => d.value).join('');
  }, [result.diffs]);

  const finalizeDismiss = () => {
    (result as any).dismissed = true;
    setShowDiffView(false);
    // 通知上层（App）持久化
    onDismissDiff?.();
  };

  const handleAccept = (suggestion: string) => {
    try {
      // 发送应用建议命令
      vscodeApi.postMessage({
        command: 'applySuggestion',
        payload: { text: suggestion, originalText: originalFromDiffs }
      } as any);

      // 发送清除波浪线命令
      try {
        // 获取所有 issues 的原始文本
        const originalTexts: string[] = [];
        if (result.issues && result.issues.length > 0) {
          result.issues.forEach((issue: Issue) => {
            if (issue.original_text) {
              originalTexts.push(issue.original_text);
            }
          });
        }

        // 如果没有找到原始文本，使用从 diffs 计算的文本
        if (originalTexts.length === 0 && originalFromDiffs) {
          originalTexts.push(originalFromDiffs);
        }

        // 发送清除命令
        const payload = {
          originalText: originalTexts.length === 1 ? originalTexts[0] : originalTexts
        };

        vscodeApi.postMessage({
          command: 'clearDiagnostics',
          payload: payload
        } as any);
      } catch (e) {
        console.error('UnifiedResultCard: clearDiagnostics failed in handleAccept:', e);
      }

      finalizeDismiss();
    } catch (e) {
      console.error('UnifiedResultCard: applySuggestion failed', e);
    }
  };

  const handleReject = () => {
    // 清除相关的波浪线
    try {
      // 获取所有 issues 的原始文本
      const originalTexts: string[] = [];
      if (result.issues && result.issues.length > 0) {
        result.issues.forEach((issue: Issue) => {
          if (issue.original_text) {
            originalTexts.push(issue.original_text);
          }
        });
      }

      // 如果没有找到原始文本，使用从 diffs 计算的文本
      if (originalTexts.length === 0) {
        const originalFromDiffs = useMemo(() => {
          if (!result.diffs) return '';
          return result.diffs.filter(d => d.type !== 'insert').map(d => d.value).join('');
        }, [result.diffs]);
        originalTexts.push(originalFromDiffs);
      }

      // 发送清除命令
      const payload = {
        originalText: originalTexts.length === 1 ? originalTexts[0] : originalTexts
      };

      vscodeApi.postMessage({
        command: 'clearDiagnostics',
        payload: payload
      } as any);
    } catch (e) {
      console.error('UnifiedResultCard: clearDiagnostics failed:', e);
    }
    finalizeDismiss();
  };

  const hasDiffChanges = !!result.diffs && hasActualChanges(result.diffs as any);
  const hasNoChanges = !!result.diffs && !hasActualChanges(result.diffs as any);

  return (
    <div className="unified-result-card">
      {/* Diff 区域：有实际修改且未被隐藏时显示 */}
      {hasDiffChanges && result.diffs && showDiffView && (
        <DiffView diffs={result.diffs as any} onAccept={handleAccept} onReject={handleReject} />
      )}

      {/* 检查结果（组件化显示）*/}
      {(result.issues && result.issues.length > 0) || (hasNoChanges && result.type === 'check') ? (
        <UnifiedResultSection
          title="🔍 检查结果"
          items={result.issues && result.issues.length > 0 ?
            result.issues.map((issue: Issue, index: number) => ({
              id: `issue-${index}`,
              type: issue.type || 'TERMINOLOGY',
              title: issue.message,
              description: issue.message,
              details: issue.suggestion ? `建议：${issue.suggestion}` : undefined,
              severity: issue.severity || 'warning',
              lineNumber: issue.range ? issue.range[0] + 1 : undefined  // range[0] 应该是行号，+1 转换为 1-based
            })) :
            [{ id: 'no-issues', type: 'success', title: '检查完成，未发现问题', description: '检查完成，未发现问题', details: '文本符合规范，无需修改', severity: 'info' }]
          }
          sectionType="check"
        />
      ) : null}

      {/* 润色结果（仅在 polish 功能下展示）*/}
      {result.type === 'polish' && ((Array.isArray(result.changes) && result.changes.length > 0) || hasNoChanges) ? (
        <UnifiedResultSection
          title="✨ 润色结果"
          items={Array.isArray(result.changes) && result.changes.length > 0 ?
            (result.changes as any[]).map((change: any, index: number) => ({
              id: `change-${index}`,
              type: change.type || 'polish',
              title: change.description || change.reason || '润色修改',
              description: change.description || change.reason || '润色修改',
              details: change.reason && change.description !== change.reason ? `原因：${change.reason}` : undefined
            })) :
            [{ id: 'no-changes', type: 'success', title: '润色完成，未发现问题', description: '润色完成，文本已优化', details: '文本质量良好，无需进一步润色', severity: 'info' }]
          }
          sectionType="polish"
        />
      ) : null}

      {/* 改写结果（与检查/润色/翻译并列）*/}
      {result.type === 'rewrite' && ((Array.isArray(result.changes) && (result.changes as any[]).length > 0) || result.summary || result.explanation) && (
        <UnifiedResultSection
          title="✏️ 改写结果"
          items={Array.isArray(result.changes) && (result.changes as any[]).length > 0 ?
            (result.changes as any[]).map((change: any, index: number) => ({
              id: `rewrite-change-${index}`,
              type: change.type || 'rewrite',
              title: change.description || change.reason || '内容改写',
              description: change.description || change.reason || '内容改写',
              details: change.reason && change.description !== change.reason ? `原因：${change.reason}` : undefined
            })) :
            [
              ...(result.summary ? [{ id: 'summary', type: 'summary', title: result.summary, description: result.summary }] : []),
              ...(result.explanation ? [{ id: 'explanation', type: 'explanation', title: '解释', description: result.explanation }] : [])
            ]
          }
          sectionType="polish"
        />
      )}

      {/* 翻译场景：术语对照（组件化）*/}
      {result.type === 'translate' && Array.isArray(result.terminology) && result.terminology.length > 0 && (
        <UnifiedResultSection
          title="📚 术语对照"
          items={(result.terminology as any[]).map((term: any, index: number) => ({
            id: `terminology-${index}`,
            type: 'terminology',
            title: `${term.original} → ${term.translated}`,
            description: term.note || '术语翻译',
            details: term.note ? `说明：${term.note}` : '术语对照',
            severity: 'info'
          }))}
          sectionType="check"
        />
      )}
    </div>
  );
};