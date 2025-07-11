import { useState } from 'react';

interface InputPanelProps {
  selectedText: string;
  onExecute: (operation: string, text: string, options?: any) => void;
  disabled: boolean;
}

export function InputPanel({ selectedText, onExecute, disabled }: InputPanelProps) {
  const [inputText, setInputText] = useState('');
  const [targetLanguage, setTargetLanguage] = useState('en-US');

  const currentText = selectedText || inputText;

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
    onExecute('translate', currentText, { targetLanguage });
  };

  return (
    <div className="input-panel">
      <div className="text-input-section">
        <div className="input-header">
          <span>📝 输入文本</span>
          {selectedText && (
            <span className="selected-indicator">
              ✅ 已选择编辑器中的文本
            </span>
          )}
        </div>

        {selectedText ? (
          <div className="selected-text-display">
            <div className="selected-text-content">
              {selectedText}
            </div>
            <button
              className="clear-selection"
              onClick={() => setInputText(selectedText)}
              title="编辑此文本"
            >
              ✏️ 编辑
            </button>
          </div>
        ) : (
          <textarea
            className="text-input"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="在此输入要处理的文本，或在编辑器中选择文本..."
            rows={4}
            disabled={disabled}
          />
        )}
      </div>

      <div className="action-buttons">
        <button
          className="action-button check-button"
          onClick={handleCheck}
          disabled={disabled || !currentText.trim()}
          title="检查文档中的术语、语法和风格问题"
        >
          🔍 检查
        </button>

        <button
          className="action-button polish-button"
          onClick={handlePolish}
          disabled={disabled || !currentText.trim()}
          title="润色文本，提高表达质量"
        >
          ✨ 润色
        </button>

        <div className="translate-section">
          <select
            className="language-select"
            value={targetLanguage}
            onChange={(e) => setTargetLanguage(e.target.value)}
            disabled={disabled}
          >
            <option value="en-US">English</option>
            <option value="zh-CN">中文</option>
            <option value="ja">日语</option>
            <option value="ko">韩语</option>
            <option value="fr">法语</option>
            <option value="de">德语</option>
            <option value="es">西班牙语</option>
            <option value="ru">俄语</option>
          </select>

          <button
            className="action-button translate-button"
            onClick={handleTranslate}
            disabled={disabled || !currentText.trim()}
            title="翻译文本到指定语言"
          >
            🌐 翻译
          </button>
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
