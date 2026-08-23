import { useEffect, useMemo, useRef, useState } from 'react';
import type { UserFamily } from '../hooks/useNotes';

interface BatchMoveModalProps {
  /** 待挂载的单词数（仅展示） */
  count: number;
  /** 现有「我的词根」 */
  targets: UserFamily[];
  /** 每个词根的现有词数 */
  counts: Record<string, number>;
  onClose: () => void;
  /** 挂载到已有词根 */
  onMove: (familyId: string) => void;
  /** 输入新词根名（已解析为 roots 数组）并挂载 */
  onCreateAndMove: (roots: string[]) => void;
}

/**
 * 批量挂载弹窗：搜索即创建。
 * 输入为空 → 列出我的词根；输入时过滤，无精确匹配则显示「＋ 创建词根「xxx」并挂载」。
 */
export function BatchMoveModal({ count, targets, counts, onClose, onMove, onCreateAndMove }: BatchMoveModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!q) return targets;
    return targets.filter(
      (f) =>
        f.roots.some((r) => r.toLowerCase().includes(q)) ||
        (f.meaningZh ?? '').toLowerCase().includes(q),
    );
  }, [targets, q]);

  const exact = q
    ? targets.find((f) => f.roots.some((r) => r.toLowerCase() === q))
    : undefined;
  const showCreate = Boolean(q) && !exact;

  const submitCreate = () => {
    const roots = query
      .split(/[，,、]/)
      .map((x) => x.trim().toLowerCase().replace(/^-+/, ''))
      .filter(Boolean);
    if (roots.length) onCreateAndMove(roots);
  };

  return (
    <div className="batch-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="batch-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`挂载 ${count} 个单词`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="batch-modal-head">
          <h3 className="batch-modal-title">挂载 {count} 个单词</h3>
          <button type="button" className="batch-modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <div className="batch-modal-search">
          <input
            ref={inputRef}
            className="batch-modal-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && showCreate) {
                e.preventDefault();
                submitCreate();
              }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="输入词根名创建，或搜索已有词根…"
            aria-label="搜索或新建词根"
          />
        </div>

        <div className="batch-modal-list">
          {showCreate && (
            <button type="button" className="batch-modal-create" onClick={submitCreate}>
              ＋ 创建词根「{query.trim()}」并挂载 {count} 词
            </button>
          )}
          {filtered.length === 0 && !showCreate && (
            <p className="batch-modal-empty">
              还没有匹配的词根。输入词根名（如 eco，econ），直接创建并挂载。
            </p>
          )}
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              className="batch-modal-option"
              onClick={() => onMove(f.id)}
            >
              <span className="batch-modal-option-roots">{f.roots.join(' · ')}</span>
              {f.meaningZh && <span className="batch-modal-option-meaning">{f.meaningZh}</span>}
              <span className="batch-modal-option-count">{counts[f.id] ?? 0} 词</span>
            </button>
          ))}
        </div>

        <footer className="batch-modal-foot">
          <p>
            挂载后单词将从当前词根族隐藏，可在首页「我的词根」中查看；点击「移出本词根」可回到原词根族。
          </p>
        </footer>
      </div>
    </div>
  );
}
