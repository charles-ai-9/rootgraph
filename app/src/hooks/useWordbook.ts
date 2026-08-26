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
const LAST_GOOD_KEY = 'rootgraph-wordbook-last-good';

function parseEntries(raw: string | null): WordbookEntry[] {
  if (!raw) return [];
  try {
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

function loadWordbook(): WordbookEntry[] {
  const main = parseEntries(localStorage.getItem(STORAGE_KEY));
  if (main.length || !localStorage.getItem(STORAGE_KEY)) return main;
  // 主数据损坏：从 last-good 恢复
  return parseEntries(localStorage.getItem(LAST_GOOD_KEY));
}

function saveWordbook(entries: WordbookEntry[]): void {
  try {
    const json = JSON.stringify(entries);
    localStorage.setItem(STORAGE_KEY, json);
    localStorage.setItem(LAST_GOOD_KEY, json);
  } catch {
    // ignore
  }
}

/** 合并保存：本页最新优先 + localStorage 现有词条补充（其他标签页新增不丢） */
function saveWordbookMerged(next: WordbookEntry[]): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const cur = raw ? JSON.parse(raw) : [];
    if (Array.isArray(cur)) {
      const seen = new Set(next.map((e) => e.word));
      const merged = [...next];
      for (const e of cur) {
        if (!seen.has(e.word)) merged.push(e);
      }
      saveWordbook(merged);
      return;
    }
  } catch {
    /* ignore */
  }
  saveWordbook(next);
}

export function useWordbook() {
  const [entries, setEntries] = useState<WordbookEntry[]>(loadWordbook);

  useEffect(() => {
    const onChanged = () => setEntries(loadWordbook());
    // storage 事件（其他标签页/设备导入）+ 同步完成事件（远端拉取后）
    window.addEventListener('storage', onChanged);
    window.addEventListener('rootgraph-wordbook-updated', onChanged);
    return () => {
      window.removeEventListener('storage', onChanged);
      window.removeEventListener('rootgraph-wordbook-updated', onChanged);
    };
  }, []);

  const addWord = useCallback((word: string, meta?: Omit<WordbookEntry, 'word' | 'addedAt'>) => {
    setEntries((prev) => {
      if (prev.some((e) => e.word === word)) return prev;
      const next = [{ word, addedAt: Date.now(), ...meta }, ...prev];
      saveWordbookMerged(next);
      return next;
    });
  }, []);

  const removeWord = useCallback((word: string) => {
    // 同步从 localStorage 删除该词（防合并保存"复活"）
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cur = JSON.parse(raw);
        if (Array.isArray(cur)) {
          saveWordbook(cur.filter((e: WordbookEntry) => e.word !== word));
        }
      }
    } catch {
      /* ignore */
    }
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
