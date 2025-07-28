import { useState } from 'react';

interface InputPanelProps {
  selectedText: string;
  onExecute: (operation: string, text: string, options?: any) => void;
  disabled: boolean;
  authRequired?: boolean;
}

export function InputPanel({ selectedText, onExecute, disabled, authRequired = false }: InputPanelProps) {
  const [inputText, setInputText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('en-US');

  // 判断是否有选中文本
  const hasSelectedText = selectedText && selectedText.trim().length > 0;
  const currentText = hasSelectedText ? selectedText : inputText;

  // 生成选中文本的引用显示
  const getSelectedTextReference = () => {
    if (!hasSelectedText) return '';
    const preview = selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText;
    return `> ${preview}`;
  };

  const handleCheck = () => {
    if (!currentText.trim()) return;
    onExecute('check', currentText);
  };

  const handlePolish = () => {
    if (!currentText.trim()) return;
    onExecute('polish', currentText);
  };

  const handleTranslate = () => {
    if (!currentText.trim()) return;
    // 如果有选中文本，使用普通翻译；如果是全文，使用fullTranslate（会新建文档）
    const command = hasSelectedText ? 'translate' : 'fullTranslate';
    onExecute(command, currentText, { targetLanguage });
  };

  const handleSubmit = () => {
    if (!inputText.trim()) return;

    if (hasSelectedText) {
      // 有选中文本时，将输入作为改写指令
      onExecute('rewrite', inputText, {
        originalText: selectedText,
        conversationHistory: []
      });
    } else {
      // 没有选中文本时，将输入作为要处理的文本
      // 这种情况下用户应该使用上面的按钮
      return;
    }

    setInputText('');
  };

  return (
    <div className="input-panel">
      {/* 认证提示 */}
      {authRequired && (
        <div className="auth-required-notice">
          <div className="notice-icon">🔒</div>
          <div className="notice-text">
            <div className="notice-title">需要登录</div>
            <div className="notice-description">请先登录openEuler账户以使用AI功能</div>
          </div>
        </div>
      )}

      {/* 选中文本引用显示 */}
      {hasSelectedText && (
        <div className="selected-text-reference" title={selectedText}>
          <div className="reference-label">📄 选中文本引用：</div>
          <div className="reference-content">{getSelectedTextReference()}</div>
        </div>
      )}

      {/* 统一输入框 */}
      <div className="unified-input-section">
        <div className="input-container">
          <textarea
            className="unified-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder={
              hasSelectedText
                ? "输入改写指令，例如：让这段文字更简洁、改为更正式的语调..."
                : "输入要处理的文本，或在编辑器中选择文本后输入改写指令..."
            }
            disabled={disabled}
            rows={hasSelectedText ? 2 : 4}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && inputText.trim()) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          {hasSelectedText && (
            <button
              className="submit-button"
              onClick={handleSubmit}
              disabled={disabled || !inputText.trim()}
              title="发送改写指令"
            >
              💬 改写
            </button>
          )}
        </div>
      </div>

      <div className="action-buttons">
        {/* 主要操作按钮 */}
        <div className="primary-actions">
          <button
            className="action-button check-button"
            onClick={handleCheck}
            disabled={disabled || !currentText.trim()}
            title={hasSelectedText ? "检查选中文本的术语、语法和风格问题" : "检查输入文本的术语、语法和风格问题"}
          >
            🔍 {hasSelectedText ? '检查选中' : '检查文本'}
          </button>

          <button
            className="action-button polish-button"
            onClick={handlePolish}
            disabled={disabled || !currentText.trim()}
            title={hasSelectedText ? "润色选中文本，提高表达质量" : "润色输入文本，提高表达质量"}
          >
            ✨ {hasSelectedText ? '润色选中' : '润色文本'}
          </button>

          <button
            className="action-button translate-button"
            onClick={handleTranslate}
            disabled={disabled || !currentText.trim()}
            title={hasSelectedText ? "翻译选中文本" : "翻译输入文本并新建文档"}
          >
            🌐 {hasSelectedText ? '翻译选中' : '翻译文本'}
          </button>
        </div>

        {/* 翻译语言选择 */}
        <div className="translate-options">
          <label className="language-label">翻译目标语言：</label>
          <select
            className="language-select"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            disabled={disabled}
          >
            <option value="en-US">🇺🇸 English</option>
            <option value="zh-CN">🇨🇳 中文</option>
            <option value="ja">🇯🇵 日语</option>
            <option value="ko">🇰🇷 韩语</option>
            <option value="fr">🇫🇷 法语</option>
            <option value="de">🇩🇪 德语</option>
            <option value="es">🇪🇸 西班牙语</option>
            <option value="ru">🇷🇺 俄语</option>
          </select>
        </div>


      </div>

      <div className="tips">
        <div className="tip-item">
          💡 <strong>提示：</strong>在编辑器中选择文本后，可以直接使用功能按钮
        </div>
        <div className="tip-item">
          ⚙️ 使用前请在设置中配置AI服务的API密钥和端点
        </div>
      </div>
    </div>
  );
}
