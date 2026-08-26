import type { CatalogEntry, RootFamily, WordEntry } from '../types';
import { cleanRoots, displaySemantic } from '../types';

function assignWordRootKey(word: WordEntry, usable: string[]): string {
  const hint = (word.rootHint ?? '').toLowerCase();
  const w = word.word.toLowerCase();
  const byLength = [...usable].sort((a, b) => b.length - a.length);

  const hintExact = usable.find((r) => hint === r.toLowerCase());
  if (hintExact) return hintExact;

  const hintMatch = byLength.find((r) => hint.includes(r.toLowerCase()));
  if (hintMatch) return hintMatch;

  const wordMatch = byLength.find((r) => w.includes(r.toLowerCase()));
  if (wordMatch) return wordMatch;

  return usable[0] ?? 'words';
}

export function groupWordsByRoot(words: WordEntry[], roots: string[]): Map<string, WordEntry[]> {
  const usable = cleanRoots(roots);
  const groups = new Map<string, WordEntry[]>();
  for (const r of usable) groups.set(r, []);
  const fallback = usable[0] ?? 'words';
  if (!groups.has(fallback)) groups.set(fallback, []);

  for (const w of words) {
    const key = assignWordRootKey(w, usable.length ? usable : [fallback]);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(w);
  }

  for (const [k, list] of groups) {
    if (list.length === 0) groups.delete(k);
  }
  return groups;
}

export function familySummary(
  family: RootFamily,
  entry: CatalogEntry,
  overrides?: { roots?: string[]; semantic?: string | null },
): string {
  const rawRoots = overrides?.roots ?? family.roots;
  const roots = cleanRoots(rawRoots);
  const rootLine = roots.length ? roots.join(' / ') : rawRoots.slice(0, 6).join(' / ');
  const semantic = overrides?.semantic !== undefined ? overrides.semantic : displaySemantic(entry);

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
