import { analyzeWordRoots, rootsForWord } from './rootHighlight';
import { parseAffixHints, type AffixHint } from './affixHint';

export type SegmentKind = 'plain' | 'prefix' | 'suffix' | 'root' | 'variant';

export interface WordSegment {
  text: string;
  kind: SegmentKind;
  label?: string;
  canonical?: string;
}

interface Span {
  start: number;
  end: number;
  kind: SegmentKind;
  label?: string;
  canonical?: string;
}

function normalizePos(pos?: string): string {
  return (pos ?? '').toLowerCase();
}

function inferSuffixFromPos(word: string, pos?: string): AffixHint | null {
  const p = normalizePos(pos);
  const w = word.toLowerCase();

  if (w.endsWith('ing') && w.length > 5 && (p.startsWith('v') || p.includes('ing形式'))) {
    return { form: 'ing', kind: 'suffix', meaning: '进行时 / 动名词' };
  }
  if (p.startsWith('adj') && w.endsWith('ive')) {
    return { form: 'ive', kind: 'suffix', meaning: '形容词后缀' };
  }
  if (p.startsWith('n') && w.endsWith('tion')) {
    return { form: 'tion', kind: 'suffix', meaning: '名词后缀' };
  }
  if (p.startsWith('n') && w.endsWith('ness')) {
    return { form: 'ness', kind: 'suffix', meaning: '名词后缀' };
  }
  if (p.startsWith('adv') && w.endsWith('ly')) {
    return { form: 'ly', kind: 'suffix', meaning: '副词后缀' };
  }
  return null;
}

function collectAffixSpans(word: string, mnemonic?: string, pos?: string): Span[] {
  const w = word.toLowerCase();
  const spans: Span[] = [];
  const hints = [...parseAffixHints(mnemonic)];
  const posHint = inferSuffixFromPos(word, pos);
  if (posHint) hints.push(posHint);

  for (const h of hints) {
    const form = h.form.toLowerCase();
    if (h.kind === 'suffix') {
      if (!w.endsWith(form)) continue;
      spans.push({
        start: w.length - form.length,
        end: w.length,
        kind: 'suffix',
        label: h.meaning ? `-${form}（${h.meaning}）` : `-${form}`,
      });
    } else {
      if (!w.startsWith(form)) continue;
      spans.push({
        start: 0,
        end: form.length,
        kind: 'prefix',
        label: h.meaning ? `${form}-（${h.meaning}）` : `${form}-`,
      });
    }
  }

  if (w.endsWith('ing') && w.length > 5 && !spans.some((s) => s.kind === 'suffix' && w.slice(s.start) === 'ing')) {
    spans.push({
      start: w.length - 3,
      end: w.length,
      kind: 'suffix',
      label: '-ing',
    });
  }

  return spans;
}

const COMMON_PREFIXES = ['pro', 're', 'ex', 'de', 'pre', 'dis', 'un', 'sub', 'super', 'inter', 'trans', 'in', 'im', 'en', 'em', 'ag'];

function promoteLeadingPrefix(segments: WordSegment[]): WordSegment[] {
  if (!segments.length || segments[0].kind !== 'plain') return segments;
  const lead = segments[0].text.toLowerCase();
  if (!COMMON_PREFIXES.includes(lead) || lead.length > 5) return segments;
  const rest = segments.slice(1);
  return [{ text: segments[0].text, kind: 'prefix', label: `${lead}-` }, ...rest];
}

function collectRootSpan(word: string, catalogRoots: string[], mnemonic?: string, rootHint?: string): Span | null {
  const matched = rootsForWord(catalogRoots, word, rootHint, mnemonic);
  const w = word.toLowerCase();
  let best: Span | null = null;

  for (const root of matched) {
    const idx = w.indexOf(root.toLowerCase());
    if (idx < 0) continue;
    const span: Span = {
      start: idx,
      end: idx + root.length,
      kind: 'root',
      label: root,
    };
    const analysis = analyzeWordRoots(catalogRoots, word, rootHint, mnemonic);
    if (analysis.primary?.isVariant) {
      span.kind = 'variant';
      span.canonical = analysis.primary.canonical;
      span.label = analysis.primary.canonical ? `${analysis.primary.canonical} → ${root}` : root;
    }
    if (!best || root.length > (best.end - best.start)) best = span;
  }

  return best;
}

function mergeSpans(spans: Span[]): Span[] {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end - (a.end - a.start));
  const out: Span[] = [];
  for (const s of sorted) {
    if (out.some((o) => s.start < o.end && s.end > o.start)) continue;
    out.push(s);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** 将单词拆为前缀 / 词根 / 后缀段落 */
export function breakdownWord(
  word: string,
  catalogRoots: string[],
  mnemonic?: string,
  pos?: string,
  rootHint?: string,
): WordSegment[] {
  const affixSpans = collectAffixSpans(word, mnemonic, pos);
  const rootSpan = collectRootSpan(word, catalogRoots, mnemonic, rootHint);
  const all = mergeSpans(rootSpan ? [...affixSpans, rootSpan] : affixSpans);

  if (!all.length) return [{ text: word, kind: 'plain' }];

  const segments: WordSegment[] = [];
  let cursor = 0;
  for (const span of all) {
    if (span.start > cursor) {
      segments.push({ text: word.slice(cursor, span.start), kind: 'plain' });
    }
    segments.push({
      text: word.slice(span.start, span.end),
      kind: span.kind,
      label: span.label,
      canonical: span.canonical,
    });
    cursor = span.end;
  }
  if (cursor < word.length) {
    segments.push({ text: word.slice(cursor), kind: 'plain' });
  }
  return promoteLeadingPrefix(segments.filter((s) => s.text.length > 0));
}

export function affixSearchPattern(hint: AffixHint): { re: RegExp; label: string } {
  const form = hint.form.toLowerCase();
  if (hint.kind === 'suffix') {
    return { re: new RegExp(`${form}$`, 'i'), label: `-${form}` };
  }
  return { re: new RegExp(`^${form}`, 'i'), label: `${form}-` };
}

/** 从笔记文本提取可检索的词缀（-ive、re- 等） */
export function parseAffixTokens(text: string): { form: string; kind: 'prefix' | 'suffix'; label: string }[] {
  const out: { form: string; kind: 'prefix' | 'suffix'; label: string }[] = [];
  const re = /(?:^|[\s、,，])(-([a-z]{2,8})|([a-z]{1,5})-)(?:[（(][^）)]+[）)])?/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[2]) {
      out.push({ form: m[2].toLowerCase(), kind: 'suffix', label: `-${m[2]}` });
    } else if (m[3]) {
      out.push({ form: m[3].toLowerCase(), kind: 'prefix', label: `${m[3]}-` });
    }
  }
  return out;
}
