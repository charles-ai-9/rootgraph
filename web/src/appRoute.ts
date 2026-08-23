import type { CatalogEntry } from './types';

export type AppView =
  | { kind: 'home' }
  | { kind: 'family'; entry: CatalogEntry; focusWord?: string }
  | { kind: 'affix-library' };

export type ParsedRoute =
  | { kind: 'home' }
  | { kind: 'affix-library' }
  | { kind: 'family'; textbook: string; id: string; focusWord?: string };

let catalogCache: CatalogEntry[] | null = null;

/**
 * 用户自建词根族解析器（由 useNotes 注册）。
 * 自建族存在 localStorage 而非静态 catalog，resolveRoute 需经此构造 entry。
 */
let userFamilyResolver: ((textbook: string, id: string) => CatalogEntry | undefined) | null = null;

export function registerUserFamilyResolver(
  resolver: (textbook: string, id: string) => CatalogEntry | undefined,
): void {
  userFamilyResolver = resolver;
}

export async function loadCatalog(): Promise<CatalogEntry[]> {
  if (catalogCache) return catalogCache;
  const res = await fetch('/data/catalog.json');
  if (!res.ok) throw new Error('catalog load failed');
  catalogCache = (await res.json()) as CatalogEntry[];
  return catalogCache;
}

export function parseRouteHash(hash: string): ParsedRoute {
  const path = hash.replace(/^#/, '').replace(/^\/?/, '') || '';
  if (!path || path === '/') return { kind: 'home' };
  if (path === 'affix-library') return { kind: 'affix-library' };

  const familyMatch = path.match(/^family\/([^/?#]+)\/([^/?#]+)/);
  if (!familyMatch) return { kind: 'home' };

  const [, textbook, id] = familyMatch;
  const query = path.includes('?') ? path.slice(path.indexOf('?')) : '';
  const params = new URLSearchParams(query);
  const focusWord = params.get('word')?.trim() || undefined;

  return { kind: 'family', textbook: decodeURIComponent(textbook), id: decodeURIComponent(id), focusWord };
}

export function routeHashFromView(view: AppView): string {
  if (view.kind === 'home') return '#/';
  if (view.kind === 'affix-library') return '#/affix-library';
  const base = `#/family/${encodeURIComponent(view.entry.textbook)}/${encodeURIComponent(view.entry.id)}`;
  if (view.focusWord) {
    return `${base}?word=${encodeURIComponent(view.focusWord)}`;
  }
  return base;
}

export function routeNeedsCatalog(route: ParsedRoute): boolean {
  return route.kind === 'family';
}

export async function resolveRoute(route: ParsedRoute): Promise<AppView> {
  if (route.kind === 'home') return { kind: 'home' };
  if (route.kind === 'affix-library') return { kind: 'affix-library' };

  // 用户自建词根族：不查 catalog，直接由注册的解析器从 localStorage 构造
  if (route.textbook === 'user') {
    const userEntry = userFamilyResolver?.(route.textbook, route.id);
    return userEntry ? { kind: 'family', entry: userEntry, focusWord: route.focusWord } : { kind: 'home' };
  }

  const catalog = await loadCatalog();
  const entry = catalog.find((e) => e.textbook === route.textbook && e.id === route.id);
  if (!entry) return { kind: 'home' };
  return { kind: 'family', entry, focusWord: route.focusWord };
}
