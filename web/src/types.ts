export type WordStatus = 'new' | 'understood' | 'review';

export interface WordEntry {
  word: string;
  phonetic?: string;
  pos?: string;
  definition?: string;
  frequency?: number;
  mnemonic?: string;
  collocations: string[];
  etymology?: string;
  examples: string[];
  rootHint?: string;
}

export interface RootFamily {
  id: string;
  source: string;
  chapter: string;
  chapterOrder?: number;
  titleZh: string;
  semanticLabel?: string;
  meaningEn?: string;
  meaningZh?: string;
  roots: string[];
  words: WordEntry[];
}

export interface CatalogEntry {
  id: string;
  file: string;
  chapter: string;
  chapterOrder?: number;
  titleZh: string;
  semanticLabel: string;
  meaningEn?: string;
  meaningZh?: string;
  roots: string[];
  wordCount: number;
  source: string;
  textbook: string;
}

export interface ProgressState {
  [wordKey: string]: WordStatus;
}

/** 单词词缀笔记（localStorage，每词独立） */
export interface AffixNoteData {
  /** 本词词缀，如 -or、pro- */
  current: string;
  /** 变体 / 联想，每行一个 */
  variants: string;
  knowledge: string;
  evolution: string;
  /** 引用词缀库条目 id */
  libraryRef?: string;
}

/** 每词前缀 + 后缀各一份笔记 */
export interface WordAffixNotes {
  prefix: AffixNoteData;
  suffix: AffixNoteData;
}

export type WordAffixKind = 'prefix' | 'suffix';
export type AffixKind = WordAffixKind | 'root';

/** 词缀库条目（一词缀一行，可归属父类组） */
export interface AffixItem {
  id: string;
  kind: AffixKind;
  /** 词缀名，如 de-、-able */
  name: string;
  /** 词性，如 n. adj. */
  pos: string;
  /** 含义 */
  meaning: string;
  /** 备注（Markdown） */
  note: string;
  /** 是否为父类（组根） */
  isParent: boolean;
  /** 所属父类 id；无则独立或与 isParent 自成一组 */
  parentId?: string;
  /** 教材序号（来自总结表） */
  order?: number;
  updatedAt: number;
}

/** @deprecated 迁移用 */
export interface AffixMeaningBlock {
  id: string;
  label: string;
  content: string;
}

/** @deprecated 迁移用 */
export interface AffixCategory {
  id: string;
  kind: AffixKind;
  title: string;
  forms: string[];
  blocks: AffixMeaningBlock[];
  updatedAt: number;
}

/** @deprecated 旧扁平条目，仅用于迁移 */
export interface AffixLibraryEntry {
  id: string;
  name: string;
  meaning: string;
  updatedAt: number;
}

export function emptyAffixNote(): AffixNoteData {
  return { current: '', variants: '', knowledge: '', evolution: '' };
}

export function emptyWordAffixNotes(): WordAffixNotes {
  return { prefix: emptyAffixNote(), suffix: emptyAffixNote() };
}

export function hasAffixNoteContent(note: AffixNoteData): boolean {
  return Boolean(
    note.libraryRef
    || note.current.trim()
    || note.variants.trim()
    || note.knowledge.trim()
    || note.evolution.trim(),
  );
}

/** @deprecated 兼容旧字段 */
export type LegacyAffixNote = AffixNoteData & { affixes?: string };

export function catalogEntryKey(entry: CatalogEntry): string {
  return `${entry.textbook}/${entry.id}`;
}

export function wordKey(textbook: string, familyId: string, word: string): string {
  return `${textbook}/${familyId}/${word}`;
}

export function familyKey(textbook: string, familyId: string): string {
  return `${textbook}/${familyId}`;
}

/** 清洗目录词根（去掉解析噪声） */
export function cleanRoots(roots: string[]): string[] {
  return roots
    .map((r) => r.replace(/^-+/, '').trim())
    .filter((r) => r.length >= 2 && r.length <= 12 && /^[a-zA-Z*]/.test(r));
}

/** 主标题：目录词根，如 cern · crim · cris */
export function displayRoots(entry: CatalogEntry): string {
  const roots = cleanRoots(entry.roots);
  if (roots.length) return roots.join(' · ');
  return entry.id;
}

/** 副标题：语义含义，如「区分 · 分别 · 单独」 */
export function displaySemantic(entry: CatalogEntry): string | null {
  const zh = entry.meaningZh?.trim();
  const label = entry.semanticLabel?.trim();
  const en = entry.meaningEn?.trim();

  if (zh && /[\u4e00-\u9fff]/.test(zh) && zh.length <= 28) return zh;

  if (label && /[\u4e00-\u9fff]/.test(label)) {
    const cleaned = label
      .replace(/^flat[，,]?/i, '')
      .replace(/与.*?有关[。.]?/g, '')
      .replace(/词源含义/g, '')
      .trim();
    if (cleaned.length >= 2 && cleaned.length <= 28) return cleaned;
    const snippet = label.match(/[\u4e00-\u9fff；;，,]{2,28}/);
    if (snippet) return snippet[0].replace(/[；;，,]+$/, '');
  }

  if (label && /^[a-zA-Z\s,/·]+$/.test(label) && label.length <= 32) return label;
  if (en && en.length <= 36) return en;
  if (label && label.length <= 36 && !label.includes('flat，与')) return label;

  return null;
}

/** 页面主标题 = 词根 */
export function displayTitle(entry: CatalogEntry): string {
  return displayRoots(entry);
}
