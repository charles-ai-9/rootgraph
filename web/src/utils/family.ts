import type { CatalogEntry, RootFamily, WordEntry } from '../types';
import { cleanRoots, displaySemantic } from '../types';

export function groupWordsByRoot(words: WordEntry[], roots: string[]): Map<string, WordEntry[]> {
  const usable = cleanRoots(roots);
  const groups = new Map<string, WordEntry[]>();
  for (const r of usable) groups.set(r, []);
  const fallback = usable[0] ?? 'words';
  if (!groups.has(fallback)) groups.set(fallback, []);

  for (const w of words) {
    const hint = (w.rootHint ?? '').toLowerCase();
    const key =
      usable.find((r) => hint.includes(r.toLowerCase()) || w.word.toLowerCase().includes(r.toLowerCase())) ??
      fallback;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  for (const [k, list] of groups) {
    if (list.length === 0) groups.delete(k);
  }
  return groups;
}

export function familySummary(family: RootFamily, entry: CatalogEntry): string {
  const roots = cleanRoots(family.roots);
  const rootLine = roots.length ? roots.join(' / ') : family.roots.slice(0, 6).join(' / ');
  const semantic = displaySemantic(entry);

  const parts = [`词根变体：${rootLine}`];
  if (semantic) parts.push(`语义：${semantic}`);
  return parts.join('\n');
}

export function parseMnemonicChain(mnemonic?: string): { parts: string[]; conclusion?: string } {
  if (!mnemonic) return { parts: [] };
  const segments = mnemonic.split(/→/).map((s) => s.trim()).filter(Boolean);
  if (segments.length <= 1) return { parts: [mnemonic] };
  return { parts: segments.slice(0, -1), conclusion: segments[segments.length - 1] };
}

// re-export for components that imported cleanRoots from here
export { cleanRoots } from '../types';
