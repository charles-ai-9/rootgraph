import { useEffect, useMemo, useState } from 'react';
import type { CatalogEntry } from '../types';
import type { IndexedWord } from '../hooks/useWordIndex';
import type { UserFamily, UserFamilyWord } from '../hooks/useNotes';
import { loadWordIndex, searchWords } from '../hooks/useWordIndex';
import { textbookLabel } from '../catalog';
import { speakWord } from '../utils/speech';

interface WordSearchResultsProps {
  query: string;
  textbook: string;
  catalog: CatalogEntry[];
  userFamilies: Record<string, UserFamily>;
  getUserFamilyWords: (id: string) => UserFamilyWord[];
  onOpenWord: (entry: CatalogEntry, word: string) => void;
  /** 打开我的词根族（挂载词直达；带上焦点词，多词根族自动切到对应面板并定位） */
  onOpenUserFamily: (f: UserFamily, word?: string) => void;
}

export function WordSearchResults({
  query,
  textbook,
  catalog,
  userFamilies,
  getUserFamilyWords,
  onOpenWord,
  onOpenUserFamily,
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

  /** 词 → 所属我的词根（已挂载的词搜索时直达） */
  const userFamilyByWord = useMemo(() => {
    const map = new Map<string, UserFamily>();
    for (const f of Object.values(userFamilies)) {
      for (const w of getUserFamilyWords(f.id)) {
        if (!map.has(w.word)) map.set(w.word, f);
      }
    }
    return map;
  }, [userFamilies, getUserFamilyWords]);

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
          const myFamily = userFamilyByWord.get(hit.word);
          return (
            <div
              key={`${hit.textbook}-${hit.familyId}-${hit.word}`}
              role="button"
              tabIndex={0}
              className="word-search-hit"
              onClick={() => {
                if (myFamily) onOpenUserFamily(myFamily, hit.word);
                else if (entry) onOpenWord(entry, hit.word);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (myFamily) onOpenUserFamily(myFamily, hit.word);
                  else if (entry) onOpenWord(entry, hit.word);
                }
              }}
            >
              <span className="word-search-hit-word">{hit.word}</span>
              <button
                type="button"
                className="word-speak-btn inline"
                title="朗读"
                aria-label={`朗读 ${hit.word}`}
                onClick={(e) => {
                  e.stopPropagation();
                  speakWord(hit.word);
                }}
              >
                🔊
              </button>
              {hit.phonetic && <span className="word-search-hit-phonetic">/{hit.phonetic}/</span>}
              <span className="word-search-hit-meta">
                {myFamily ? (
                  <span className="word-search-hit-my">
                    我的词根 · {myFamily.roots.join('/')}
                    {myFamily.meaningZh ? `（${myFamily.meaningZh}）` : ''}
                  </span>
                ) : entry ? (
                  `${textbookLabel(hit.textbook)} · ${entry.roots.join('/')}`
                ) : (
                  textbookLabel(hit.textbook)
                )}
              </span>
              {hit.definition && (
                <span className="word-search-hit-def">
                  {hit.pos && <em>{hit.pos}</em>}
                  {hit.definition.length > 72 ? `${hit.definition.slice(0, 72)}…` : hit.definition}
                </span>
              )}
            </div>
          );
        })}
      </div>

    </section>
  );
}
