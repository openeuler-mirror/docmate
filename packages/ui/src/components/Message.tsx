import { formatTimestamp } from '@docmate/shared';

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
      default:
        return '';
    }
  };

  return (
    <div className={`message ${type}`}>
      <div className="message-header">
        <span className="message-type">
          {type === 'user' ? '👤' : '🤖'}
          {type === 'user' ? '用户' : 'DocMate'}
        </span>
        {operation && (
          <span className="message-operation">
            {getOperationIcon(operation)} {getOperationName(operation)}
          </span>
        )}
        <span className="message-timestamp">
          {formatTimestamp(timestamp)}
        </span>
      </div>

      <div className="message-content">
        {type === 'user' ? (
          <div className="user-text">
            "{content}"
          </div>
        ) : (
          <div className="assistant-text">
            {content}
          </div>
        )}
      </div>
    </div>
  );
}
