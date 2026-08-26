/**
 * 数据访问层：统一走 /api/db/* 端点，SPA 生命周期内只 fetch 一次（内存缓存）。
 * 替代旧的 fetch('/data/catalog.json') / fetch('/data/textbook-N/*.json') / loadWordIndex() 183 文件。
 */
import type { CatalogEntry, RootFamily } from '../types';
import type { IndexedWord } from '../hooks/useWordIndex';

let catalogCache: CatalogEntry[] | null = null;
let catalogPromise: Promise<CatalogEntry[]> | null = null;

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  if (catalogCache) return catalogCache;
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    const res = await fetch('/api/db/catalog');
    if (!res.ok) throw new Error(`catalog fetch failed: ${res.status}`);
    catalogCache = (await res.json()) as CatalogEntry[];
    return catalogCache;
  })();

  return catalogPromise;
}

const familyCache = new Map<string, RootFamily>();
const familyPromises = new Map<string, Promise<RootFamily>>();

export async function fetchFamily(textbook: string, id: string): Promise<RootFamily> {
  const key = `${textbook}/${id}`;
  if (familyCache.has(key)) return familyCache.get(key)!;
  if (familyPromises.has(key)) return familyPromises.get(key)!;

  const p = (async () => {
    const res = await fetch(`/api/db/family/${encodeURIComponent(textbook)}/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error(`family fetch failed: ${res.status}`);
    const data = (await res.json()) as RootFamily;
    familyCache.set(key, data);
    return data;
  })();

  familyPromises.set(key, p);
  return p;
}

let wordIndexCache: IndexedWord[] | null = null;
let wordIndexPromise: Promise<IndexedWord[]> | null = null;

export async function fetchWordIndex(): Promise<IndexedWord[]> {
  if (wordIndexCache) return wordIndexCache;
  if (wordIndexPromise) return wordIndexPromise;

  wordIndexPromise = (async () => {
    const res = await fetch('/api/db/word-index');
    if (!res.ok) throw new Error(`word-index fetch failed: ${res.status}`);
    const raw = (await res.json()) as Array<{
      word: string;
      textbook: string;
      familyId: string;
      phonetic?: string;
      pos?: string;
      definition?: string;
      mnemonic?: string;
      frequency?: number;
    }>;
    // 映射为前端 IndexedWord 格式（保留 file 字段兼容）
    wordIndexCache = raw.map((r) => ({
      word: r.word,
      textbook: r.textbook,
      familyId: r.familyId,
      file: '',
      phonetic: r.phonetic,
      pos: r.pos,
      definition: r.definition,
      mnemonic: r.mnemonic,
      frequency: r.frequency,
    }));
    return wordIndexCache;
  })();

  return wordIndexPromise;
}
