import { formatAffixLabel, isPlausibleAffixHint, parseAffixHints, type AffixHint } from './affixHint';
import { findCategoryByForm } from './affixLibrary';
import { emptyAffixNote, type AffixItem, type AffixNoteData } from '../types';

const COMMON_SUFFIXES = [
  'ation',
  'ition',
  'ution',
  'sion',
  'tion',
  'ious',
  'eous',
  'able',
  'ible',
  'ment',
  'ness',
  'ingly',
  'ing',
  'ive',
  'ous',
  'ful',
  'less',
  'ally',
  'ly',
  'ity',
  'ness',
  'ist',
  'ism',
  'ment',
  'ence',
  'ance',
  'ency',
  'ancy',
  'ward',
  'wise',
  'ship',
  'hood',
  'dom',
  'ize',
  'ise',
  'ify',
  'fy',
  'ed',
  'er',
  'or',
  'ar',
  'ur',
  'al',
  'ics',
  'ic',
  'ess',
  'cess',
  'ceed',
  'cede',
];

const COMMON_PREFIXES = [
  'inter',
  'trans',
  'super',
  'sub',
  'over',
  'under',
  'pre',
  'pro',
  'dis',
  'mis',
  're',
  'de',
  'ex',
  'in',
  'im',
  'il',
  'ir',
  'un',
  'en',
  'em',
  'ag',
  'con',
  'com',
  'col',
  'cor',
  'per',
  'anti',
  'auto',
  'bio',
  'extra',
  'micro',
  'multi',
  'non',
  'out',
  'post',
  'sur',
];

export function formatHintAsAffix(h: AffixHint): string {
  return h.kind === 'suffix' ? `-${h.form}` : `${h.form}-`;
}

/** 统一词缀标签便于匹配（pro / pro- → pro） */
export function normalizeAffixLabel(label: string): string {
  const t = label.trim().toLowerCase();
  if (!t) return '';
  const parsed = affixFormForSearch(t);
  return parsed?.form ?? t.replace(/^-+|-+$/g, '');
}

/** 保留空行，便于「添加变体」后立刻出现输入框 */
export function parseVariantLines(text: string): string[] {
  if (!text) return [];
  return text.split('\n');
}

export function joinVariantLines(lines: string[]): string {
  return lines.join('\n');
}

function sortByLengthDesc(items: string[]): string[] {
  return [...items].sort((a, b) => b.length - a.length);
}

/** 从词缀库最长匹配推断（优先于 COMMON_* 列表） */
export function inferAffixFromLibrary(
  word: string,
  kind: 'prefix' | 'suffix',
  library: AffixItem[],
): AffixHint | null {
  const w = word.toLowerCase();
  const forms = [
    ...new Set(
      library
        .filter((i) => i.kind === kind)
        .map((i) => normalizeAffixLabel(i.name))
        .filter(Boolean),
    ),
  ].sort((a, b) => b.length - a.length);

  for (const form of forms) {
    // 单字母 form（o- / e- / s- / a-）首字母匹配误报率高（optics→o-、outline→o-），不参与拼写推断
    if (form.length < 2) continue;
    if (kind === 'prefix' && w.startsWith(form) && w.length > form.length + 2) {
      const item = findCategoryByForm(library, `${form}-`, kind);
      return { form, kind: 'prefix', meaning: item?.meaning };
    }
    if (kind === 'suffix' && w.endsWith(form) && w.length > form.length + 2) {
      const item = findCategoryByForm(library, `-${form}`, kind);
      return { form, kind: 'suffix', meaning: item?.meaning };
    }
  }
  return null;
}

/** 从拼写推断词缀（可返回前缀 + 后缀） */
export function inferAffixesFromWord(word: string, pos?: string): AffixHint[] {
  const w = word.toLowerCase();
  const p = (pos ?? '').toLowerCase();
  const hints: AffixHint[] = [];

  let prefixLen = 0;
  for (const pre of sortByLengthDesc(COMMON_PREFIXES)) {
    if (w.startsWith(pre) && w.length > pre.length + 2) {
      hints.push({ form: pre, kind: 'prefix' });
      prefixLen = pre.length;
      break;
    }
  }

  const stem = w.slice(prefixLen);
  for (const suf of sortByLengthDesc(COMMON_SUFFIXES)) {
    if (stem.endsWith(suf) && stem.length > suf.length + 1) {
      hints.push({ form: suf, kind: 'suffix' });
      break;
    }
  }

  if (p.startsWith('n') && !hints.some((h) => h.form === 'tion' && h.kind === 'suffix')) {
    if (w.endsWith('tion')) {
      hints.push({ form: 'tion', kind: 'suffix', meaning: '名词后缀' });
    }
  }

  return dedupeHints(hints);
}

