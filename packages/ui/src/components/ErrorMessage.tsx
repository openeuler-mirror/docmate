// ErrorMessage component

interface ErrorMessageProps {
  message: string;
  code?: string;
  suggestion?: string;
  onDismiss: () => void;
}

export function ErrorMessage({ message, code, suggestion, onDismiss }: ErrorMessageProps) {
  const getErrorIcon = (errorCode?: string) => {
    if (!errorCode) return '❌';

    if (errorCode.includes('NETWORK') || errorCode.includes('CONNECTION')) {
      return '🌐';
    } else if (errorCode.includes('CONFIG') || errorCode.includes('API_KEY')) {
      return '⚙️';
    } else if (errorCode.includes('TEXT') || errorCode.includes('EDITOR')) {
      return '📝';
    } else if (errorCode.includes('AUTH')) {
      return '🔐';
    }

    return '❌';
  };

  const getErrorClass = (errorCode?: string) => {
    if (!errorCode) return 'error-message';

    if (errorCode.includes('NETWORK') || errorCode.includes('CONNECTION')) {
      return 'error-message network-error';
    } else if (errorCode.includes('CONFIG') || errorCode.includes('API_KEY')) {
      return 'error-message config-error';
    } else if (errorCode.includes('TEXT') || errorCode.includes('EDITOR')) {
      return 'error-message user-error';
    }

    return 'error-message';
  };

  return (
    <div className={getErrorClass(code)}>
      <div className="error-content">
        <span className="error-icon">{getErrorIcon(code)}</span>
        <div className="error-details">
          <span className="error-text">{message}</span>
          {suggestion && (
            <span className="error-suggestion">💡 {suggestion}</span>
          )}
        </div>
        <button
          className="error-dismiss"
          onClick={onDismiss}
          title="关闭"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
