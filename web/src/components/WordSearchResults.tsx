import { useEffect, useMemo, useRef, useState } from 'react';
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
  /** 加入单词本 */
  onAddToWordbook?: (word: string) => void;
  /** 是否已在单词本 */
  hasInWordbook?: (word: string) => boolean;
}

export function WordSearchResults({
  query,
  textbook,
  catalog,
  userFamilies,
  getUserFamilyWords,
  onOpenWord,
  onOpenUserFamily,
  onAddToWordbook,
  hasInWordbook,
}: WordSearchResultsProps) {
  const [index, setIndex] = useState<IndexedWord[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    loadWordIndex()
      .then((rows) => {
        setIndex(rows);
        setReady(true);
      })
      .catch(() => setError(true));
  }, []);

  /** 合并用户新建单词到搜索索引 */
  const searchIndex = useMemo(() => {
    const userWords: IndexedWord[] = [];
    for (const uf of Object.values(userFamilies)) {
      for (const w of getUserFamilyWords(uf.id)) {
        userWords.push({
          word: w.word,
          textbook: 'user',
          familyId: uf.id,
          file: '',
          phonetic: w.phonetic,
          pos: w.pos,
          definition: w.definition,
          mnemonic: w.mnemonic,
          frequency: w.frequency,
        });
      }
    }
    return [...index, ...userWords];
  }, [index, userFamilies, getUserFamilyWords]);

  const hits = useMemo(
    () => searchWords(searchIndex, query, textbook === 'all' ? undefined : textbook, 24),
    [searchIndex, query, textbook],
  );

  /** 搜索结果变化时重置键盘选中 */
  useEffect(() => {
    setSelectedIndex(-1);
  }, [query, textbook, hits.length]);

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

  /** 打开命中词：优先官方词根族（roots 匹配，合并显示），无匹配才去我的词根 */
  const openHit = (hit: IndexedWord, word: string) => {
    const myFamily = userFamilyByWord.get(word);
    if (myFamily) {
      const rootsKey = [...(myFamily.roots ?? [])].sort().join('|');
      const official = catalog.find(
        (e) => e.source !== 'user' && [...(e.roots ?? [])].sort().join('|') === rootsKey,
      );
      if (official) {
        onOpenWord(official, word);
        return;
      }
      onOpenUserFamily(myFamily, word);
      return;
    }
    const entry = catalogByKey.get(`${hit.textbook}:${hit.familyId}`);
    if (entry) onOpenWord(entry, word);
  };

  const catalogByKey = useMemo(() => {
    const map = new Map<string, CatalogEntry>();
    for (const entry of catalog) {
      map.set(`${entry.textbook}:${entry.id}`, entry);
    }
    return map;
  }, [catalog]);

  /** 在搜索输入框上挂键盘导航：↑↓ 选中、Enter 进入详情 */
  useEffect(() => {
    const input = document.querySelector<HTMLInputElement>('.search-input');
    if (!input) return;
    const handler = (e: KeyboardEvent) => {
      if (hits.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(i + 1, hits.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && selectedIndex >= 0 && selectedIndex < hits.length) {
        e.preventDefault();
        const hit = hits[selectedIndex];
        openHit(hit, hit.word);
      }
    };
    input.addEventListener('keydown', handler);
    return () => input.removeEventListener('keydown', handler);
  }, [hits, selectedIndex, openHit]);

  /** 选中项滚动到视口 */
  useEffect(() => {
    if (selectedIndex < 0 || !listRef.current) return;
    const el = listRef.current.children[selectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  const [addedToast, setAddedToast] = useState<string | null>(null);

  const handleAddToWordbook = () => {
    const word = query.trim().toLowerCase();
    if (!word || !onAddToWordbook) return;
    onAddToWordbook(word);
    setAddedToast(word);
    setTimeout(() => setAddedToast(null), 2000);
  };

  if (!query.trim()) return null;
  if (error) {
    return (
      <section className="word-search-section">
        <p className="affix-chalk-muted">单词索引加载失败，搜索不可用</p>
      </section>
    );
  }
  if (!ready) return null;

  // 搜索无结果时提示加入单词本
  if (hits.length === 0) {
    const word = query.trim().toLowerCase();
    const inWordbook = hasInWordbook?.(word) ?? false;
    return (
      <section className="word-search-section">
        <p className="word-search-no-result">未找到匹配「{word}」的单词</p>
        {onAddToWordbook && !inWordbook && (
          <button type="button" className="word-search-add-wordbook" onClick={handleAddToWordbook}>
            ＋ 将「{word}」加入单词本
          </button>
        )}
        {inWordbook && (
          <p className="word-search-in-wordbook">「{word}」已在单词本中</p>
        )}
        {addedToast && (
          <p className="word-search-added-toast">已加入单词本：{addedToast}</p>
        )}
      </section>
    );
  }

  return (
    <section className="word-search-section">
      <h2 className="word-search-title">匹配的单词 · {hits.length}</h2>
      <div className="word-search-list" ref={listRef}>
        {hits.map((hit, idx) => {
          const entry = catalogByKey.get(`${hit.textbook}:${hit.familyId}`);
          const myFamily = userFamilyByWord.get(hit.word);
          return (
            <div
              key={`${hit.textbook}-${hit.familyId}-${hit.word}`}
              role="button"
              tabIndex={0}
              className={`word-search-hit${idx === selectedIndex ? ' word-search-hit-selected' : ''}`}
              onClick={() => openHit(hit, hit.word)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') openHit(hit, hit.word);
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
      {(() => {
        const word = query.trim().toLowerCase();
        const exactHit = hits.some((h) => h.word === word);
        const inWordbook = hasInWordbook?.(word) ?? false;
        if (exactHit || inWordbook) return null;
        return (
          <button type="button" className="word-search-add-wordbook-inline" onClick={handleAddToWordbook}>
            ＋ 将「{word}」加入单词本
          </button>
        );
      })()}
      {addedToast && (
        <p className="word-search-added-toast">已加入单词本：{addedToast}</p>
      )}
    </section>
  );
}
