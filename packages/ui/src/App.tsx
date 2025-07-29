import { useState, useEffect } from 'react';
import {
  HostResult,
  ConversationItem,
  OperationState,
  generateId
} from '@docmate/shared';
import { vscodeApi } from './vscodeApi';
import { ChatWindow } from './components/ChatWindow';
import { InputPanel } from './components/InputPanel';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { CompactHeader } from './components/CompactHeader';
import './App.css';

interface AppState {
  conversations: ConversationItem[];
  operationState: OperationState;
  selectedText: string;
  settings: any;
  isAuthenticated: boolean;
}

export default function App() {
  const [state, setState] = useState<AppState>({
    conversations: [],
    operationState: {
      isLoading: false,
    },
    selectedText: '',
    settings: null,
    isAuthenticated: false,
  });

  // 添加错误边界
  const [hasError, setHasError] = useState(false);

  // 处理认证状态变化
  const handleAuthChange = (isAuthenticated: boolean) => {
    setState(prev => ({
      ...prev,
      isAuthenticated
    }));
  };

  useEffect(() => {
    try {
      // 监听来自扩展的消息
      const unsubscribe = vscodeApi.onMessage(handleMessage);

      // 加载初始设置
      vscodeApi.settings('get');

      // 恢复状态
      const savedState = vscodeApi.getState();
      if (savedState) {
        setState(prevState => ({
          ...prevState,
          conversations: savedState.conversations || [],
        }));
      }

      return unsubscribe;
    } catch (error) {
      console.error('App initialization error:', error);
      setHasError(true);
    }
  }, []);

  // 保存状态到VS Code
  useEffect(() => {
    vscodeApi.setState({
      conversations: state.conversations,
    });
  }, [state.conversations]);

  /**
   * 处理来自扩展的消息
   */
  const handleMessage = (message: HostResult) => {
    switch (message.command) {
      case 'renderResult':
        handleRenderResult(message as HostResult);
        break;
      case 'renderCheckResult':
      case 'renderPolishResult':
      case 'renderTranslateResult':
      case 'renderRewriteResult':
        handleExtendedResult(message as HostResult);
        break;
      case 'error':
        handleError(message as HostResult);
        break;
      case 'loading':
        handleLoading(message as HostResult);
        break;
      case 'ready':
        handleReady();
        break;
    }
  };

  /**
   * 处理渲染结果
   */
  const handleRenderResult = (message: HostResult) => {
    const data = message.payload?.data;

    if (data && typeof data === 'object' && 'type' in data && data.type === 'selectedText') {
      setState(prev => ({
        ...prev,
        selectedText: data.text,
      }));
      return;
    }

    const type = message.payload?.type;
    if (type && data) {
      // 将结果附加到最后一个用户消息上，不创建新的助手消息
      setState(prev => {
        const conversations = [...prev.conversations];
        const lastConversation = conversations[conversations.length - 1];

        if (lastConversation && lastConversation.type === 'user') {
          // 将结果附加到最后一个用户消息
          lastConversation.results = data;
        }

        return {
          ...prev,
          conversations,
          operationState: {
            ...prev.operationState,
            isLoading: false,
            error: undefined,
            lastOperation: type,
          },
        };
      });
    }
  };

  /**
   * 处理扩展结果（新的diff格式）
   */
  const handleExtendedResult = (message: HostResult) => {
    if (!message.payload) return;
    const { type, diffs, issues, changes, sourceLang, targetLang, message: resultMessage, success } = message.payload;

    if (type) {
      // 处理fullTranslate的特殊情况
      if (type === 'fullTranslate') {
        // 将结果附加到最后一个用户消息上，保持一致性
        setState(prev => {
          const conversations = [...prev.conversations];
          const lastConversation = conversations[conversations.length - 1];

          if (lastConversation && lastConversation.type === 'user') {
            // 将结果附加到最后一个用户消息
            lastConversation.results = {
              message: resultMessage,
              success,
              sourceLang,
              targetLang,
            };
          }

          return {
            ...prev,
            conversations,
            operationState: {
              ...prev.operationState,
              isLoading: false,
              error: undefined,
              lastOperation: type,
            },
          };
        });
        return;
      }

      // 处理其他有diffs的情况
      if (diffs) {
        // 将结果附加到最后一个用户消息上，不创建新的助手消息
        setState(prev => {
          const conversations = [...prev.conversations];
          const lastConversation = conversations[conversations.length - 1];

          if (lastConversation && lastConversation.type === 'user') {
            // 将结果附加到最后一个用户消息
            lastConversation.results = {
              diffs,
              issues,
              changes,
              sourceLang,
              targetLang,
            };
          }

          return {
            ...prev,
            conversations,
            operationState: {
              ...prev.operationState,
              isLoading: false,
              error: undefined,
              lastOperation: type,
            },
          };
        });
      }
    }
  };

  /**
   * 处理错误
   */
  const handleError = (message: HostResult) => {
    setState(prev => ({
      ...prev,
      operationState: {
        ...prev.operationState,
        isLoading: false,
        error: message.payload?.error,
      },
    }));
  };

  /**
   * 处理加载状态
   */
  const handleLoading = (message: HostResult) => {
    setState(prev => ({
      ...prev,
      operationState: {
        ...prev.operationState,
        isLoading: message.payload?.loading || false,
      },
    }));
  };

  /**
   * 处理就绪状态
   */
  const handleReady = () => {
    console.log('DocMate UI is ready');
  };

  /**
   * 执行操作
   */
  const executeOperation = (operation: string, text: string, options?: any) => {
    // 添加用户输入到对话历史
    const userItem: ConversationItem = {
      id: generateId(),
      type: 'user',
      content: text,
      timestamp: Date.now(),
      operation: operation as any,
    };

    setState(prev => ({
      ...prev,
      conversations: [...prev.conversations, userItem],
      operationState: {
        ...prev.operationState,
        isLoading: true,
        error: undefined,
        lastOperation: operation,
        timestamp: Date.now(),
      },
    }));

    // 发送命令到扩展
    switch (operation) {
      case 'check':
        vscodeApi.check(text, options);
        break;
      case 'polish':
        vscodeApi.polish(text, options);
        break;
      case 'translate':
        vscodeApi.translate(text, options);
        break;
      case 'fullTranslate':
        vscodeApi.postMessage({
          command: 'fullTranslate',
          payload: {
            text: text,
            options: options
          }
        } as any);
        break;
      case 'rewrite':
        vscodeApi.postMessage({
          command: 'rewrite',
          payload: {
            text: text,
            originalText: options?.originalText,
            conversationHistory: options?.conversationHistory || []
          }
        } as any);
        break;
    }
  };

  /**
   * 清除对话历史
   */
  const clearConversations = () => {
    setState(prev => ({
      ...prev,
      conversations: [],
    }));
  };

  /**
   * 清除特定对话的结果
   */
  const dismissResult = (conversationId: string) => {
    setState(prev => ({
      ...prev,
      conversations: prev.conversations.map(conv =>
        conv.id === conversationId
          ? { ...conv, results: undefined }
          : conv
      ),
    }));
  };

  /**
   * 刷新
   */
  const refresh = () => {
    vscodeApi.refresh();
    setState(prev => ({
      ...prev,
      operationState: {
        isLoading: false,
      },
    }));
  };

  if (hasError) {
    return (
      <div className="app">
        <div className="app-header">
          <h2>DocMate Assistant</h2>
        </div>
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <p>❌ 应用初始化失败</p>
          <button onClick={() => window.location.reload()}>重新加载</button>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <CompactHeader
        onClear={clearConversations}
        onRefresh={refresh}
        hasConversations={state.conversations.length > 0}
        onAuthChange={handleAuthChange}
      />

      {state.operationState.error && (
        <ErrorMessage
          message={state.operationState.error}
          onDismiss={() => setState(prev => ({
            ...prev,
            operationState: {
              ...prev.operationState,
              error: undefined,
            },
          }))}
        />
      )}

      <div className="app-content">
        <ChatWindow
          conversations={state.conversations}
          onClear={clearConversations}
          onDismissResult={dismissResult}
        />

        {state.operationState.isLoading && (
          <LoadingSpinner message={`正在${getOperationName(state.operationState.lastOperation)}...`} />
        )}

        <InputPanel
          selectedText={state.selectedText}
          onExecute={executeOperation}
          disabled={state.operationState.isLoading || !state.isAuthenticated}
          authRequired={!state.isAuthenticated}
        />
      </div>
    </div>
  );
}

/**
 * 获取操作名称
 */
function getOperationName(operation?: string): string {
  switch (operation) {
    case 'check':
      return '检查';
    case 'polish':
      return '润色';
    case 'translate':
      return '翻译';
    case 'fullTranslate':
      return '全文翻译';
    case 'rewrite':
      return '改写';
    default:
      return '处理';
  }
}
