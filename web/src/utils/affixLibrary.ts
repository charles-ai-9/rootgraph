import type { AffixItem, AffixKind, AffixNoteData } from '../types';
import { normalizeAffixLabel } from './affixNote';
import { joinAffixForms } from './affixFormDisplay';

/** 组的根 id：父类自身，或指向的 parentId */
export function groupRootId(item: AffixItem): string {
  if (item.parentId) return item.parentId;
  if (item.isParent) return item.id;
  return item.id;
}

export function getGroupMembers(rootId: string, items: AffixItem[]): AffixItem[] {
  const root = items.find((i) => i.id === rootId);
  if (!root) return [];
  const children = items.filter((i) => i.parentId === rootId);
  return children.length ? [root, ...children] : [root];
}

export function getParentItem(item: AffixItem, items: AffixItem[]): AffixItem | undefined {
  if (!item.parentId) return undefined;
  return items.find((i) => i.id === item.parentId);
}

export function parentDisplayName(item: AffixItem, items: AffixItem[]): string {
  const parent = getParentItem(item, items);
  if (parent) return parent.name;
  if (item.isParent) return item.name;
  return '—';
}

export function getItemGroup(item: AffixItem, items: AffixItem[]): AffixItem[] {
  return getGroupMembers(groupRootId(item), items);
}

export function groupLabel(item: AffixItem, items: AffixItem[]): string {
  const members = getItemGroup(item, items);
  if (members.length <= 1) return '—';
  const root = members[0];
  return `${root.name} 组`;
}

export function findItemByForm(
  items: AffixItem[],
  affixLabel: string,
  kind?: AffixKind,
): AffixItem | undefined {
  const target = normalizeAffixLabel(affixLabel);
  if (!target) return undefined;
  return items.find((i) => {
    if (kind && i.kind !== kind) return false;
    return normalizeAffixLabel(i.name) === target;
  });
}

export function rankItems(
  items: AffixItem[],
  affixLabel: string,
  kind?: AffixKind,
): AffixItem[] {
  const target = normalizeAffixLabel(affixLabel);
  const pool = kind ? items.filter((i) => i.kind === kind) : items;
  if (!target) return [...pool].sort((a, b) => b.updatedAt - a.updatedAt);

  const matched = new Set<string>();
  for (const item of pool) {
    if (normalizeAffixLabel(item.name) === target) {
      for (const m of getItemGroup(item, pool)) matched.add(m.id);
    }
  }

  return [...pool].sort((a, b) => {
    const aIn = matched.has(a.id) ? 0 : 1;
    const bIn = matched.has(b.id) ? 0 : 1;
    if (aIn !== bIn) return aIn - bIn;
    return a.name.localeCompare(b.name, 'zh-CN');
  });
}

export function filterItemsByKind(items: AffixItem[], kind: AffixKind): AffixItem[] {
  return items.filter((i) => i.kind === kind);
}

export function parentCandidates(items: AffixItem[], kind: AffixKind, excludeId?: string): AffixItem[] {
  return items.filter((i) => i.kind === kind && i.isParent && i.id !== excludeId);
}

export function resolveAffixNote(
  note: AffixNoteData,
  item: AffixItem | undefined,
): AffixNoteData {
  if (!note.libraryRef || !item) return note;
  return {
    libraryRef: note.libraryRef,
    current: note.current.trim() || item.name,
    variants: note.variants,
    knowledge: [item.pos, item.meaning].filter(Boolean).join(' · '),
    evolution: note.evolution,
  };
}

export function itemFromNote(kind: AffixKind, note: AffixNoteData): Omit<AffixItem, 'id' | 'updatedAt'> {
  return {
    kind,
    name: note.current.trim(),
    pos: '',
    meaning: note.knowledge.trim(),
    note: '',
    isParent: false,
  };
}

/** 搜索：命中任一词缀形则返回整组 id 集合 */
export function searchMatchingGroupIds(items: AffixItem[], query: string, kind: AffixKind): Set<string> {
  const q = query.trim().toLowerCase();
  const result = new Set<string>();
  if (!q) return result;

  for (const item of items.filter((i) => i.kind === kind)) {
    const hay = [item.name, item.pos, item.meaning, item.note].join(' ').toLowerCase();
    if (hay.includes(q) || normalizeAffixLabel(item.name).includes(normalizeAffixLabel(q))) {
      for (const m of getItemGroup(item, items)) result.add(m.id);
    }
  }
  return result;
}

