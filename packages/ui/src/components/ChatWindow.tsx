import { ConversationItem } from '@docmate/shared';
import { Message } from './Message';
import { UnifiedResultCard } from './UnifiedResultCard';

interface ChatWindowProps {
  conversations: ConversationItem[];
  onClear: () => void;
  onDismissDiff: (conversationId: string) => void;
}

export function ChatWindow({ conversations, onDismissDiff }: ChatWindowProps) {
  return (
    <div className="chat-window">
      <div className="chat-content">
        {conversations.length === 0 ? (
          <div className="empty-state">
            <div className="welcome-icon">💬</div>
            <h3>开始对话</h3>
            <p>选择文本并使用下方的功能按钮，或直接输入文本开始使用 DocMate。</p>
          </div>
        ) : (
          <div className="conversation-list">
            {conversations.map(conversation => (
              <div key={conversation.id} className="conversation-item">
                <Message
                  type={conversation.type}
                  content={conversation.content}
                  timestamp={conversation.timestamp}
                  operation={conversation.operation}
                />

                {conversation.results && (
                  <UnifiedResultCard
                    result={conversation.results}
                    onDismissDiff={() => onDismissDiff(conversation.id)}
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
