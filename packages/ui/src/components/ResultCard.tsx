import { useState } from 'react';
import {
  DiffSegment,
  CheckResultItem,
  PolishResultItem,
  TranslateResultItem
} from '@docmate/shared';
import DiffView from './DiffView';
import { UnifiedResultSection } from './UnifiedResultSection';
import { vscodeApi } from '../vscodeApi';

interface ResultCardProps {
  type: 'check' | 'polish' | 'translate' | 'fullTranslate' | 'rewrite';
  results: CheckResultItem[] | PolishResultItem[] | TranslateResultItem[] | {
    diffs?: DiffSegment[];
    issues?: any[];
    changes?: any[];
    sourceLang?: string;
    targetLang?: string;
    message?: string;
    success?: boolean;
  };
  onDismiss?: () => void;
}

// 这些辅助函数已移至UnifiedResultSection组件中

export function ResultCard({ type, results }: ResultCardProps) {
  // 检查是否已经被处理过
  const isDismissed = results && typeof results === 'object' && !Array.isArray(results) && (results as any).dismissed;

  // 控制DiffView的显示状态，如果已经被处理过则默认隐藏
  const [showDiffView, setShowDiffView] = useState(!isDismissed);

  const getTypeTitle = (type: string) => {
    switch (type) {
      case 'check':
        return '检查结果';
      case 'polish':
        return '润色结果';
      case 'translate':
        return '翻译结果';
      default:
        return '处理结果';
    }
  };

  // 检测diffs是否有实际修改
  const hasActualChanges = (diffs: DiffSegment[]) => {
    if (!diffs || diffs.length === 0) return false;

    let totalChanges = 0;
    for (const segment of diffs) {
      if (segment.type === 'insert' || segment.type === 'delete') {
        totalChanges += segment.value.length;
      }
    }

    return totalChanges > 0;
  };

  // 检查是否是新的对象格式（而不是旧的数组格式）
  const isObjectFormat = results && typeof results === 'object' && !Array.isArray(results);

  if (isObjectFormat) {
    const diffResults = results as {
      diffs?: DiffSegment[];
      issues?: any[];
      changes?: any[];
      sourceLang?: string;
      targetLang?: string;
      message?: string;
      success?: boolean;
      summary?: string;
      explanation?: string;
      suggestions?: string;
      terminology?: any[];
    };

    const handleAccept = (suggestion: string) => {
      console.log('ResultCard: handleAccept called with suggestion:', suggestion);
      console.log('ResultCard: Sending applySuggestion command to extension...');

      try {
        // 需要传递原文信息以便精确替换
        const originalText = diffResults.diffs ?
          diffResults.diffs.filter(d => d.type !== 'insert').map(d => d.value).join('') : '';

        vscodeApi.postMessage({
          command: 'applySuggestion',
          payload: {
            text: suggestion,
            originalText: originalText
          }
        } as any);
        console.log('ResultCard: applySuggestion command sent successfully');

        // 接受建议后，只隐藏DiffView，保留说明部分
        setShowDiffView(false);
      } catch (error) {
        console.error('ResultCard: Failed to send applySuggestion command:', error);
      }
    };

    const handleReject = () => {
      console.log('Suggestion rejected');
      // 拒绝建议后，也隐藏DiffView，保留说明部分
      setShowDiffView(false);
    };

    // 检测是否有实际的diff修改
    const hasDiffChanges = diffResults.diffs && diffResults.diffs.length > 0 && hasActualChanges(diffResults.diffs);
    const hasNoChanges = diffResults.diffs && diffResults.diffs.length > 0 && !hasActualChanges(diffResults.diffs);

    return (
      <div className="result-card">
        {/* 只有当有实际修改且showDiffView为true时才显示DiffView */}
        {hasDiffChanges && diffResults.diffs && showDiffView && (
          <DiffView
            diffs={diffResults.diffs}
            onAccept={handleAccept}
            onReject={handleReject}
            title={getTypeTitle(type)}
          />
        )}

        {/* 检查结果 */}
        {(diffResults.issues && diffResults.issues.length > 0) || (hasNoChanges && type === 'check') ? (
          <UnifiedResultSection
            title="🔍 检查结果"
            items={diffResults.issues && diffResults.issues.length > 0 ?
              diffResults.issues.map((issue: any, index: number) => ({
                id: `issue-${index}`,
                type: issue.category || 'general',
                title: issue.message,
                description: issue.message,
                details: issue.suggestion ? `建议：${issue.suggestion}` : undefined,
                severity: issue.severity || 'warning'
              })) :
              [{
                id: 'no-issues',
                type: 'success',
                title: '检查完成，未发现问题',
                description: '检查完成，未发现问题',
                details: '您的文本符合规范，无需修改',
                severity: 'info'
              }]
            }
            sectionType="check"
          />
        ) : null}

        {/* 润色结果 */}
        {(diffResults.changes && diffResults.changes.length > 0) || (hasNoChanges && type === 'polish') ? (
          <UnifiedResultSection
            title="✨ 润色结果"
            items={diffResults.changes && diffResults.changes.length > 0 ?
              diffResults.changes.map((change: any, index: number) => ({
                id: `change-${index}`,
                type: change.type || 'polish',
                title: change.description,
                description: change.description,
                details: change.reason ? `原因：${change.reason}` : undefined
              })) :
              [{
                id: 'no-changes',
                type: 'success',
                title: '润色完成，未发现问题',
                description: '润色完成，文本已优化',
                details: '您的文本质量良好，无需进一步润色',
                severity: 'info'
              }]
            }
            sectionType="polish"
          />
        ) : null}

        {/* 改写结果 */}
        {type === 'rewrite' && (diffResults.changes || diffResults.summary || diffResults.explanation) ? (
          <UnifiedResultSection
            title="✏️ 改写结果"
            items={diffResults.changes && diffResults.changes.length > 0 ?
              diffResults.changes.map((change: any, index: number) => ({
                id: `rewrite-change-${index}`,
                type: change.type || 'rewrite',
                title: change.description || change.reason || '内容改写',
                description: change.description || change.reason || '内容改写',
                details: change.reason && change.description !== change.reason ? `原因：${change.reason}` : undefined
              })) :
              diffResults.summary ? [{
                id: 'rewrite-summary',
                type: 'rewrite',
                title: diffResults.summary,
                description: diffResults.summary,
                details: diffResults.explanation ? `说明：${diffResults.explanation}` : undefined
              }] : [{
                id: 'rewrite-completed',
                type: 'success',
                title: '改写完成',
                description: '文本已按要求进行改写',
                details: diffResults.suggestions ? `建议：${diffResults.suggestions}` : undefined,
                severity: 'info'
              }]
            }
            sectionType="polish"
          />
        ) : null}

        {/* 翻译结果 */}
        {(type === 'translate' || type === 'fullTranslate') && (diffResults.sourceLang || diffResults.targetLang) ? (
          <UnifiedResultSection
            title="🌐 翻译结果"
            items={
              // 基本翻译信息
              [{
                id: 'translation-info',
                type: 'translate',
                title: `翻译为${diffResults.targetLang || '目标语言'}`,
                description: `已将文本从${diffResults.sourceLang || '源语言'}翻译为${diffResults.targetLang || '目标语言'}`,
                details: '翻译已完成，请查看上方的对比结果',
                severity: 'info' as const
              }].concat(
                // 术语对照列表
                diffResults.terminology && diffResults.terminology.length > 0 ?
                  diffResults.terminology.map((term: any, index: number) => ({
                    id: `terminology-${index}`,
                    type: 'terminology',
                    title: `${term.original} → ${term.translated}`,
                    description: term.note || '术语翻译',
                    details: term.note ? `说明：${term.note}` : '术语对照',
                    severity: 'info' as const
                  })) : []
              )
            }
            sectionType="check"
          />
        ) : null}

        {/* 处理只有消息的情况（如fullTranslate） */}
        {diffResults.message && !diffResults.diffs && !diffResults.issues && !diffResults.changes && (
          <div className="result-message">
            <p>{diffResults.message}</p>
            {diffResults.sourceLang && diffResults.targetLang && (
              <div className="language-info">
                <span>翻译语言：{diffResults.sourceLang} → {diffResults.targetLang}</span>
              </div>
            )}
          </div>
        )}

        {/* 重复的无修改处理已移除，统一使用UnifiedResultSection */}
      </div>
    );
  }

  // 处理旧的数组格式（向后兼容）
  console.warn('ResultCard: 收到旧格式的结果数据，建议更新为新的diff格式');

  return (
    <div className="result-card">
      <div className="legacy-format-notice">
        <p>⚠️ 检测到旧格式的结果数据，请更新后端以使用新的diff格式。</p>
      </div>
    </div>
  );
}
