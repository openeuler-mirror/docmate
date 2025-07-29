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

export function ResultCard({ type, results, onDismiss }: ResultCardProps) {

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
    };

    const handleAccept = (suggestion: string) => {
      console.log('ResultCard: handleAccept called with suggestion:', suggestion);
      console.log('ResultCard: Sending applySuggestion command to extension...');

      try {
        vscodeApi.postMessage({
          command: 'applySuggestion',
          payload: { text: suggestion }
        } as any);
        console.log('ResultCard: applySuggestion command sent successfully');

        // 接受建议后，隐藏结果卡片
        if (onDismiss) {
          onDismiss();
        }
      } catch (error) {
        console.error('ResultCard: Failed to send applySuggestion command:', error);
      }
    };

    const handleReject = () => {
      console.log('Suggestion rejected');
      if (onDismiss) {
        onDismiss();
      }
    };

    // 检测是否有实际的diff修改
    const hasDiffChanges = diffResults.diffs && diffResults.diffs.length > 0 && hasActualChanges(diffResults.diffs);
    const hasNoChanges = diffResults.diffs && diffResults.diffs.length > 0 && !hasActualChanges(diffResults.diffs);

    return (
      <div className="result-card">
        {/* 只有当有实际修改时才显示DiffView */}
        {hasDiffChanges && diffResults.diffs && (
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
