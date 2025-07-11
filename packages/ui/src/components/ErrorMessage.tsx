// ErrorMessage component

interface ErrorMessageProps {
  message: string;
  onDismiss: () => void;
}

export function ErrorMessage({ message, onDismiss }: ErrorMessageProps) {
  return (
    <div className="error-message">
      <div className="error-content">
        <span className="error-icon">❌</span>
        <span className="error-text">{message}</span>
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
