export type RootTokenKind = 'root' | 'variant' | 'plain';

export interface RootToken {
  kind: RootTokenKind;
  text: string;
  /** 变体时：所属教材词根 */
  canonical?: string;
}

export interface WordRootAnalysis {
  matched: string[];
  primary?: {
    form: string;
    isVariant: boolean;
    canonical?: string;
  };
}

export interface VariantCluster {
  label: string;
  catalogForms: string[];
  allForms: string[];
}

function normalizeRoot(r: string): string {
  return r.replace(/^-+/, '').trim().toLowerCase();
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function variantClusterId(root: string): string | null {
  const r = normalizeRoot(root);
  if (['ceed', 'cede', 'cess', 'ced'].includes(r) || /eed$|ede$|ess$/.test(r)) return 'ceed';
  if (['gress', 'gred', 'grad', 'gre'].includes(r) || /gress$|gred$|grad$/.test(r)) return 'gress';
  return null;
}

function isCatalogRoot(form: string, catalogRoots: string[]): boolean {
  const f = normalizeRoot(form);
  return catalogRoots.some((r) => normalizeRoot(r) === f);
}

function findCanonical(form: string, catalogRoots: string[]): string | undefined {
  const f = normalizeRoot(form);
  if (isCatalogRoot(f, catalogRoots)) return f;

  const cluster = variantClusterId(f);
  if (!cluster) return undefined;

  return catalogRoots.map(normalizeRoot).find((c) => variantClusterId(c) === cluster);
}

/** 同一词根族的常见拼写变体（ceed ↔ cede ↔ cess 等） */
export function expandRootVariants(roots: string[]): string[] {
  const out = new Set<string>();

  for (const root of roots) {
    const r = normalizeRoot(root);
    if (r.length < 3) continue;
    out.add(r);

    if (/eed$/.test(r)) {
      out.add(r.replace(/eed$/, 'ede'));
      out.add(r.replace(/eed$/, 'ess'));
      out.add(r.replace(/eed$/, 'ed'));
    }
    if (/ede$/.test(r)) {
      out.add(r.replace(/ede$/, 'eed'));
      out.add(r.replace(/ede$/, 'ess'));
      out.add(r.replace(/ede$/, 'ed'));
    }
    if (/ess$/.test(r)) {
      out.add(r.replace(/ess$/, 'eed'));
      out.add(r.replace(/ess$/, 'ede'));
    }
    if (/gress$/.test(r)) {
      out.add(r.replace(/gress$/, 'gred'));
      out.add(r.replace(/gress$/, 'grad'));
    }
    if (/gred$/.test(r)) {
      out.add(r.replace(/gred$/, 'gress'));
      out.add(r.replace(/gred$/, 'grad'));
    }
    if (/grad$/.test(r)) {
      out.add(r.replace(/grad$/, 'gress'));
      out.add(r.replace(/grad$/, 'gred'));
    }
  }

  return [...out].filter((x) => x.length >= 3);
}

function usableRoots(roots: string[]): string[] {
  return [...new Set(expandRootVariants(roots).filter((r) => /^[a-z*]/i.test(r)))].sort(
    (a, b) => b.length - a.length,
  );
}

/** 词根族拼写变体对照表（用于章节摘要） */
export function getVariantClusters(catalogRoots: string[]): VariantCluster[] {
  const groups = new Map<string, { catalog: Set<string>; all: Set<string> }>();

  for (const root of catalogRoots) {
    const r = normalizeRoot(root);
    if (r.length < 3) continue;
    const clusterId = variantClusterId(r) ?? r;
    if (!groups.has(clusterId)) {
      groups.set(clusterId, { catalog: new Set(), all: new Set() });
    }
    const g = groups.get(clusterId)!;
    g.catalog.add(r);
    expandRootVariants([r]).forEach((v) => g.all.add(v));
  }

  return [...groups.values()].map((g) => {
    const catalogForms = [...g.catalog].sort();
    const allForms = [...g.all].sort((a, b) => {
      const aCat = g.catalog.has(a) ? 0 : 1;
      const bCat = g.catalog.has(b) ? 0 : 1;
      return aCat - bCat || a.localeCompare(b);
    });
    return {
      label: catalogForms[0] ?? allForms[0],
      catalogForms,
      allForms,
    };
  });
}

export function hasExtraVariants(catalogRoots: string[]): boolean {
  return getVariantClusters(catalogRoots).some((c) => c.allForms.length > c.catalogForms.length);
}

/** 在文本中高亮词根；区分教材词根与拼写变体 */
export function tokenizeRootText(
  text: string,
  catalogRoots: string[],
  matchRoots?: string[],
): RootToken[] {
  const list = usableRoots(matchRoots ?? catalogRoots);
  if (!list.length) return [{ kind: 'plain', text }];

  const pattern = new RegExp(`(${list.map(escapeRegex).join('|')})`, 'gi');
  const parts = text.split(pattern).filter((p) => p.length > 0);

  return parts.map((part) => {
    const hit = list.find((r) => r.toLowerCase() === part.toLowerCase());
    if (!hit) return { kind: 'plain', text: part };

    if (isCatalogRoot(hit, catalogRoots)) {
      return { kind: 'root', text: part };
    }

    const canonical = findCanonical(hit, catalogRoots);
    return { kind: 'variant', text: part, canonical };
  });
}

export function hasRootMarkers(text: string, catalogRoots: string[], matchRoots?: string[]): boolean {
  return tokenizeRootText(text, catalogRoots, matchRoots).some((t) => t.kind !== 'plain');
}

export function hasVariantMarkers(text: string, catalogRoots: string[], matchRoots?: string[]): boolean {
  return tokenizeRootText(text, catalogRoots, matchRoots).some((t) => t.kind === 'variant');
}

export function hasCatalogRootMarkers(text: string, catalogRoots: string[], matchRoots?: string[]): boolean {
  return tokenizeRootText(text, catalogRoots, matchRoots).some((t) => t.kind === 'root');
}

/** 从词根族 + 单词推断要高亮的词根变体 */
export function rootsForWord(
  roots: string[],
  word: string,
  rootHint?: string,
  mnemonic?: string,
): string[] {
  const expanded = usableRoots(roots);
  const w = word.toLowerCase();

  const inWord = expanded.filter((r) => w.includes(r));
  if (inWord.length) {
    return [...new Set(inWord)].sort((a, b) => b.length - a.length);
  }

  if (mnemonic) {
    const bases = mnemonic.match(/\b[a-z]{4,}\b/gi) ?? [];
    for (const base of bases) {
      const b = base.toLowerCase();
      const fromBase = expanded.filter((r) => b.includes(r));
      if (fromBase.length) {
        return [...new Set(fromBase)].sort((a, b) => b.length - a.length);
      }
    }
  }

  if (rootHint) {
    const hintVariants = usableRoots([rootHint]);
    const fromHint = hintVariants.filter((r) => w.includes(r));
    if (fromHint.length) return fromHint.sort((a, b) => b.length - a.length);
  }

  return expanded;
}

/** 分析单词中实际出现的词根（含变体归属） */
export function analyzeWordRoots(
  catalogRoots: string[],
  word: string,
  rootHint?: string,
  mnemonic?: string,
): WordRootAnalysis {
  const matched = rootsForWord(catalogRoots, word, rootHint, mnemonic);
  const w = word.toLowerCase();
  const inWord = matched.filter((r) => w.includes(r));
  const primaryForm = inWord[0];

  if (!primaryForm) return { matched };

  const isVariant = !isCatalogRoot(primaryForm, catalogRoots);
  const canonical = isVariant ? findCanonical(primaryForm, catalogRoots) : undefined;

  return {
    matched,
    primary: {
      form: primaryForm,
      isVariant,
      canonical,
    },
  };
}
