export type AffixKind = 'prefix' | 'suffix';

export interface AffixHint {
  form: string;
  kind: AffixKind;
  meaning?: string;
}

interface ScoredHint extends AffixHint {
  index: number;
}

function formatAffixLabel(h: AffixHint): string {
  const core = h.kind === 'suffix' ? `-${h.form}` : `${h.form}-`;
  return h.meaning ? `${core}（${h.meaning}）` : core;
}

function dedupeHints(hints: AffixHint[]): AffixHint[] {
  const seen = new Set<string>();
  const out: AffixHint[] = [];
  for (const h of hints) {
    const key = `${h.kind}:${h.form.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

const PREFIX_STOP = new Set(['the', 'and', 'with', 'process']);

/** 常见后缀形，避免被 prefixRe 误判为前缀 */
const COMMON_SUFFIX_FORMS = new Set([
  'ing', 'tion', 'sion', 'ness', 'ment', 'able', 'ible', 'ence', 'ance',
  'ency', 'ancy', 'ous', 'ive', 'ful', 'less', 'ly', 'al', 'er', 'or', 'ism', 'ist',
]);

function isSuffixMeaning(text?: string): boolean {
  if (!text) return false;
  return /后缀|词缀/.test(text) && !/前缀/.test(text);
}

function isDecompositionBoundary(mnemonic: string, matchIndex: number): boolean {
  return /\+\s*$/.test(mnemonic.slice(0, matchIndex));
}

function stripAffixForm(raw: string): string {
  return raw.replace(/^-+|-+$/g, '').toLowerCase();
}

/** 从教材助记中提取词缀线索，按在助记中出现的顺序排列 */
export function parseAffixHints(mnemonic?: string): AffixHint[] {
  if (!mnemonic?.trim()) return [];
  const scored: ScoredHint[] = [];

  // 带连字符的前缀：sur-（超过）
  const hyphenPrefixRe = /(?:^|[\s(（])([a-z]{1,8})-\s*[（(]([^）)]+)[）)]/g;
  let m: RegExpExecArray | null;
  while ((m = hyphenPrefixRe.exec(mnemonic)) !== null) {
    const form = stripAffixForm(m[1]);
    if (!form || PREFIX_STOP.has(form)) continue;
    if (isSuffixMeaning(m[2]?.trim())) continue;
    scored.push({
      form,
      kind: 'prefix',
      meaning: m[2]?.trim(),
      index: m.index + m[0].indexOf(m[1]),
    });
  }

  // 无前缀连字符：inter（在…之间）
  const prefixRe = /(?:^|\s)([a-z]{1,8})\s*[（(]([^）)]+)[）)]/g;
  while ((m = prefixRe.exec(mnemonic)) !== null) {
    if (isDecompositionBoundary(mnemonic, m.index)) continue;
    const form = stripAffixForm(m[1]);
    if (!form || PREFIX_STOP.has(form)) continue;
    if (COMMON_SUFFIX_FORMS.has(form)) continue;
    if (isSuffixMeaning(m[2]?.trim())) continue;
    scored.push({
      form,
      kind: 'prefix',
      meaning: m[2]?.trim(),
      index: m.index + m[0].search(/[a-z]/i),
    });
  }

  // 「+ 词根（…）」分解式：仅当明确标注后缀时才当作后缀
  const plusRe = /\+\s*(-?[a-zA-Z-]+)\s*(?:[（(]([^）)]+)[）)])?/g;
  while ((m = plusRe.exec(mnemonic)) !== null) {
    const raw = m[1];
    const meaning = m[2]?.trim() ?? '';
    if (!raw.startsWith('-') && !meaning.includes('后缀')) continue;
    scored.push({
      form: stripAffixForm(raw),
      kind: 'suffix',
      meaning: meaning || undefined,
      index: m.index,
    });
  }

  const suffixWordRe = /([a-z]{2,8})\s*[（(]([^）)]+)[）)]\s*(?:后缀|词缀)/g;
  while ((m = suffixWordRe.exec(mnemonic)) !== null) {
    scored.push({
      form: stripAffixForm(m[1]),
      kind: 'suffix',
      meaning: m[2]?.trim(),
      index: m.index,
    });
  }

  scored.sort((a, b) => a.index - b.index);
  return dedupeHints(scored);
}

export function isPlausibleAffixHint(h: AffixHint, kind: AffixKind): boolean {
  if (h.kind !== kind) return false;
  if (kind === 'prefix') {
    if (COMMON_SUFFIX_FORMS.has(h.form)) return false;
    if (isSuffixMeaning(h.meaning)) return false;
  }
  if (kind === 'suffix' && h.meaning && /前缀/.test(h.meaning)) return false;
  return true;
}

export function hintsToAffixLine(hints: AffixHint[]): string {
  return hints.map(formatAffixLabel).join('、');
}

export { formatAffixLabel };