export function inferAffixFromWord(word: string, pos?: string): AffixHint | null {
  return inferAffixesFromWord(word, pos)[0] ?? null;
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

function isPlausibleHint(h: AffixHint, kind: 'prefix' | 'suffix'): boolean {
  return isPlausibleAffixHint(h, kind);
}

function storedFormMatchesKind(current: string, kind: 'prefix' | 'suffix'): boolean {
  const parsed = affixFormForSearch(current);
  return parsed?.kind === kind;
}

/** 打开弹窗时按前缀/后缀分别推断并自动匹配词缀库 */
export function seedAffixNoteForKind(
  kind: 'prefix' | 'suffix',
  note: AffixNoteData,
  word: string,
  mnemonic?: string,
  pos?: string,
  libraryEntries?: AffixItem[],
): AffixNoteData {
  // 用户已确认该词无此类词缀：不再推断回填
  if (note.suppressed) return note;

  if (note.libraryRef && libraryEntries?.length) {
    const linked = libraryEntries.find((i) => i.id === note.libraryRef);
    if (linked && linked.kind === kind) return note;
  }

  if (note.current.trim() && storedFormMatchesKind(note.current, kind)) {
    // 推断回填的形不是用户输入：不自动绑定、不提取释义
    if (note.inferred) return note;
    if (libraryEntries?.length) {
      const match = findCategoryByForm(libraryEntries, note.current, kind);
      if (match) {
        return { ...note, libraryRef: match.id, knowledge: '' };
      }
    }
    // 词缀形已有但含义为空：从助记中重新提取，避免把空含义写进词缀库
    if (!note.knowledge.trim()) {
      const sameFormHint = parseAffixHints(mnemonic)
        .filter((h) => isPlausibleHint(h, kind))
        .find((h) => normalizeAffixLabel(h.form) === normalizeAffixLabel(note.current));
      if (sameFormHint?.meaning) {
        return { ...note, knowledge: sameFormHint.meaning };
      }
    }
    return note;
  }

  const hints = parseAffixHints(mnemonic).filter((h) => isPlausibleHint(h, kind));
  let hint: AffixHint | undefined;
  let trusted = false;

  if (libraryEntries?.length) {
    hint = inferAffixFromLibrary(word, kind, libraryEntries) ?? undefined;
    trusted = Boolean(hint);
  }
  if (!hint) {
    hint = hints.find((h) => h.kind === kind);
    trusted = Boolean(hint);
  }
  if (!hint) {
    hint = inferAffixesFromWord(word, pos).find((h) => h.kind === kind);
  }

  if (!hint) return { ...note, libraryRef: undefined, current: '', knowledge: '', inferred: undefined };

  // 词缀库 / 助记确认的词缀：填释义并自动绑定（信息完整可见）。
  // 单字母形（如 o- / e-）首字母匹配误报率高，只回填形；纯拼写推断同样只回填形。
  // inferred 标记推断来源，避免残留形下次打开被当作「用户已有词缀形」而自动绑定。
  const next: AffixNoteData = {
    ...note,
    libraryRef: undefined,
    current: formatHintAsAffix(hint),
    knowledge: note.knowledge,
    inferred: true,
  };

  if (trusted && hint.form.length >= 2) {
    if (!note.knowledge.trim() && hint.meaning) {
      next.knowledge = hint.meaning;
    }
    if (libraryEntries?.length) {
      const match = findCategoryByForm(libraryEntries, next.current, kind);
      if (match) {
        next.libraryRef = match.id;
        next.inferred = undefined;
      }
    }
  }
  return next;
}

export function hintSummaryForKind(mnemonic: string | undefined, kind: 'prefix' | 'suffix'): string {
  const hints = parseAffixHints(mnemonic).filter((h) => h.kind === kind);
  if (!hints.length) return '';
  return hints.map((h) => formatAffixLabel(h)).join('、');
}

export function hasInferredAffix(word: string, kind: 'prefix' | 'suffix', pos?: string, mnemonic?: string): boolean {
  if (parseAffixHints(mnemonic).some((h) => h.kind === kind)) return true;
  return inferAffixesFromWord(word, pos).some((h) => h.kind === kind);
}

/** @deprecated 使用 seedAffixNoteForKind */
export function seedAffixNote(
  note: AffixNoteData,
  word: string,
  mnemonic?: string,
  pos?: string,
  libraryEntries?: AffixItem[],
): AffixNoteData {
  return seedAffixNoteForKind('prefix', note, word, mnemonic, pos, libraryEntries);
}

export function affixFormForSearch(label: string): { form: string; kind: 'prefix' | 'suffix' } | null {
  const t = label.trim();
  if (!t) return null;
  if (t.startsWith('-')) return { form: t.slice(1).toLowerCase(), kind: 'suffix' };
  if (t.endsWith('-')) return { form: t.slice(0, -1).toLowerCase(), kind: 'prefix' };
  return { form: t.replace(/^-+/, '').toLowerCase(), kind: 'suffix' };
}

export interface WordAffixHighlight {
  before: string;
  mark: string;
  after: string;
}

/** 从候选词缀形中选出与单词拼写实际匹配的那一段（优先最长） */
export function pickAffixFormInWord(
  word: string,
  labels: string[],
  kind: 'prefix' | 'suffix',
): string | null {
  const lower = word.toLowerCase();
  const forms = [...new Set(labels.map(normalizeAffixLabel).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  for (const form of forms) {
    if (kind === 'prefix' && lower.startsWith(form) && lower.length > form.length + 1) return form;
    if (kind === 'suffix' && lower.endsWith(form) && lower.length > form.length + 1) return form;
  }
  return null;
}

/** 拆分单词以便高亮前缀/后缀部分（如 discern → dis + cern） */
export function highlightWordAffix(
  word: string,
  labels: string[],
  kind: 'prefix' | 'suffix',
): WordAffixHighlight | null {
  const form = pickAffixFormInWord(word, labels, kind);
  if (!form) return null;
  if (kind === 'prefix') {
    return { before: '', mark: word.slice(0, form.length), after: word.slice(form.length) };
  }
  return {
    before: word.slice(0, word.length - form.length),
    mark: word.slice(word.length - form.length),
    after: '',
  };
}

export function hintSummary(mnemonic?: string): string {
  const hints = parseAffixHints(mnemonic);
  if (!hints.length) return '';
  return hints.map((h) => formatAffixLabel(h)).join('、');
}

export { emptyAffixNote };
