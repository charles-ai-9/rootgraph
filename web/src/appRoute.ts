import type { CatalogEntry } from './types';

export type AppView =
  | { kind: 'home' }
  | { kind: 'family'; entry: CatalogEntry; focusWord?: string }
  | { kind: 'affix-library' }
  | { kind: 'wordbook' };

export type ParsedRoute =
  | { kind: 'home' }
  | { kind: 'affix-library' }
  | { kind: 'wordbook' }
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
  if (path === 'wordbook') return { kind: 'wordbook' };

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
  if (view.kind === 'wordbook') return '#/wordbook';
  // 本地词根（用户创建/编辑的词根）URL 段固定 'user'，深链/刷新时经 resolver 恢复 source 标记
  const tb = view.entry.source === 'user' ? 'user' : view.entry.textbook;
  const base = `#/family/${encodeURIComponent(tb)}/${encodeURIComponent(view.entry.id)}`;
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
  if (route.kind === 'wordbook') return { kind: 'wordbook' };

  // 用户自建词根族：不查 catalog，直接由注册的解析器从 localStorage 构造
  if (route.textbook === 'user') {
    const userEntry = userFamilyResolver?.(route.textbook, route.id);
    if (userEntry) return { kind: 'family', entry: userEntry, focusWord: route.focusWord };
    // 词根不存在（已删除等）：仍进入详情页显示友好提示，避免静默跳回首页造成"看不到详情"
    return {
      kind: 'family',
      entry: {
        id: route.id,
        file: '',
        chapter: '我的',
        chapterOrder: 999,
        titleZh: '',
        semanticLabel: '',
        roots: [],
        wordCount: 0,
        source: 'user',
        textbook: 'user',
      },
      focusWord: route.focusWord,
    };
  }

  const catalog = await loadCatalog();
  const entry = catalog.find((e) => e.textbook === route.textbook && e.id === route.id);
  if (!entry) return { kind: 'home' };
  return { kind: 'family', entry, focusWord: route.focusWord };
}
