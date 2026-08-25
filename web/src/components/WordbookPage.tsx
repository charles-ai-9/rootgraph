import { useState } from 'react';
import type { WordbookEntry } from '../hooks/useWordbook';

interface WordbookPageProps {
  entries: WordbookEntry[];
  onRemove: (word: string) => void;
  onBack: () => void;
}

export function WordbookPage({ entries, onRemove, onBack }: WordbookPageProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const handleRemove = (word: string) => {
    if (confirmDelete === word) {
      onRemove(word);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(word);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  return (
    <div className="wordbook-page">
      <header className="wordbook-header">
        <button type="button" className="back-link" onClick={onBack}>
          ← 返回首页
        </button>
        <h1>单词本</h1>
        <span className="wordbook-count">{entries.length} 词</span>
      </header>

      {entries.length === 0 ? (
        <div className="wordbook-empty">
          <p>单词本为空</p>
          <p className="wordbook-empty-hint">搜索单词时如果找不到，可以加入单词本，后续整理到对应词根族。</p>
        </div>
      ) : (
        <div className="wordbook-list">
          {entries.map((entry) => (
            <div key={entry.word} className="wordbook-item">
              <div className="wordbook-item-main">
                <span className="wordbook-item-word">{entry.word}</span>
                {entry.phonetic && (
                  <span className="wordbook-item-phonetic">/{entry.phonetic}/</span>
                )}
                {entry.pos && <em className="wordbook-item-pos">{entry.pos}</em>}
              </div>
              {entry.definition && (
                <p className="wordbook-item-def">
                  {entry.definition.length > 80 ? `${entry.definition.slice(0, 80)}…` : entry.definition}
                </p>
              )}
              <div className="wordbook-item-footer">
                <span className="wordbook-item-time">{formatDate(entry.addedAt)}</span>
                <button
                  type="button"
                  className={`wordbook-item-remove ${confirmDelete === entry.word ? 'confirm' : ''}`}
                  onClick={() => handleRemove(entry.word)}
                >
                  {confirmDelete === entry.word ? '确认删除' : '删除'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
