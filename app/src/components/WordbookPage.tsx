import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordbookEntry } from '../hooks/useWordbook';

interface WordbookPageProps {
  entries: WordbookEntry[];
  onRemove: (word: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onBack: () => void;
}

export function WordbookPage({ entries, onRemove, onReorder, onBack }: WordbookPageProps) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  /* ── 拖拽排序（pointer events，支持触摸） ── */
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    fromIdx: number;
    startY: number;
    itemH: number;
  } | null>(null);

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

  /* ── pointer 拖拽逻辑 ── */
  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const ds = dragState.current;
      if (!ds || !listRef.current) return;
      e.preventDefault();

      const delta = e.clientY - ds.startY;
      const offset = Math.round(delta / ds.itemH);
      const target = Math.max(0, Math.min(entries.length - 1, ds.fromIdx + offset));
      setOverIdx(target);
    },
    [entries.length],
  );

  const onPointerUp = useCallback(() => {
    const ds = dragState.current;
    if (!ds) return;

    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);

    setOverIdx((cur) => {
      if (cur !== null && cur !== ds.fromIdx) {
        onReorder(ds.fromIdx, cur);
      }
      return null;
    });
    setDragIdx(null);
    dragState.current = null;
  }, [onPointerMove, onReorder]);

  const startDrag = (idx: number) => (e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);

    const el = (e.target as HTMLElement).closest('.wordbook-item') as HTMLElement;
    const itemH = el?.getBoundingClientRect().height ?? 60;

    dragState.current = { fromIdx: idx, startY: e.clientY, itemH };
    setDragIdx(idx);
    setOverIdx(idx);

    document.addEventListener('pointermove', onPointerMove, { passive: false });
    document.addEventListener('pointerup', onPointerUp);
  };

  // 组件卸载时清理监听
  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onPointerMove);
      document.removeEventListener('pointerup', onPointerUp);
    };
  }, [onPointerMove, onPointerUp]);

  return (
    <div className="wordbook-page">
      <header className="wordbook-header">
        <button type="button" className="back-link" onClick={onBack}>
          ← 返回首页
        </button>
        <h1>单词本</h1>
        <div className="wordbook-header-actions">
          {entries.length > 1 && (
            <button
              type="button"
              className={`wordbook-edit-toggle ${editMode ? 'active' : ''}`}
              onClick={() => {
                setEditMode((v) => !v);
                setDragIdx(null);
                setOverIdx(null);
              }}
            >
              {editMode ? '完成' : '排序'}
            </button>
          )}
          <span className="wordbook-count">{entries.length} 词</span>
        </div>
      </header>

      {entries.length === 0 ? (
        <div className="wordbook-empty">
          <p>单词本为空</p>
          <p className="wordbook-empty-hint">搜索单词时如果找不到，可以加入单词本，后续整理到对应词根族。</p>
        </div>
      ) : (
        <div className="wordbook-list" ref={listRef}>
          {entries.map((entry, idx) => {
            const isDragging = dragIdx === idx;
            const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
            return (
              <div
                key={entry.word}
                className={[
                  'wordbook-item',
                  isDragging ? 'wordbook-item-dragging' : '',
                  isOver ? 'wordbook-item-over' : '',
                ].filter(Boolean).join(' ')}
              >
                {editMode && (
                  <span
                    className="wordbook-drag-handle"
                    onPointerDown={startDrag(idx)}
                    style={{ touchAction: 'none' }}
                  >
                    ≡
                  </span>
                )}
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
