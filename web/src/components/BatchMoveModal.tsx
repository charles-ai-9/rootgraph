import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogEntry } from '../types';
import { displayRoots, displaySemantic } from '../types';
import { textbookLabel } from '../catalog';
import type { UserFamily } from '../hooks/useNotes';

export type BatchMoveTarget =
  | { kind: 'user'; id: string; roots: string[]; meaningZh?: string; badge?: string; wordCount: number }
  | { kind: 'catalog'; entry: CatalogEntry; wordCount: number };

interface BatchMoveModalProps {
  /** 待挂载的单词数（仅展示） */
  count: number;
  /** 首页 catalog 词根族（教材 1–8 + 附录） */
  catalog: CatalogEntry[];
  /** 现有「我的词根」 */
  userFamilies: Record<string, UserFamily>;
  /** 每个用户词根的现有词数 */
  userCounts: Record<string, number>;
  onClose: () => void;
  /** 挂载到已有词根（用户词根 id） */
  onMove: (familyId: string) => void;
  /** 输入新词根名（已解析为 roots 数组）并挂载 */
  onCreateAndMove: (roots: string[]) => void;
  /** 从 catalog 选中：若无同名用户词根则先创建再挂载 */
  onMoveViaCatalog: (entry: CatalogEntry) => void;
}

function targetMatchesQuery(target: BatchMoveTarget, q: string): boolean {
  const roots = target.kind === 'user' ? target.roots : target.entry.roots;
  const meaning =
    target.kind === 'user'
      ? (target.meaningZh ?? '')
      : (target.entry.meaningZh ?? target.entry.semanticLabel ?? target.entry.titleZh ?? '');
  const id = target.kind === 'user' ? target.id : target.entry.id;
  const textbook = target.kind === 'catalog' ? target.entry.textbook : '';
  const tbLabel = textbook ? textbookLabel(textbook) : '';
  const semantic = target.kind === 'catalog' ? displaySemantic(target.entry) : '';
  const hay = [id, ...roots, meaning, tbLabel, semantic].filter(Boolean).join(' ').toLowerCase();
  return hay.includes(q);
}

/**
 * 批量挂载弹窗：搜索即创建；搜索范围 = 首页 catalog 词根族 + 我的词根。
 */
export function BatchMoveModal({
  count,
  catalog,
  userFamilies,
  userCounts,
  onClose,
  onMove,
  onCreateAndMove,
  onMoveViaCatalog,
}: BatchMoveModalProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();

  const targets = useMemo((): BatchMoveTarget[] => {
    const userIds = new Set(Object.keys(userFamilies));
    const list: BatchMoveTarget[] = [];

    for (const f of Object.values(userFamilies)) {
      list.push({
        kind: 'user',
        id: f.id,
        roots: f.roots,
        meaningZh: f.meaningZh,
        badge: '我的',
        wordCount: userCounts[f.id] ?? 0,
      });
    }

    for (const entry of catalog) {
      if (entry.textbook === 'user') continue;
      if (userIds.has(entry.id)) continue;
      list.push({
        kind: 'catalog',
        entry,
        wordCount: entry.wordCount ?? 0,
      });
    }

    list.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === 'user' ? -1 : 1;
      const ao = a.kind === 'catalog' ? (a.entry.chapterOrder ?? 999) : 999;
      const bo = b.kind === 'catalog' ? (b.entry.chapterOrder ?? 999) : 999;
      return ao - bo;
    });
    return list;
  }, [catalog, userFamilies, userCounts]);

  const filtered = useMemo(() => {
    if (!q) return targets;
    return targets.filter((t) => targetMatchesQuery(t, q));
  }, [targets, q]);

  const exactUser = q
    ? Object.values(userFamilies).find((f) => f.roots.some((r) => r.toLowerCase() === q))
    : undefined;
  const exactCatalog = q
    ? catalog.find(
        (e) =>
          e.textbook !== 'user' &&
          (e.id.toLowerCase() === q || e.roots.some((r) => r.toLowerCase().replace(/^\*+/, '') === q)),
      )
    : undefined;
  const showCreate = Boolean(q) && !exactUser && !exactCatalog;

  const submitCreate = () => {
    const roots = query
      .split(/[，,、]/)
      .map((x) => x.trim().toLowerCase().replace(/^-+/, ''))
      .filter(Boolean);
    if (roots.length) onCreateAndMove(roots);
  };

  const handleSelect = (target: BatchMoveTarget) => {
    if (target.kind === 'user') {
      onMove(target.id);
      return;
    }
    onMoveViaCatalog(target.entry);
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
            placeholder="搜索首页词根 / 我的词根，或输入新词根名创建…"
            aria-label="搜索或新建词根"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
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
              没有匹配的词根。可搜索教材词根（如 leg、ceed），或输入新词根名直接创建。
            </p>
          )}
          {filtered.map((target) => {
            const key = target.kind === 'user' ? `user-${target.id}` : `cat-${target.entry.textbook}-${target.entry.id}`;
            const roots = target.kind === 'user' ? target.roots : target.entry.roots;
            const meaning =
              target.kind === 'user'
                ? target.meaningZh
                : (target.entry.meaningZh || displaySemantic(target.entry));
            const badge =
              target.kind === 'user'
                ? (target.badge ?? '我的')
                : textbookLabel(target.entry.textbook);
            return (
              <button
                key={key}
                type="button"
                className="batch-modal-option"
                onClick={() => handleSelect(target)}
              >
                <span className="batch-modal-option-badge">{badge}</span>
                <span className="batch-modal-option-roots">{displayRoots({ roots } as CatalogEntry)}</span>
                {meaning && <span className="batch-modal-option-meaning">{meaning}</span>}
                <span className="batch-modal-option-count">{target.wordCount} 词</span>
              </button>
            );
          })}
        </div>

        <footer className="batch-modal-foot">
          <p>
            挂载到教材词根时会同步加入「我的词根」；单词从当前族隐藏，可在首页查看。移出后可回到原词根族。
          </p>
        </footer>
      </div>
    </div>
  );
}
