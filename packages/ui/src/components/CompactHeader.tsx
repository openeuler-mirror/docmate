import { AuthStatus } from './AuthStatus';

interface CompactHeaderProps {
  onClear: () => void;
  onRefresh: () => void;
  hasConversations: boolean;
  onAuthChange: (isAuthenticated: boolean) => void;
  onNavigateToConfig: () => void;
}

export function CompactHeader({
  onClear,
  onRefresh,
  hasConversations,
  onAuthChange,
  onNavigateToConfig,
}: CompactHeaderProps) {
  return (
    <div className="compact-header">
      <div className="header-left">
        <h2 className="app-title">DocMate</h2>
      </div>
      
      <div className="header-center">
        <AuthStatus onAuthChange={onAuthChange} />
      </div>
      
      <div className="header-right">
        {hasConversations && (
          <button
            className="header-action-button clear-button"
            onClick={onClear}
            title="清除对话历史"
          >
            🗑️
          </button>
        )}
        <button
          className="header-action-button refresh-button"
          onClick={onRefresh}
          title="刷新"
        >
          🔄
        </button>
        <button
          className="header-action-button config-button"
          onClick={onNavigateToConfig}
          title="设置"
        >
          ⚙️
        </button>
      </div>
    </div>
  );
}
