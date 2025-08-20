// ErrorMessage component

interface ErrorMessageProps {
  message: string;
  code?: string;
  suggestion?: string;
  onDismiss: () => void;
}

export function ErrorMessage({ message, code, suggestion, onDismiss }: ErrorMessageProps) {
  console.log('ErrorMessage: Rendering with props:', { message, code, suggestion });

  const getErrorIcon = (errorCode?: string | number) => {
    if (!errorCode) return '❌';

    const codeStr = String(errorCode);

    if (codeStr.includes('NETWORK') || codeStr.includes('CONNECTION') || codeStr === '20') {
      return '🌐';
    } else if (codeStr.includes('CONFIG') || codeStr.includes('API_KEY')) {
      return '⚙️';
    } else if (codeStr.includes('TEXT') || codeStr.includes('EDITOR')) {
      return '📝';
    } else if (codeStr.includes('AUTH')) {
      return '🔐';
    }

    return '❌';
  };

  const getErrorClass = (errorCode?: string | number) => {
    if (!errorCode) return 'error-message';

    const codeStr = String(errorCode);

    if (codeStr.includes('NETWORK') || codeStr.includes('CONNECTION') || codeStr === '20') {
      return 'error-message network-error';
    } else if (codeStr.includes('CONFIG') || codeStr.includes('API_KEY')) {
      return 'error-message config-error';
    } else if (codeStr.includes('TEXT') || codeStr.includes('EDITOR')) {
      return 'error-message user-error';
    } else if (codeStr.includes('AUTH')) {
      return 'error-message auth-error';
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
