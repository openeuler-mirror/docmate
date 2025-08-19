import { useState, useEffect, useRef } from 'react';
import {
  HostResult,
  ConversationItem,
  OperationState,
  generateId,
  AIResult
} from '@docmate/shared';
import { vscodeApi } from './vscodeApi';
import { ChatWindow } from './components/ChatWindow';
import { InputPanel } from './components/InputPanel';
import { LoadingSpinner } from './components/LoadingSpinner';
import { ErrorMessage } from './components/ErrorMessage';
import { CompactHeader } from './components/CompactHeader';
import { ConfigProvider } from './components/ConfigProvider';
import './App.css';

interface AppState {
  conversations: ConversationItem[];
  operationState: OperationState;
  selectedText: string;
  settings: any;
  isAuthenticated: boolean;
  isConfigured: boolean;
  isCheckingConfig: boolean;
  view: 'chat' | 'config';
  errorInfo?: {
    message: string;
    code?: string;
    suggestion?: string;
  };
  connectionStatus?: {
    isConnected: boolean;
    duration: number;
    retryCount: number;
  };
}

export default function App() {
  const [state, setState] = useState<AppState>({
    conversations: [],
    operationState: {
      isLoading: false,
    },
    selectedText: '',
    settings: null,
    isAuthenticated: true, // 默认允许使用AI功能，不需要登录
    isConfigured: false, // 默认未配置，需要检查
    isCheckingConfig: true, // 正在检查配置状态
    view: 'chat',
  });

  // 添加错误边界
  const [hasError, setHasError] = useState(false);

  // 重试计数器
  const [retryCount, setRetryCount] = useState(0);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

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

      // 检查配置状态
      console.log('App: Sending config status request');
      vscodeApi.postMessage({
        command: 'config',
        payload: { action: 'status' }
      });

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

  // 当配置检查完成且未配置时，自动导航到配置页面
  useEffect(() => {
    if (state.view === 'chat' && !state.isCheckingConfig && !state.isConfigured) {
      navigateTo('config');
    }
  }, [state.view, state.isCheckingConfig, state.isConfigured]);


  /**
   * 处理来自扩展的消息
   */
  const handleMessage = (message: HostResult) => {
    // 优先处理选中文本引用，保证引用组件及时更新
    if (message.command === 'renderResult' && (message as any).payload?.data?.type === 'selectedText') {
      setState(prev => ({ ...prev, selectedText: (message as any).payload?.data?.text || '' }));
      return;
    }

    switch (message.command) {
      case 'renderResult':
        handleRenderResult(message as HostResult);
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
      case 'config':
        handleConfigMessage(message as HostResult);
        break;
    }
  };

  /**
   * 处理配置消息
   */
  const handleConfigMessage = (message: HostResult) => {
    console.log('App: Received config message:', message);
    const result = message.result;

    if (result && result.action === 'status') {
      console.log('App: Processing config status:', result);
      setState(prev => ({
        ...prev,
        isConfigured: result.isConfigured || false,
        isCheckingConfig: false
      }));
    } else if (result && result.action === 'saved') {
      console.log('App: Processing config saved:', result);
      setState(prev => ({
        ...prev,
        isConfigured: true,
        // 只有手动保存才切换视图，自动保存不切换
        view: result.isAutoSave === false ? 'chat' : prev.view
      }));
    }
  };

  /**
   * 处理配置保存完成
   */
  const handleConfigSaved = () => {
    setState(prev => ({
      ...prev,
      isConfigured: true,
      view: 'chat' // 配置保存后，切换回聊天视图
    }));
  };

  /**
   * 处理渲染结果
   */
  const handleRenderResult = (message: HostResult) => {
    const result = message.result as AIResult;

    // 清理重试定时器
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setRetryCount(0);

    if (result) {
      setState(prev => {
        const conversations = [...prev.conversations];
        const lastConversation = conversations[conversations.length - 1];

        // 若已存在上一条对话的结果且标记为 dismissed，则保留 dismissed 状态
        if (lastConversation && lastConversation.results && (lastConversation.results as any).dismissed) {
          (result as any).dismissed = true;
        }

        if (lastConversation && lastConversation.type === 'user') {
          lastConversation.results = result;
        }

        return {
          ...prev,
          conversations,
          operationState: {
            ...prev.operationState,
            isLoading: false,
            error: undefined,
            lastOperation: result.type,
          },
        };
      });
    }
  };


  /**
   * 处理错误
   */
  const handleError = (message: HostResult) => {
    const payload = message.payload;

    // 清理重试定时器
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    setRetryCount(0);

    setState(prev => ({
      ...prev,
      operationState: {
        ...prev.operationState,
        isLoading: false,
        error: payload?.error,
      },
      errorInfo: {
        message: payload?.error || '发生未知错误',
        code: payload?.code,
        suggestion: payload?.suggestion
      }
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
    // 清理之前的定时器
    if (retryTimerRef.current) {
      clearInterval(retryTimerRef.current);
    }

    // 重置重试计数器
    setRetryCount(0);

    // 模拟重试状态更新
    retryTimerRef.current = setInterval(() => {
      setRetryCount(prev => {
        if (prev < 2) { // 最多显示到重试2次
          return prev + 1;
        }
        if (retryTimerRef.current) {
          clearInterval(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        return prev;
      });
    }, 5000); // 每5秒增加一次重试计数

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
   * 取消当前操作
   */
  const cancelOperation = () => {
    // 发送取消命令到扩展
    vscodeApi.postMessage({
      command: 'cancel',
      payload: {}
    });

    // 重置加载状态
    setState(prev => ({
      ...prev,
      operationState: {
        ...prev.operationState,
        isLoading: false,
        error: undefined,
      },
      connectionStatus: undefined
    }));
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

  /**
   * 导航到指定视图
   * @param view 要导航到的视图
   */
  const navigateTo = (view: 'chat' | 'config') => {
    setState(prev => ({
      ...prev,
      view
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

  const renderChatView = () => {
    if (state.isCheckingConfig) {
      return (
        <div className="config-checking">
          <LoadingSpinner message="正在检查配置..." />
        </div>
      );
    }

    if (state.isConfigured) {
      return (
        <>
          <ChatWindow
            conversations={state.conversations}
            onClear={clearConversations}
            onDismissDiff={(conversationId) => {
              setState(prev => {
                const conversations = prev.conversations.map(c =>
                  c.id === conversationId && c.results ? { ...c, results: { ...(c.results as any), dismissed: true } } : c
                );
                return { ...prev, conversations };
              });
            }}
          />

          {state.operationState.isLoading && (
            <LoadingSpinner
              message={`正在${getOperationName(state.operationState.lastOperation)}...`}
              showCancel={true}
              onCancel={cancelOperation}
              retryCount={retryCount}
            />
          )}

          <InputPanel
            selectedText={state.selectedText}
            onExecute={executeOperation}
            disabled={state.operationState.isLoading}
            authRequired={false}
          />
        </>
      );
    }
    // 如果未配置，useEffect 会处理导航，这里返回 null
    return null;
  };

  const renderContent = () => {
    switch (state.view) {
      case 'config':
        return <ConfigProvider onConfigSaved={handleConfigSaved} onBack={() => navigateTo('chat')} />;
      case 'chat':
        return renderChatView();
      default:
        // 作为后备，可以渲染一个空状态或错误
        return null;
    }
  };

  return (
    <div className="app">
      <CompactHeader
        onClear={clearConversations}
        onRefresh={refresh}
        hasConversations={state.conversations.length > 0}
        onAuthChange={handleAuthChange}
        onNavigateToConfig={() => navigateTo('config')}
      />

      {state.errorInfo && (
        <ErrorMessage
          message={state.errorInfo.message}
          code={state.errorInfo.code}
          suggestion={state.errorInfo.suggestion}
          onDismiss={() => setState(prev => ({
            ...prev,
            operationState: {
              ...prev.operationState,
              error: undefined,
            },
            errorInfo: undefined
          }))}
        />
      )}

      <div className="app-content">
        {renderContent()}
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
