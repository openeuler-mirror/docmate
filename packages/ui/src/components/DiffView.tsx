import React, { useState, useMemo } from 'react';
import { Diff } from '@docmate/shared';

interface DiffViewProps {
  diffs: Diff[];
  onAccept: (suggestion: string) => void;
  onReject: () => void;
  title?: string;
  showStats?: boolean;
  className?: string;
  showActions?: boolean;
}

interface DiffStats {
  insertions: number;
  deletions: number;
  unchanged: number;
  totalChanges: number;
}

const DiffView: React.FC<DiffViewProps> = ({
  diffs,
  onAccept,
  onReject,
  title = "修改建议",
  showStats = true,
  className = "",
  showActions = true
}) => {
  const [isExpanded] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);

  // 计算diff统计信息
  const stats: DiffStats = useMemo(() => {
    let insertions = 0;
    let deletions = 0;
    let unchanged = 0;

    for (const segment of diffs) {
      switch (segment.type) {
        case 'insert':
          insertions += segment.value.length;
          break;
        case 'delete':
          deletions += segment.value.length;
          break;
        case 'equal':
          unchanged += segment.value.length;
          break;
      }
    }

    return {
      insertions,
      deletions,
      unchanged,
      totalChanges: insertions + deletions
    };
  }, [diffs]);

  // 生成建议文本（应用所有修改后的结果）
  const suggestionText = useMemo(() => {
    return diffs
      .filter(segment => segment.type !== 'delete')
      .map(segment => segment.value)
      .join('');
  }, [diffs]);

  // 检查是否有实际的修改
  const hasChanges = stats.totalChanges > 0;

  // 如果没有修改，不显示DiffView，让ResultCard处理无修改的显示
  if (!hasChanges) {
    return null;
  }

  return (
    <div className={`diff-view ${className}`}>
      <div className="diff-header">
        <div className="diff-title">
          <h3>{title}</h3>
          <span className="spacer" />
        </div>
        
        {showStats && (
          <div className="diff-stats">
            {stats.insertions > 0 && (
              <span className="stat-insertions">+{stats.insertions}</span>
            )}
            {stats.deletions > 0 && (
              <span className="stat-deletions">-{stats.deletions}</span>
            )}
            <span className="stat-total">{stats.totalChanges} 个字符变更</span>
          </div>
        )}
      </div>

      {isExpanded && (
        <>
          <div className="diff-content">
            {/* 原文显示 */}
            <div className="diff-section original-section">
              <div className="diff-section-header">
                <span className="diff-section-title">📝 原文</span>
              </div>
              <div className="diff-text original-text">
                {diffs.filter(d => d.type !== 'insert').map((segment, index) => (
                  <span
                    key={`orig-${index}`}
                    className={`diff-segment ${segment.type === 'delete' ? 'deleted' : 'unchanged'}`}
                  >
                    {segment.value}
                  </span>
                ))}
              </div>
            </div>

            {/* 修改后显示 */}
            <div className="diff-section modified-section">
              <div className="diff-section-header">
                <span className="diff-section-title">✨ 修改后</span>
              </div>
              <div className="diff-text modified-text">
                {diffs.filter(d => d.type !== 'delete').map((segment, index) => (
                  <span
                    key={`mod-${index}`}
                    className={`diff-segment ${segment.type === 'insert' ? 'inserted' : 'unchanged'}`}
                  >
                    {segment.value}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {showActions && (
            <div className="diff-actions">
              <button
                className={`btn btn-accept ${isProcessing ? 'processing' : ''}`}
                onClick={() => {
                  if (!isProcessing) {
                    setIsProcessing(true);
                    onAccept(suggestionText);
                    // 延迟重置状态，给用户反馈时间
                    setTimeout(() => {
                      setIsProcessing(false);
                    }, 1000);
                  }
                }}
                disabled={isProcessing}
                title="接受此修改建议"
              >
                {isProcessing ? '⏳ 已应用' : '✓ 接受'}
              </button>
              <button
                className="btn btn-reject"
                onClick={() => {
                  if (!isProcessing) {
                    onReject();
                  }
                }}
                disabled={isProcessing}
                title="拒绝此修改建议"
              >
                ✗ 拒绝
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DiffView;

// 辅助组件：简化的diff显示（仅显示最终结果）
export const SimpleDiffView: React.FC<{
  original: string;
  modified: string;
  onAccept: (text: string) => void;
  onReject: () => void;
}> = ({ original, modified, onAccept, onReject }) => {
  const [showDiff, setShowDiff] = useState(false);

  if (original === modified) {
    return (
      <div className="simple-diff-view no-changes">
        <p>无需修改</p>
      </div>
    );
  }

  return (
    <div className="simple-diff-view">
      <div className="simple-diff-header">
        <button 
          className="toggle-diff"
          onClick={() => setShowDiff(!showDiff)}
        >
          {showDiff ? '隐藏' : '显示'}差异对比
        </button>
      </div>

      {showDiff ? (
        <div className="diff-comparison">
          <div className="original-text">
            <h4>原文：</h4>
            <pre>{original}</pre>
          </div>
          <div className="modified-text">
            <h4>修改后：</h4>
            <pre>{modified}</pre>
          </div>
        </div>
      ) : (
        <div className="result-text">
          <h4>修改结果：</h4>
          <div className="text-content">{modified}</div>
        </div>
      )}

      <div className="simple-diff-actions">
        <button 
          className="btn btn-accept"
          onClick={() => onAccept(modified)}
        >
          接受修改
        </button>
        <button 
          className="btn btn-reject"
          onClick={onReject}
        >
          拒绝修改
        </button>
      </div>
    </div>
  );
};
