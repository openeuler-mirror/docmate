import { FC } from 'react';

interface TerminologyItem { original: string; translated: string; note?: string }

interface TerminologyListProps {
  items: TerminologyItem[];
}

export const TerminologyList: FC<TerminologyListProps> = ({ items }) => {
  if (!items || items.length === 0) return null;
  return (
    <div className="terminology-section">
      <h4>术语对照</h4>
      <ul className="terminology-list">
        {items.map((t, idx) => (
          <li key={idx} className="terminology-item">
            <span className="term-original">{t.original}</span>
            <span className="term-sep"> → </span>
            <span className="term-translated">{t.translated}</span>
            {t.note && <span className="term-note">（{t.note}）</span>}
          </li>
        ))}
      </ul>
    </div>
  );
};

