import { useState } from 'react';

interface ResultItem {
  id: string;
  type: string;
  title: string;
  description: string;
  details?: string;
  severity?: 'error' | 'warning' | 'info';
  icon?: string;
}

interface UnifiedResultSectionProps {
  title: string;
  items: ResultItem[];
  sectionType: 'check' | 'polish';
  className?: string;
}

export function UnifiedResultSection({
  title,
  items,
  sectionType,
  className = ''
}: UnifiedResultSectionProps) {
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

  const getSeverityIcon = (severity?: string) => {
    switch (severity) {
      case 'error':
        return '❌';
      case 'warning':
        return '⚠️';
      case 'info':
        return 'ℹ️';
      default:
        return '✨';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TYPO':
        return '✏️';
      case 'PUNCTUATION':
        return '❓';
      case 'SPACING':
        return '📏';
      case 'FORMATTING':
        return '📋';
      case 'STYLE':
        return '🎨';
      case 'CONSISTENCY':
        return '🔄';
      case 'HYPERLINK_ERROR':
        return '🔗';
      case 'TERMINOLOGY':
        return '📚';
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

  if (items.length === 0) {
    return null;
  }

	  // 区块整体折叠
	  const [sectionExpanded, setSectionExpanded] = useState(true);


  return (
    <div className={`unified-result-section ${sectionType}-section ${className}`}>
      <div className="section-header" onClick={() => setSectionExpanded(!sectionExpanded)}>
        <span className="section-title">{title} ({items.length})</span>
        <span className="spacer" />
        <style>
          {`.section-header{display:flex;align-items:center;gap:8px}.section-header .spacer{flex:1}`}
        </style>
        <span className="expand-icon" style={{ marginLeft: 'auto' }}>{sectionExpanded ? '▼' : '▶'}</span>
      </div>

      {sectionExpanded && (
        <div className="items-list">
          {items.map(item => (
            <div key={item.id} className={`result-item ${sectionType}-item ${item.severity || ''}`}>
              <div
                className="item-summary"
                onClick={() => toggleExpanded(item.id)}
              >
                <span className="item-icon">
                  {item.severity ? getSeverityIcon(item.severity) : getTypeIcon(item.type)}
                </span>
                <span className="item-title">{item.title}</span>
                <span className="expand-icon">
                  {expandedItems.has(item.id) ? '▼' : '▶'}
                </span>
              </div>

              {expandedItems.has(item.id) && item.details && (
                <div className="item-details">
                  {item.details}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
