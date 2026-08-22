import { useEffect, useState } from 'react';
import type { CatalogEntry } from '../types';

export interface IndexedWord {
  word: string;
  textbook: string;
  familyId: string;
  file: string;
  phonetic?: string;
  pos?: string;
  definition?: string;
  mnemonic?: string;
  frequency?: number;
}

let cache: IndexedWord[] | null = null;
let loading: Promise<IndexedWord[]> | null = null;

export async function loadWordIndex(): Promise<IndexedWord[]> {
  if (cache) return cache;
  if (loading) return loading;

  loading = (async () => {
    const catalog: CatalogEntry[] = await fetch('/data/catalog.json').then((r) => r.json());
    const rows: IndexedWord[] = [];

    await Promise.all(
      catalog.map(async (entry) => {
        const family = await fetch(`/data/${entry.textbook}/${entry.file}`).then((r) => r.json());
        for (const w of family.words as {
          word: string;
          phonetic?: string;
          pos?: string;
          definition?: string;
          mnemonic?: string;
          frequency?: number;
        }[]) {
          rows.push({
            word: w.word,
            textbook: entry.textbook,
            familyId: entry.id,
            file: entry.file,
            phonetic: w.phonetic,
            pos: w.pos,
            definition: w.definition,
            mnemonic: w.mnemonic,
            frequency: w.frequency,
          });
        }
      }),
    );

    cache = rows
      .filter((row, i, arr) => arr.findIndex((r) => r.textbook === row.textbook && r.familyId === row.familyId && r.word === row.word) === i)
      .sort((a, b) => a.word.localeCompare(b.word));
    return cache;
  })();

  return loading;
}

export function useWordIndex() {
  const [index, setIndex] = useState<IndexedWord[]>(cache ?? []);
  const [ready, setReady] = useState(Boolean(cache));
  const [error, setError] = useState(false);

  useEffect(() => {
    loadWordIndex()
      .then((rows) => {
        setIndex(rows);
        setReady(true);
      })
      .catch(() => setError(true));
  }, []);

  return { index, ready, error };
}

export function searchWords(
  index: IndexedWord[],
  query: string,
  textbook?: string,
  limit = 24,
): IndexedWord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // 相关性排序：完全匹配 > 词首匹配 > 词内包含 > 仅释义/助记命中；同分按词频降序
  return index
    .filter((row) => {
      if (textbook && row.textbook !== textbook) return false;
      const hay = [row.word, row.phonetic, row.pos, row.definition, row.mnemonic]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return row.word.toLowerCase().includes(q) || hay.includes(q);
    })
    .map((row) => {
      const w = row.word.toLowerCase();
      let score: number;
      if (w === q) score = 100;
      else if (w.startsWith(q)) score = 80;
      else if (w.includes(q)) score = 60;
      else score = 40;
      return { row, score };
    })
    .sort(
      (a, b) =>
        b.score - a.score
        || (b.row.frequency ?? 0) - (a.row.frequency ?? 0)
        || a.row.word.localeCompare(b.row.word),
    )
    .slice(0, limit)
    .map((x) => x.row);
}

export type AffixScope = 'family' | 'textbook' | 'all';

export function findWordsByAffix(
  index: IndexedWord[],
  form: string,
  kind: 'prefix' | 'suffix',
  scope: AffixScope,
  ctx: { textbook: string; familyId: string },
  limit = 40,
): IndexedWord[] {
  const f = form.toLowerCase();
  const re = kind === 'suffix' ? new RegExp(`${f}$`, 'i') : new RegExp(`^${f}`, 'i');

  return index
    .filter((row) => {
      if (!re.test(row.word)) return false;
      if (scope === 'family') {
        return row.textbook === ctx.textbook && row.familyId === ctx.familyId;
      }
      if (scope === 'textbook') return row.textbook === ctx.textbook;
      return true;
    })
    .slice(0, limit);
}
