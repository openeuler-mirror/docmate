// LoadingSpinner component
import { useState, useEffect } from 'react';

interface LoadingSpinnerProps {
  message?: string;
  showCancel?: boolean;
  onCancel?: () => void;
  showConnectionStatus?: boolean;
  connectionDuration?: number;
  retryCount?: number;
}

export function LoadingSpinner({
  message = '处理中...',
  showCancel = false,
  onCancel,
  showConnectionStatus = false,
  connectionDuration = 0,
  retryCount = 0
}: LoadingSpinnerProps) {
  const [elapsedTime, setElapsedTime] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedTime(prev => prev + 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const formatDuration = (seconds: number) => {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  // 构建状态信息
  const buildStatusText = () => {
    let parts = [message];

    // 添加运行时间
    parts.push(`运行时间: ${formatDuration(elapsedTime)}`);

    // 添加连接状态信息
    if (showConnectionStatus && connectionDuration > 0) {
      parts.push(`连接: ${formatDuration(Math.floor(connectionDuration / 1000))}`);
    }

    // 添加重试信息
    if (retryCount > 0) {
      parts.push(`重试: ${retryCount}/3`);
    }

    return parts.join(' • ');
  };

  return (
    <div className="loading-spinner">
      <div className="spinner-container">
        <div className="spinner"></div>
        <div className="loading-content">
          <span className="loading-message">{buildStatusText()}</span>

          {showCancel && onCancel && (
            <button
              className="cancel-button"
              onClick={onCancel}
              title="取消操作"
            >
              取消
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
