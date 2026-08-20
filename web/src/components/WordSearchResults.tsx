import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '../types';
import type { IndexedWord } from '../hooks/useWordIndex';
import { loadWordIndex, searchWords } from '../hooks/useWordIndex';
import { textbookLabel } from '../catalog';

interface WordSearchResultsProps {
  query: string;
  textbook: string;
  catalog: CatalogEntry[];
  onOpenWord: (entry: CatalogEntry, word: string) => void;
}

export function WordSearchResults({
  query,
  textbook,
  catalog,
  onOpenWord,
}: WordSearchResultsProps) {
  const [index, setIndex] = useState<IndexedWord[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    loadWordIndex()
      .then((rows) => {
        setIndex(rows);
        setReady(true);
      })
      .catch(() => setError(true));
  }, []);

  const hits = useMemo(
    () => searchWords(index, query, textbook === 'all' ? undefined : textbook, 24),
    [index, query, textbook],
  );

  const catalogByKey = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const entry of catalog) {
      map.set(`${entry.textbook}:${entry.id}`, entry);
    }
    return map;
  }, [catalog]);

  if (!query.trim()) return null;
  if (error) {
    return (
      <section className="word-search-section">
        <p className="affix-chalk-muted">单词索引加载失败，搜索不可用</p>
      </section>
    );
  }
  if (!ready || hits.length === 0) return null;

  return (
    <section className="word-search-section">
      <h2 className="word-search-title">匹配的单词 · {hits.length}</h2>
      <div className="word-search-list">
        {hits.map((hit) => {
          const entry = catalogByKey.get(`${hit.textbook}:${hit.familyId}`);
          return (
            <button
              key={`${hit.textbook}-${hit.familyId}-${hit.word}`}
              type="button"
              className="word-search-hit"
              onClick={() => entry && onOpenWord(entry, hit.word)}
            >
              <span className="word-search-hit-word">{hit.word}</span>
              {hit.phonetic && <span className="word-search-hit-phonetic">/{hit.phonetic}/</span>}
              <span className="word-search-hit-meta">
                {entry ? `${textbookLabel(hit.textbook)} · ${entry.roots.join('/')}` : textbookLabel(hit.textbook)}
              </span>
              {hit.definition && (
                <span className="word-search-hit-def">
                  {hit.pos && <em>{hit.pos}</em>}
                  {hit.definition.length > 72 ? `${hit.definition.slice(0, 72)}…` : hit.definition}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </section>
  );
}