/** 组根：无 parentId（null/undefined 均视为组根） */
export function isGroupRoot(item: AffixItem): boolean {
  return item.parentId == null;
}

/** 列表展示：每组一行，仅以组根聚类 */
export function clusterItemsForList(items: AffixItem[], kind: AffixKind): AffixItem[][] {
  const pool = filterItemsByKind(items, kind);
  const roots = pool.filter((item) => isGroupRoot(item));

  return roots
    .map((root) => getGroupMembers(root.id, items).filter((i) => i.kind === kind))
    .filter((group) => group.length)
    .sort((a, b) => {
      const ao = a[0]?.order ?? 9999;
      const bo = b[0]?.order ?? 9999;
      if (ao !== bo) return ao - bo;
      const an = a[0]?.name ?? '';
      const bn = b[0]?.name ?? '';
      return an.localeCompare(bn, 'zh-CN');
    });
}

export function previewAffixExamples(note: string, maxLen = 140): string {
  const text = note.replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}…`;
}

export interface AffixGroupRow {
  order: number;
  root: AffixItem;
  members: AffixItem[];
  formsLabel: string;
  meaning: string;
  examplesPreview: string;
}

export interface AffixGroupDraft {
  rootId?: string;
  kind: AffixKind;
  forms: string[];
  meaning: string;
  order?: number;
}

export function groupToDraft(root: AffixItem, items: AffixItem[]): AffixGroupDraft {
  const members = getGroupMembers(root.id, items).filter((m) => m.kind === root.kind);
  return {
    rootId: root.id,
    kind: root.kind,
    forms: members.map((m) => m.name).filter(Boolean),
    meaning: root.meaning,
    order: root.order,
  };
}

export function emptyGroupDraft(kind: AffixKind): AffixGroupDraft {
  return { kind, forms: [''], meaning: '' };
}

/** 表格一行一组，对齐 Excel 总结表 */
export function listGroupsForTable(items: AffixItem[], kind: AffixKind, query: string): AffixGroupRow[] {
  const clusters = clusterItemsForList(items, kind);
  const q = query.trim().toLowerCase();

  let groups: AffixGroupRow[] = clusters.map((members) => {
    const root = members.find((m) => m.isParent) ?? members[0];
    const noteSource = root.note.trim() || members.find((m) => m.note.trim())?.note || '';
    return {
      order: root.order ?? 9999,
      root,
      members,
      formsLabel: joinAffixForms(
        members.map((m) => m.name),
        kind,
      ),
      meaning: root.meaning,
      examplesPreview: previewAffixExamples(noteSource),
    };
  });

  if (q) {
    const matchIds = searchMatchingGroupIds(items, query, kind);
    groups = groups.filter((g) => {
      if (g.members.some((m) => matchIds.has(m.id))) return true;
      const hay = [g.formsLabel, g.meaning, g.examplesPreview, g.root.note].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }

  return groups.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    return a.root.name.localeCompare(b.root.name, 'zh-CN');
  });
}

/** 表格用扁平列表（搜索命中整组） */
export function listItemsForTable(items: AffixItem[], kind: AffixKind, query: string): AffixItem[] {
  const pool = filterItemsByKind(items, kind);
  const q = query.trim().toLowerCase();

  let result: AffixItem[];
  if (!q) {
    result = pool;
  } else {
    const matchIds = searchMatchingGroupIds(items, query, kind);
    const included = new Set<string>();
    for (const item of pool) {
      const hay = [item.name, item.pos, item.meaning, item.note].join(' ').toLowerCase();
      const hit = matchIds.has(item.id) || hay.includes(q);
      if (hit) {
        for (const m of getItemGroup(item, items)) {
          if (m.kind === kind) included.add(m.id);
        }
      }
    }
    result = pool.filter((i) => included.has(i.id));
  }

  return [...result].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

export const AFFIX_PAGE_SIZE = 35;

/** @deprecated */
export const findCategoryByForm = findItemByForm;
export const rankCategories = rankItems;
export const filterCategoriesByKind = filterItemsByKind;
export const categoryFormsLabel = (item: AffixItem, items: AffixItem[]) =>
  getItemGroup(item, items).map((i) => i.name).join(' · ');
export const categoryPrimaryForm = (item: AffixItem) => item.name;
export const entryFromNote = itemFromNote;
export const categoryFromNote = itemFromNote;
export const categoryKnowledgeText = (item: AffixItem) =>
  [item.pos, item.meaning].filter(Boolean).join(' · ');
