import { useCallback, useEffect, useState } from 'react';

export interface WordbookEntry {
  word: string;
  phonetic?: string;
  pos?: string;
  definition?: string;
  addedAt: number;
  source?: string;
}

const STORAGE_KEY = 'rootgraph-wordbook-v1';

function loadWordbook(): WordbookEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is WordbookEntry =>
        typeof e === 'object' && e !== null && typeof e.word === 'string' && typeof e.addedAt === 'number',
    );
  } catch {
    return [];
  }
}

function saveWordbook(entries: WordbookEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

export function useWordbook() {
  const [entries, setEntries] = useState<WordbookEntry[]>(loadWordbook);

  useEffect(() => {
    const onStorage = () => setEntries(loadWordbook());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addWord = useCallback((word: string, meta?: Omit<WordbookEntry, 'word' | 'addedAt'>) => {
    setEntries((prev) => {
      if (prev.some((e) => e.word === word)) return prev;
      const next = [{ word, addedAt: Date.now(), ...meta }, ...prev];
      saveWordbook(next);
      return next;
    });
  }, []);

  const removeWord = useCallback((word: string) => {
    setEntries((prev) => {
      const next = prev.filter((e) => e.word !== word);
      saveWordbook(next);
      return next;
    });
  }, []);

  const reorder = useCallback((fromIndex: number, toIndex: number) => {
    setEntries((prev) => {
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveWordbook(next);
      return next;
    });
  }, []);

  const hasWord = useCallback(
    (word: string) => entries.some((e) => e.word === word),
    [entries],
  );

  return { entries, addWord, removeWord, reorder, hasWord };
}
