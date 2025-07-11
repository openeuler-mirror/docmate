import { useState } from 'react';
import {
  CheckResultItem,
  PolishResultItem,
  TranslateResultItem
} from '@docmate/shared';

interface ResultCardProps {
  type: 'check' | 'polish' | 'translate';
  results: CheckResultItem[] | PolishResultItem[] | TranslateResultItem[];
}

export function ResultCard({ type, results }: ResultCardProps) {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const toggleExpanded = (id: string) => {
    const newExpanded = new Set(expandedItems);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedItems(newExpanded);
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '📝';
    }
  };

  const getTypeIcon = (itemType: string) => {
    switch (itemType) {
      case 'terminology':
        return '📚';
      case 'grammar':
        return '📝';
      case 'style':
        return '🎨';
      case 'consistency':
        return '🔄';
      case 'clarity':
        return '💡';
      case 'conciseness':
        return '✂️';
      case 'tone':
        return '🎭';
      case 'structure':
        return '🏗️';
      default:
        return '📄';
    }
  };

  const renderCheckResults = (items: CheckResultItem[]) => (
    <div className="check-results">
      <div className="results-header">
        <span>🔍 检查结果 ({items.length})</span>
      </div>
      {items.map(item => (
        <div key={item.id} className={`result-item check-item ${item.severity}`}>
          <div
            className="result-summary"
            onClick={() => toggleExpanded(item.id)}
          >
            <span className="severity-icon">{getSeverityIcon(item.severity)}</span>
            <span className="type-icon">{getTypeIcon(item.type)}</span>
            <span className="message">{item.message}</span>
            <span className="expand-icon">
              {expandedItems.has(item.id) ? '▼' : '▶'}
            </span>
          </div>

          {expandedItems.has(item.id) && (
            <div className="result-details">
              <div className="original-text">
                <strong>原文：</strong> "{item.originalText}"
              </div>
              {item.suggestedText && (
                <div className="suggested-text">
                  <strong>建议：</strong> "{item.suggestedText}"
                </div>
              )}
              {item.confidence && (
                <div className="confidence">
                  <strong>置信度：</strong> {Math.round(item.confidence * 100)}%
                </div>
              )}
              {item.source && (
                <div className="source">
                  <strong>来源：</strong> {item.source}
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderPolishResults = (items: PolishResultItem[]) => (
    <div className="polish-results">
      <div className="results-header">
        <span>✨ 润色建议 ({items.length})</span>
      </div>
      {items.map(item => (
        <div key={item.id} className="result-item polish-item">
          <div
            className="result-summary"
            onClick={() => toggleExpanded(item.id)}
          >
            <span className="type-icon">{getTypeIcon(item.type)}</span>
            <span className="explanation">{item.explanation}</span>
            <span className="expand-icon">
              {expandedItems.has(item.id) ? '▼' : '▶'}
            </span>
          </div>

          {expandedItems.has(item.id) && (
            <div className="result-details">
              <div className="original-text">
                <strong>原文：</strong> "{item.originalText}"
              </div>
              <div className="polished-text">
                <strong>润色后：</strong> "{item.polishedText}"
              </div>
              <div className="confidence">
                <strong>置信度：</strong> {Math.round(item.confidence * 100)}%
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderTranslateResults = (items: TranslateResultItem[]) => (
    <div className="translate-results">
      <div className="results-header">
        <span>🌐 翻译结果 ({items.length})</span>
      </div>
      {items.map(item => (
        <div key={item.id} className="result-item translate-item">
          <div
            className="result-summary"
            onClick={() => toggleExpanded(item.id)}
          >
            <span className="language-pair">
              {item.sourceLanguage} → {item.targetLanguage}
            </span>
            <span className="translated-preview">
              {item.translatedText.length > 50
                ? item.translatedText.substring(0, 50) + '...'
                : item.translatedText
              }
            </span>
            <span className="expand-icon">
              {expandedItems.has(item.id) ? '▼' : '▶'}
            </span>
          </div>

          {expandedItems.has(item.id) && (
            <div className="result-details">
              <div className="original-text">
                <strong>原文：</strong> "{item.originalText}"
              </div>
              <div className="translated-text">
                <strong>翻译：</strong> "{item.translatedText}"
              </div>
              {item.alternatives && item.alternatives.length > 0 && (
                <div className="alternatives">
                  <strong>备选翻译：</strong>
                  <ul>
                    {item.alternatives.map((alt, index) => (
                      <li key={index}>"{alt}"</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="confidence">
                <strong>置信度：</strong> {Math.round(item.confidence * 100)}%
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );

  if (results.length === 0) {
    return (
      <div className="result-card empty">
        <p>没有发现问题或建议。</p>
      </div>
    );
  }

  return (
    <div className="result-card">
      {type === 'check' && renderCheckResults(results as CheckResultItem[])}
      {type === 'polish' && renderPolishResults(results as PolishResultItem[])}
      {type === 'translate' && renderTranslateResults(results as TranslateResultItem[])}
    </div>
  );
}
