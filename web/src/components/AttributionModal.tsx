import { useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogEntry, WordEntry } from '../types';
import type { UserFamily, UserFamilyWord } from '../hooks/useNotes';
import { textbookLabel } from '../catalog';

interface AttributionModalProps {
  /** 待修正归属的词（批量时取第一个，count 显示总数） */
  word: WordEntry;
  /** 批量归入的词数（>1 时显示） */
  count?: number;
  /** 当前归属（如 教材3 · dict 族） */
  fromLabel: string;
  /** 系统词根目录（用于搜索提示，避免创建重复词根） */
  catalog: CatalogEntry[];
  userFamilies: Record<string, UserFamily>;
  getUserFamilyWords: (id: string) => UserFamilyWord[];
  /** 归入已有我的词根 */
  onMove: (familyId: string) => void;
  /** 创建词根并归入（roots 已解析；textbook 可选目标教材） */
  onCreateAndMove: (roots: string[], textbook?: string) => void;
  onClose: () => void;
}

/**
 * 归属修正面板：把单词归入正确的词根（已有我的词根 / 无则创建）。
 * 系统词根仅提示（归入系统词根为下一阶段能力），避免用户误建重复词根。
 */
export function AttributionModal({
  word,
  count,
  fromLabel,
  catalog,
  userFamilies,
  getUserFamilyWords,
  onMove,
  onCreateAndMove,
  onClose,
}: AttributionModalProps) {
  const [query, setQuery] = useState('');
  const [createTextbook, setCreateTextbook] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const q = query.trim().toLowerCase();
  const isBatch = (count ?? 1) > 1;

  /** 我的词根匹配（可归入） */
  const myMatches = useMemo(() => {
    if (!q) return Object.values(userFamilies);
    return Object.values(userFamilies).filter(
      (f) =>
        f.roots.some((r) => r.toLowerCase().includes(q)) ||
        (f.meaningZh ?? '').toLowerCase().includes(q),
    );
  }, [userFamilies, q]);

  /** 系统词根匹配（仅提示，下一阶段支持归入） */
  const systemMatches = useMemo(() => {
    if (!q) return [];
    const seen = new Set<string>();
    return catalog.filter((e) => {
      if (e.textbook === 'user') return false;
      const hit = (e.roots ?? []).some((r) => r.toLowerCase().includes(q));
      if (hit && !seen.has(`${e.textbook}:${e.id}`)) {
        seen.add(`${e.textbook}:${e.id}`);
        return true;
      }
      return false;
    });
  }, [catalog, q]);

  const exactMy = q
    ? Object.values(userFamilies).some((f) => f.roots.some((r) => r.toLowerCase() === q))
    : false;
  const showCreate = Boolean(q) && !exactMy;

  const submitCreate = () => {
    const roots = query
      .split(/[，,、]/)
      .map((x) => x.trim().toLowerCase().replace(/^-+/, ''))
      .filter(Boolean);
    if (roots.length) onCreateAndMove(roots, createTextbook || undefined);
  };

  return (
    <div className="attribution-backdrop" onClick={onClose} role="presentation">
      <div
        className="attribution-modal"
        role="dialog"
        aria-modal="true"
        aria-label="归入词根"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="attribution-head">
          <div className="attribution-title-row">
            <h3 className="attribution-title">归入词根</h3>
            <button type="button" className="attribution-close" onClick={onClose} aria-label="关闭">
              ✕
            </button>
          </div>
          <p className="attribution-current">
            {isBatch ? `${count} 个单词` : word.word}
            {!isBatch && word.phonetic && <span className="attribution-current-phonetic">/{word.phonetic}/</span>}
            <span className="attribution-current-from">当前在 {fromLabel}</span>
          </p>
        </header>

        <div className="attribution-search">
          <input
            ref={inputRef}
            className="attribution-input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && showCreate) {
                e.preventDefault();
                submitCreate();
              }
              if (e.key === 'Escape') onClose();
            }}
            placeholder="输入词根名，如 jus · jud；或选已有词根"
            aria-label="搜索或新建词根"
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
          />
        </div>

        <div className="attribution-list">
          {myMatches.length > 0 && (
            <>
              <p className="attribution-group-label">我的词根</p>
              {myMatches.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className="attribution-option"
                  onClick={() => onMove(f.id)}
                >
                  <span className="attribution-option-roots">{f.roots.join(' · ')}</span>
                  {f.meaningZh && <span className="attribution-option-meaning">{f.meaningZh}</span>}
                  <span className="attribution-option-count">
                    {getUserFamilyWords(f.id).length} 词
                  </span>
                </button>
              ))}
            </>
          )}

          {systemMatches.length > 0 && (
            <>
              <p className="attribution-group-label">系统词根</p>
              {systemMatches.slice(0, 6).map((e) => (
                <div
                  key={`${e.textbook}:${e.id}`}
                  className="attribution-option is-disabled"
                  title="归入系统词根将在后续版本支持；当前可创建新的我的词根"
                >
                  <span className="attribution-option-roots">{(e.roots ?? []).join(' · ')}</span>
                  <span className="attribution-option-meaning">{e.semanticLabel ?? e.meaningZh ?? ''}</span>
                  <span className="attribution-option-count">{textbookLabel(e.textbook)}</span>
                </div>
              ))}
            </>
          )}

          {showCreate && (
            <div className="attribution-create-block">
              <button type="button" className="attribution-create" onClick={submitCreate}>
                ＋ 创建词根「{query.trim().replace(/[，,、]/g, ' · ')}」并归入
                {isBatch ? ` ${count} 词` : ` ${word.word}`}
                {createTextbook ? `（${textbookLabel(createTextbook)}）` : ''}
              </button>
              <select
                className="attribution-textbook-select"
                value={createTextbook}
                onChange={(e) => setCreateTextbook(e.target.value)}
                aria-label="目标教材"
              >
                <option value="">我的词根（仅本机）</option>
                {['textbook-1', 'textbook-2', 'textbook-3', 'textbook-4', 'textbook-5', 'textbook-6', 'textbook-7', 'textbook-8'].map((tb) => (
                  <option key={tb} value={tb}>
                    {textbookLabel(tb)}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!q && myMatches.length === 0 && (
            <p className="attribution-empty">
              还没有我的词根。输入词根名（如 jus，jud）直接创建并归入。
            </p>
          )}
        </div>

        <footer className="attribution-foot">
          <p>
            归入后将从原词根族隐藏，可在首页「我的词根」查看并随时移回原族。
          </p>
        </footer>
      </div>
    </div>
  );
}
