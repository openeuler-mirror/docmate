import { ConversationItem } from '@docmate/shared';
import { Message } from './Message';
import { ResultCard } from './ResultCard';

interface ChatWindowProps {
  conversations: ConversationItem[];
  onClear: () => void;
  onDismissResult?: (conversationId: string) => void;
}

export function ChatWindow({ conversations, onClear, onDismissResult }: ChatWindowProps) {
  return (
    <div className="chat-window">
      <div className="chat-header">
        <span className="chat-title">对话历史</span>
        {conversations.length > 0 && (
          <button
            className="clear-button"
            onClick={onClear}
            title="清除历史"
          >
            🗑️
          </button>
        )}
      </div>

      <div className="chat-content">
        {conversations.length === 0 ? (
          <div className="empty-state">
            <p>👋 欢迎使用 DocMate！</p>
            <p>选择文本并使用下方的功能按钮开始使用。</p>
          </div>
        ) : (
          conversations.map(conversation => (
            <div key={conversation.id} className="conversation-item">
              <Message
                type={conversation.type}
                content={conversation.content}
                timestamp={conversation.timestamp}
                operation={conversation.operation}
              />

              {conversation.results && (
                <ResultCard
                  type={conversation.operation!}
                  results={conversation.results}
                  onDismiss={() => onDismissResult?.(conversation.id)}
                />
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
