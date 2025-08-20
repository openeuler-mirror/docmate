// 本地格式化时间戳函数
const formatTimestamp = (timestamp: number): string => {
  return new Date(timestamp).toLocaleString();
};

interface MessageProps {
  type: 'user' | 'assistant';
  content: string;
  timestamp: number;
  operation?: string;
}

export function Message({ type, content, timestamp, operation }: MessageProps) {
  const getOperationIcon = (op?: string) => {
    switch (op) {
      case 'check':
        return '🔍';
      case 'polish':
        return '✨';
      case 'translate':
        return '🌐';
      case 'rewrite':
        return '✏️';
      default:
        return '💬';
    }
  };

  const getOperationName = (op?: string) => {
    switch (op) {
      case 'check':
        return '检查';
      case 'polish':
        return '润色';
      case 'translate':
        return '翻译';
      case 'rewrite':
        return '改写';
      default:
        return '';
    }
  };

  return (
    <div className={`message-container ${type}`}>
      <div className="message-bubble">
        {/* 操作标识和时间戳 */}
        {(operation || type === 'assistant') && (
          <div className="message-meta">
            {operation && (
              <span className="operation-badge">
                {getOperationIcon(operation)} {getOperationName(operation)}
              </span>
            )}
            <span className="timestamp">
              {formatTimestamp(timestamp)}
            </span>
          </div>
        )}

        {/* 消息内容 */}
        <div className="message-content">
          {type === 'user' ? (
            <div className="user-text">
              {content}
            </div>
          ) : (
            <div className="assistant-text">
              {content}
            </div>
          )}
        </div>

        {/* 用户消息的时间戳 */}
        {type === 'user' && !operation && (
          <div className="message-meta user-meta">
            <span className="timestamp">
              {formatTimestamp(timestamp)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
