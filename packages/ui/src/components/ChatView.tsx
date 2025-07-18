import React, { useState, useEffect, useRef } from 'react';
import { ChatMessage, DiffSegment, ExtendedUICommand } from '@docmate/shared';
import { vscodeApi } from '../vscodeApi';
import DiffView from './DiffView';

interface ChatViewProps {
  initialHistory?: ChatMessage[];
  originalText?: string;
}

const ChatView: React.FC<ChatViewProps> = ({ 
  initialHistory = [], 
  originalText = '' 
}) => {
  const [messages, setMessages] = useState<ChatMessage[]>(initialHistory);
  const [currentDiff, setCurrentDiff] = useState<DiffSegment[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, currentDiff]);

  // 监听来自extension的消息
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      
      switch (message.command) {
        case 'renderRewriteResult':
          const { diffs, conversation, conversationId: newConversationId } = message.payload;
          if (conversation) {
            setMessages(conversation);
          }
          setCurrentDiff(diffs);
          if (newConversationId) {
            setConversationId(newConversationId);
          }
          setIsLoading(false);
          break;
          
        case 'loading':
          setIsLoading(message.payload.loading);
          break;
          
        case 'error':
          setIsLoading(false);
          // 可以添加错误处理
          console.error('Chat error:', message.payload.error);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSendMessage = (text: string) => {
    if (!text.trim()) return;

    const newMessage: ChatMessage = {
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    };

    const updatedMessages = [...messages, newMessage];
    setMessages(updatedMessages);
    setIsLoading(true);
    setCurrentDiff(null); // 清除之前的diff

    // 发送消息到extension
    vscodeApi.postMessage({
      command: 'rewrite',
      payload: {
        text: text,
        conversationHistory: updatedMessages,
        originalText: originalText,
      },
    } as ExtendedUICommand);
  };

  const handleAccept = (suggestion: string) => {
    vscodeApi.postMessage({
      command: 'applySuggestion',
      payload: { text: suggestion },
    } as ExtendedUICommand);
    setCurrentDiff(null);
  };

  const handleReject = () => {
    setCurrentDiff(null);
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="chat-view">
      <div className="chat-header">
        <h3>对话式改写</h3>
        {conversationId && (
          <div className="conversation-info">
            <span>会话ID: {conversationId.slice(-8)}</span>
          </div>
        )}
        {originalText && (
          <div className="original-text-preview">
            <span>原文：</span>
            <span className="text-preview">
              {originalText.length > 50
                ? originalText.substring(0, 50) + '...'
                : originalText}
            </span>
          </div>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 ? (
          <div className="empty-state">
            <p>开始对话来改写您的文本</p>
            <div className="suggestions">
              <button 
                className="suggestion-btn"
                onClick={() => handleSendMessage('让这段文字更简洁')}
              >
                让这段文字更简洁
              </button>
              <button 
                className="suggestion-btn"
                onClick={() => handleSendMessage('改为更正式的语调')}
              >
                改为更正式的语调
              </button>
              <button 
                className="suggestion-btn"
                onClick={() => handleSendMessage('增加更多技术细节')}
              >
                增加更多技术细节
              </button>
            </div>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div key={index} className={`message ${msg.role}`}>
              <div className="message-header">
                <span className="role">
                  {msg.role === 'user' ? '您' : 'AI助手'}
                </span>
                <span className="timestamp">
                  {formatTimestamp(msg.timestamp)}
                </span>
              </div>
              <div className="message-content">
                {msg.content}
              </div>
            </div>
          ))
        )}

        {isLoading && (
          <div className="message assistant loading">
            <div className="message-header">
              <span className="role">AI助手</span>
            </div>
            <div className="message-content">
              <div className="loading-dots">
                <span></span>
                <span></span>
                <span></span>
              </div>
              正在处理您的请求...
            </div>
          </div>
        )}

        {currentDiff && (
          <div className="diff-container">
            <DiffView
              diffs={currentDiff}
              onAccept={handleAccept}
              onReject={handleReject}
              title="改写结果"
            />
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input">
        <ChatInputPanel
          onSendMessage={handleSendMessage}
          disabled={isLoading}
          placeholder="描述您希望如何改写文本..."
        />
      </div>
    </div>
  );
};

// 简单的聊天输入组件
const ChatInputPanel: React.FC<{
  onSendMessage: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ onSendMessage, disabled = false, placeholder = "输入消息..." }) => {
  const [inputText, setInputText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputText.trim() && !disabled) {
      onSendMessage(inputText.trim());
      setInputText('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="chat-input-form">
      <div className="input-container">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyPress={handleKeyPress}
          placeholder={placeholder}
          disabled={disabled}
          className="chat-textarea"
          rows={1}
        />
        <button
          type="submit"
          disabled={disabled || !inputText.trim()}
          className="send-button"
        >
          发送
        </button>
      </div>
    </form>
  );
};

export default ChatView;
