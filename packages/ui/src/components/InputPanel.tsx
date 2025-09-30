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

  // 生成选中文本的引用显示
  const getSelectedTextReference = () => {
    if (!hasSelectedText) return '';
    const preview = selectedText.length > 50 ? selectedText.substring(0, 50) + '...' : selectedText;
    return `> ${preview}`;
  };

  const handleCheck = () => {
    // 如果有选中文本，使用选中文本；否则传递空字符串让后端处理全文
    const textToProcess = hasSelectedText ? selectedText : '';
    onExecute('check', textToProcess);
  };

  const handlePolish = () => {
    // 如果有选中文本，使用选中文本；否则传递空字符串让后端处理全文
    const textToProcess = hasSelectedText ? selectedText : '';
    onExecute('polish', textToProcess);
  };

  const handleTranslate = () => {
    // 如果有选中文本，使用选中文本；否则传递空字符串让后端处理全文
    const textToProcess = hasSelectedText ? selectedText : '';
    onExecute('translate', textToProcess, { targetLanguage });
  };

  const handleSubmit = () => {
    if (!inputText.trim()) return;

    // 文本框专门用于改写指令
    // 如果有选中文本，改写选中文本；否则改写全文
    const originalText = hasSelectedText ? selectedText : '';
    onExecute('rewrite', inputText, {
      originalText: originalText,
      conversationHistory: []
    });

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
                : "输入改写指令来改写全文，或直接使用下方按钮进行全文检查、润色、翻译。选中文字后可以对部分文字进行操作..."
            }
            disabled={disabled}
            rows={2}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && inputText.trim()) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
          <button
            className="submit-button"
            onClick={handleSubmit}
            disabled={disabled || !inputText.trim()}
            title={hasSelectedText ? "改写选中文本" : "改写全文"}
          >
            💬 改写
          </button>
        </div>
      </div>

      {/* 紧凑型操作工具栏 */}
      <div className="action-toolbar">
        <div className="action-group">
          <button
            className="compact-action-button check-button"
            onClick={handleCheck}
            disabled={disabled}
            title={hasSelectedText ? "检查选中文本" : "检查全文"}
          >
            🔍 检查
          </button>

          <button
            className="compact-action-button polish-button"
            onClick={handlePolish}
            disabled={disabled}
            title={hasSelectedText ? "润色选中文本" : "润色全文"}
          >
            ✨ 润色
          </button>

          <div className="translate-group">
            <button
              className="compact-action-button translate-button"
              onClick={handleTranslate}
              disabled={disabled}
              title={hasSelectedText ? "翻译选中文本" : "翻译全文"}
            >
              🌐 翻译
            </button>
            <select
              className="inline-language-select"
              value={targetLanguage}
              onChange={(e) => setTargetLanguage(e.target.value)}
              disabled={disabled}
              title="选择翻译目标语言"
            >
              <option value="en-US">EN</option>
              <option value="zh-CN">中文</option>
              <option value="ja">日语</option>
              <option value="ko">韩语</option>
              <option value="fr">法语</option>
              <option value="de">德语</option>
              <option value="es">西语</option>
              <option value="ru">俄语</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
