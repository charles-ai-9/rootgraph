import { useEffect, useState } from 'react';
import { fetchWordIndex } from '../utils/dataApi';

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

  loading = fetchWordIndex().then((rows) => {
    cache = rows;
    return rows;
  });

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

/** 编辑距离（Levenshtein），超过 max 提前截断 */
function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export function searchWords(
  index: IndexedWord[],
  query: string,
  textbook?: string,
  limit = 24,
): IndexedWord[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // 教材筛选时，「我的词根」词（textbook='user'）恒显示——它们不归具体教材，但属于用户的个人词本
  const inScope = (row: IndexedWord) =>
    !textbook || row.textbook === textbook || row.textbook === 'user';

  // 相关性排序：完全匹配 > 词首匹配 > 词内包含 > 仅释义/助记命中；同分按词频降序
  const hits = index
    .filter((row) => {
      if (!inScope(row)) return false;
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

  // 拼写容错：无包含命中且输入较长时，用编辑距离 ≤1 找相近词（如 judgement ↔ judgment）
  if (hits.length === 0 && q.length >= 4) {
    return index
      .filter((row) => {
        if (!inScope(row)) return false;
        const w = row.word.toLowerCase();
        if (Math.abs(w.length - q.length) > 1) return false;
        return editDistance(w, q, 1) <= 1;
      })
      .sort(
        (a, b) =>
          editDistance(a.word.toLowerCase(), q, 1) - editDistance(b.word.toLowerCase(), q, 1)
          || (b.frequency ?? 0) - (a.frequency ?? 0),
      )
      .slice(0, limit);
  }

  return hits;
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
