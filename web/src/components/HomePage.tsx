import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '../types';
import { catalogEntryKey, displayRoots, displaySemantic } from '../types';
import { rootChapterOptions, textbookLabel } from '../catalog';
import { WordSearchResults } from './WordSearchResults';

interface HomePageProps {
  onOpenFamily: (entry: CatalogEntry, word?: string) => void;
  onOpenAffixLibrary: () => void;
}

export function HomePage({ onOpenFamily, onOpenAffixLibrary }: HomePageProps) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [textbook, setTextbook] = useState('all');
  const [chapterKey, setChapterKey] = useState('all');

  useEffect(() => {
    fetch('/data/catalog.json')
      .then((r) => r.json())
      .then(setCatalog)
      .catch(console.error);
  }, []);

  const textbooks = useMemo(
    () => [...new Set(catalog.map((c) => c.textbook))].sort(),
    [catalog],
  );

  const chapterOptions = useMemo(
    () => rootChapterOptions(catalog, textbook),
    [catalog, textbook],
  );

  useEffect(() => {
    setChapterKey('all');
  }, [textbook]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return catalog.filter((entry) => {
      if (textbook !== 'all' && entry.textbook !== textbook) return false;
      if (chapterKey !== 'all' && catalogEntryKey(entry) !== chapterKey) return false;
      if (!q) return true;
      const hay = [
        displayRoots(entry),
        displaySemantic(entry),
        entry.semanticLabel,
        entry.roots.join(' '),
        entry.textbook,
        textbookLabel(entry.textbook),
        entry.chapter,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [catalog, filter, textbook, chapterKey]);

  const grouped = useMemo(() => {
    const items = [...filtered].sort((a, b) => {
      if (a.textbook !== b.textbook) {
        return a.textbook.localeCompare(b.textbook);
      }
      return (a.chapterOrder ?? 999) - (b.chapterOrder ?? 999);
    });

    if (textbook !== 'all') {
      return [{ key: textbookLabel(textbook), items }];
    }

    const map = new Map<string, CatalogEntry[]>();
    for (const item of items) {
      const key = textbookLabel(item.textbook);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].map(([key, groupItems]) => ({ key, items: groupItems }));
  }, [filtered, textbook]);

  const totalWords = catalog.reduce((n, c) => n + c.wordCount, 0);
  const hasFilter = filter.trim().length > 0;

  const renderCard = (entry: CatalogEntry) => {
    const roots = displayRoots(entry);
    const semantic = displaySemantic(entry);

    return (
      <button
        key={catalogEntryKey(entry)}
        type="button"
        className="library-card"
        onClick={() => onOpenFamily(entry)}
      >
        <div className="library-card-top">
          <span className="badge">第{entry.chapter}章</span>
          <span className="badge muted-badge">{textbookLabel(entry.textbook)}</span>
        </div>
        <h2 className="card-roots">{roots}</h2>
        {semantic && <p className="card-semantic">{semantic}</p>}
        <div className="library-card-foot">
          <span>{entry.wordCount} 词</span>
        </div>
      </button>
    );
  };

  return (
    <div className="library">
      <header className="library-hero">
        <p className="eyebrow">RootGraph · 词根笔记</p>
        <h1 className="hero-enjoy-title">
          <span>享受英语</span>
          <span className="hero-coffee-icon" aria-hidden title="喝杯咖啡，轻松学">
            ☕
          </span>
        </h1>
        <p className="subtitle">
          {catalog.length} 个词根族 · {totalWords.toLocaleString()} 个单词 · 按教材目录词根分类
        </p>
        <div className="hero-actions">
          <button type="button" className="hero-action" onClick={onOpenAffixLibrary}>
            词根词缀库
          </button>
        </div>
      </header>

      <div className="library-toolbar">
        <input
          className="search-input"
          placeholder="搜索词根、语义、教材、单词…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={textbook} onChange={(e) => setTextbook(e.target.value)}>
          <option value="all">全部教材</option>
          {textbooks.map((tb) => (
            <option key={tb} value={tb}>
              {textbookLabel(tb)}
            </option>
          ))}
        </select>
      </div>

      <WordSearchResults
        query={filter}
        textbook={textbook}
        catalog={catalog}
        onOpenWord={(entry, word) => onOpenFamily(entry, word)}
      />

      <div className="filter-hint">
        {textbook === 'all'
          ? '先选教材，再按目录词根筛选章节'
          : `${textbookLabel(textbook)} · ${chapterOptions.length} 个词根章节`}
      </div>

      {textbook !== 'all' && (
        <div className="topic-chips">
          <button
            type="button"
            className={`chip ${chapterKey === 'all' ? 'active' : ''}`}
            onClick={() => setChapterKey('all')}
          >
            全部词根章
          </button>
          {chapterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`chip ${chapterKey === opt.key ? 'active' : ''}`}
              onClick={() => setChapterKey(opt.key)}
              title={opt.semantic ?? undefined}
            >
              {opt.roots}
            </button>
          ))}
        </div>
      )}

      {hasFilter && (
        <h2 className="topic-section-title library-section-label">词根族</h2>
      )}

      {grouped.map(({ key, items }) =>
        items.length === 0 ? null : (
          <section key={key} className="topic-section">
            {textbook === 'all' && !hasFilter && <h2 className="topic-section-title">{key}</h2>}
            <div className="library-grid">
              {items.map((entry) => renderCard(entry))}
            </div>
          </section>
        ),
      )}

      {filtered.length === 0 && !hasFilter && (
        <p className="empty-hint">没有匹配的词根族，试试换个筛选条件</p>
      )}
    </div>
  );
}
