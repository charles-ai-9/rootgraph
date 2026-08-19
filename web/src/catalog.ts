import type { CatalogEntry } from './types';
import { catalogEntryKey, displayRoots, displaySemantic } from './types';

const TEXTBOOK_LABELS: Record<string, string> = {
  'textbook-1': '教材1',
  'textbook-2': '教材2',
  'textbook-3': '教材3',
  'textbook-4': '教材4',
  'textbook-5': '教材5',
  'textbook-6': '教材6',
  'textbook-7': '教材7',
  'textbook-8': '教材8',
};

export function textbookLabel(id: string): string {
  return TEXTBOOK_LABELS[id] ?? id;
}

/** 选中教材后，按目录词根列出可筛选的章节 */
export function rootChapterOptions(entries: CatalogEntry[], textbook: string) {
  if (textbook === 'all') return [];

  return entries
    .filter((e) => e.textbook === textbook)
    .sort((a, b) => (a.chapterOrder ?? 999) - (b.chapterOrder ?? 999))
    .map((e) => ({
      key: catalogEntryKey(e),
      chapter: e.chapter,
      roots: displayRoots(e),
      semantic: displaySemantic(e),
      order: e.chapterOrder ?? 999,
    }));
}

export function familyStorageKey(textbook: string, familyId: string): string {
  return `${textbook}/${familyId}`;
}
