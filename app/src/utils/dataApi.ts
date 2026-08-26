/**
 * 数据访问层：优先走 /api/db/* 端点，失败时 fallback 到静态 JSON。
 * SPA 生命周期内只 fetch 一次（内存缓存）。
 */
import type { CatalogEntry, RootFamily } from '../types';
import type { IndexedWord } from '../hooks/useWordIndex';

let catalogCache: CatalogEntry[] | null = null;
let catalogPromise: Promise<CatalogEntry[]> | null = null;

export async function fetchCatalog(): Promise<CatalogEntry[]> {
  if (catalogCache) return catalogCache;
  if (catalogPromise) return catalogPromise;

  catalogPromise = (async () => {
    try {
      const res = await fetch('/api/db/catalog');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      catalogCache = (await res.json()) as CatalogEntry[];
    } catch {
      // fallback: 静态 JSON
      const res = await fetch('/data/catalog.json');
      if (!res.ok) throw new Error('catalog load failed (API + fallback)');
      catalogCache = (await res.json()) as CatalogEntry[];
    }
    return catalogCache;
  })();

  return catalogPromise;
}

const familyCache = new Map<string, RootFamily>();
const familyPromises = new Map<string, Promise<RootFamily>>();

export async function fetchFamily(textbook: string, id: string, file?: string): Promise<RootFamily> {
  const key = `${textbook}/${id}`;
  if (familyCache.has(key)) return familyCache.get(key)!;
  if (familyPromises.has(key)) return familyPromises.get(key)!;

  const p = (async () => {
    let data: RootFamily;
    try {
      const res = await fetch(`/api/db/family/${encodeURIComponent(textbook)}/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = (await res.json()) as RootFamily;
    } catch {
      // fallback: 静态 JSON（需要 file 参数）
      if (!file) throw new Error(`family load failed (API + no fallback file for ${key})`);
      const res = await fetch(`/data/${textbook}/${file}`);
      if (!res.ok) throw new Error(`family load failed (API + fallback) for ${key}`);
      data = (await res.json()) as RootFamily;
    }
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
    try {
      const res = await fetch('/api/db/word-index');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
    } catch {
      // fallback: 从静态 JSON 构建索引（fetch catalog + 每个 family 文件）
      wordIndexCache = await buildWordIndexFromStatic();
    }
    return wordIndexCache;
  })();

  return wordIndexPromise;
}

/** fallback: 从静态 JSON 文件构建单词索引（替代旧的 loadWordIndex 逻辑） */
async function buildWordIndexFromStatic(): Promise<IndexedWord[]> {
  const catalogRes = await fetch('/data/catalog.json');
  if (!catalogRes.ok) throw new Error('fallback word-index: catalog load failed');
  const catalog = (await catalogRes.json()) as CatalogEntry[];
  const rows: IndexedWord[] = [];

  await Promise.all(
    catalog.map(async (entry) => {
      try {
        const familyRes = await fetch(`/data/${entry.textbook}/${entry.file}`);
        if (!familyRes.ok) return;
        const family = (await familyRes.json()) as { words?: Array<{ word: string; phonetic?: string; pos?: string; definition?: string; mnemonic?: string; frequency?: number }> };
        for (const w of family.words ?? []) {
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
      } catch {
        // 单个 family 加载失败不影响整体
      }
    }),
  );

  return rows;
}
