import { useRef, useState } from 'react';
import type { WordbookEntry } from '../hooks/useWordbook';

interface WordbookPageProps {
  entries: WordbookEntry[];
  onRemove: (word: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onBack: () => void;
}

export function WordbookPage({ entries, onRemove, onReorder, onBack }: WordbookPageProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const dragIndexRef = useRef<number | null>(null);

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

  /* ── 拖拽排序 ── */
  const handleDragStart = (idx: number) => (e: React.DragEvent) => {
    dragIndexRef.current = idx;
    setDragIndex(idx);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIndexRef.current !== null && dragIndexRef.current !== idx) {
      setOverIndex(idx);
    }
  };

  const handleDragLeave = () => {
    setOverIndex(null);
  };

  const handleDrop = (idx: number) => (e: React.DragEvent) => {
    e.preventDefault();
    const from = dragIndexRef.current;
    if (from !== null && from !== idx) {
      onReorder(from, idx);
    }
    setDragIndex(null);
    setOverIndex(null);
    dragIndexRef.current = null;
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setOverIndex(null);
    dragIndexRef.current = null;
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
          {entries.map((entry, idx) => {
            const isDragging = dragIndex === idx;
            const isOver = overIndex === idx;
            return (
              <div
                key={entry.word}
                className={[
                  'wordbook-item',
                  isDragging ? 'wordbook-item-dragging' : '',
                  isOver ? 'wordbook-item-over' : '',
                ].filter(Boolean).join(' ')}
                draggable
                onDragStart={handleDragStart(idx)}
                onDragOver={handleDragOver(idx)}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop(idx)}
                onDragEnd={handleDragEnd}
              >
                <span className="wordbook-drag-handle" title="拖动排序">≡</span>
                <div className="wordbook-item-body">
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
