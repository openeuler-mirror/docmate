import { useState, useEffect } from 'react';
import { vscodeApi } from '../vscodeApi';

interface AuthState {
  isAuthenticated: boolean;
  status: string;
  userInfo: {
    username?: string;
    email?: string;
    photo?: string;
  } | null;
}

interface AuthStatusProps {
  onAuthChange?: (isAuthenticated: boolean) => void;
}

export function AuthStatus({ onAuthChange }: AuthStatusProps) {
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    status: 'not_authenticated',
    userInfo: null
  });
  const [isLoading, setIsLoading] = useState(false);

  // 检查认证状态
  const checkAuthStatus = async () => {
    try {
      setIsLoading(true);
      vscodeApi.postMessage({
        command: 'auth',
        payload: { action: 'status' }
      });
    } catch (error) {
      console.error('Failed to check auth status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // 处理登录
  const handleLogin = () => {
    vscodeApi.postMessage({
      command: 'auth',
      payload: { action: 'login' }
    });
  };

  // 处理登出
  const handleLogout = () => {
    vscodeApi.postMessage({
      command: 'auth',
      payload: { action: 'logout' }
    });
  };

  // 显示认证状态详情
  const showAuthDetails = () => {
    vscodeApi.postMessage({
      command: 'auth',
      payload: { action: 'showStatus' }
    });
  };

  // 监听认证状态变化
  useEffect(() => {
    const unsubscribe = vscodeApi.onMessage((message) => {
      if (message.command === 'auth' && message.result) {
        const newAuthState = {
          isAuthenticated: message.result.isAuthenticated || false,
          status: message.result.status || 'not_authenticated',
          userInfo: message.result.userInfo || null
        };
        setAuthState(prevState => {
          // 只有状态真正改变时才调用回调
          if (prevState.isAuthenticated !== newAuthState.isAuthenticated) {
            onAuthChange?.(newAuthState.isAuthenticated);
          }
          return newAuthState;
        });
      }
    });

    return unsubscribe;
  }, []);

  // 初始检查认证状态 - 只在组件挂载时执行一次
  useEffect(() => {
    checkAuthStatus();
  }, []);

  if (isLoading) {
    return (
      <div className="auth-status loading">
        <div className="auth-spinner"></div>
        <span>检查登录状态...</span>
      </div>
    );
  }

  if (authState.isAuthenticated && authState.userInfo) {
    return (
      <div className="auth-status authenticated">
        <div className="user-info" onClick={showAuthDetails}>
          {authState.userInfo.photo && (
            <img 
              src={authState.userInfo.photo} 
              alt="用户头像" 
              className="user-avatar"
            />
          )}
          <div className="user-details">
            <div className="username">{authState.userInfo.username}</div>
            <div className="user-email">{authState.userInfo.email}</div>
          </div>
        </div>
        <button 
          className="auth-button logout" 
          onClick={handleLogout}
          title="登出"
        >
          登出
        </button>
      </div>
    );
  }

  return (
    <div className="auth-status not-authenticated">
      <div className="auth-message">
        <span>需要登录openEuler账户才能使用AI功能</span>
      </div>
      <button 
        className="auth-button login" 
        onClick={handleLogin}
        title="登录openEuler账户"
      >
        立即登录
      </button>
    </div>
  );
}


