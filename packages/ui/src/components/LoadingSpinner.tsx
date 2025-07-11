// LoadingSpinner component

interface LoadingSpinnerProps {
  message?: string;
}

export function LoadingSpinner({ message = '处理中...' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner">
      <div className="spinner-container">
        <div className="spinner"></div>
        <span className="loading-message">{message}</span>
      </div>
    </div>
  );
}
