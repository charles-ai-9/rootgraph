import { useCallback, useEffect, useState } from 'react';
import type { AffixCategory, AffixItem, AffixKind, AffixNoteData } from '../types';
import { AFFIX_SEED_VERSION, loadSeedItems } from '../data/affixSeed';
import { findItemByForm, itemFromNote } from '../utils/affixLibrary';
import { affixFormForSearch } from '../utils/affixNote';
import { normalizeAffixForm } from '../utils/affixFormDisplay';
import { safeSetItem } from '../utils/storage';

const STORAGE_KEY = 'rootgraph-affix-library-v5';
const VERSION_KEY = 'rootgraph-affix-library-seed-version';

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function migrateCategoryToItems(cat: AffixCategory): AffixItem[] {
  const forms = cat.forms.length ? cat.forms : [cat.title];
  const meaning = cat.blocks.map((b) => (b.label ? `${b.label} ${b.content}` : b.content)).join('\n');
  const pos = cat.blocks[0]?.label ?? '';
  const parentId = cat.id;

  if (forms.length === 1) {
    return [{
      id: parentId,
      kind: cat.kind,
      name: forms[0],
      pos,
      meaning,
      note: cat.blocks.slice(1).map((b) => b.content).join('\n'),
      isParent: false,
      updatedAt: cat.updatedAt,
    }];
  }

  const [first, ...rest] = forms;
  return [
    {
      id: parentId,
      kind: cat.kind,
      name: first,
      pos,
      meaning,
      note: '',
      isParent: true,
      updatedAt: cat.updatedAt,
    },
    ...rest.map((name) => ({
      id: uid(),
      kind: cat.kind,
      name,
      pos,
      meaning,
      note: '',
      isParent: false,
      parentId,
      updatedAt: cat.updatedAt,
    })),
  ];
}

function migrateRaw(raw: unknown): AffixItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;

  if (typeof o.name === 'string' && typeof o.meaning === 'string') {
    const kind: AffixKind =
      o.kind === 'prefix' ? 'prefix' : o.kind === 'root' ? 'root' : 'suffix';
    return {
      id: o.id,
      kind,
      name: o.name,
      pos: String(o.pos ?? ''),
      meaning: o.meaning,
      note: String(o.note ?? ''),
      isParent: Boolean(o.isParent),
      parentId: typeof o.parentId === 'string' ? o.parentId : undefined,
      order: typeof o.order === 'number' ? o.order : undefined,
      updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
    };
  }

  if (Array.isArray(o.forms)) {
    const items = migrateCategoryToItems(o as unknown as AffixCategory);
    return items[0] ?? null;
  }

  const name = String(o.name ?? o.current ?? o.title ?? '').trim();
  if (!name) return null;
  return {
    id: o.id,
    kind: affixFormForSearch(name)?.kind ?? 'suffix',
    name,
    pos: '',
    meaning: String(o.meaning ?? o.knowledge ?? ''),
    note: '',
    isParent: false,
    updatedAt: typeof o.updatedAt === 'number' ? o.updatedAt : Date.now(),
  };
}

function loadArray(key: string): AffixItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const items: AffixItem[] = [];
    for (const row of parsed) {
      if (row && typeof row === 'object' && Array.isArray((row as AffixCategory).forms)) {
        items.push(...migrateCategoryToItems(row as AffixCategory));
      } else {
        const item = migrateRaw(row);
        if (item) items.push(item);
      }
    }
    return items;
  } catch {
    return [];
  }
}

/** 误把词性/后缀说明写进释义（如前缀条目出现「名词后缀」） */
function isCorruptedMeaningOverride(item: AffixItem, storedMeaning: string): boolean {
  const meaning = storedMeaning.trim();
  if (!meaning) return false;
  if (item.kind === 'suffix') return false;
  if (/后缀$/.test(meaning)) return true;
  if (/^(名词|动词|形容词|副词|介词|连词)/.test(meaning) && meaning.length <= 12) return true;
  return false;
}

/** 本地释义与其他 seed 词条完全相同（如 -ed 被写成 -logy 的释义） */
function isCrossContaminatedMeaning(item: AffixItem, storedMeaning: string, seed: AffixItem[]): boolean {
  const meaning = storedMeaning.trim();
  if (!meaning || meaning === item.meaning) return false;
  return seed.some((s) => s.id !== item.id && s.kind === item.kind && s.meaning === meaning);
}

function resolveStoredMeaning(item: AffixItem, storedMeaning: string, seed: AffixItem[]): string {
  const meaning = storedMeaning.trim();
  if (!meaning) return item.meaning;
  if (isCorruptedMeaningOverride(item, meaning)) return item.meaning;
  if (isCrossContaminatedMeaning(item, meaning, seed)) return item.meaning;
  return meaning;
}

/** 以教材 seed 为准，按 id 合并用户编辑的释义/例词 note */
function applyStoredOverridesById(seed: AffixItem[], stored: AffixItem[]): AffixItem[] {
  const storedById = new Map(stored.map((item) => [item.id, item]));
  return seed.map((item) => {
    const hit = storedById.get(item.id);
    if (!hit) return item;
    return {
      ...item,
      meaning: resolveStoredMeaning(item, hit.meaning, seed),
      note: hit.note.trim() ? hit.note : item.note,
      updatedAt: Math.max(item.updatedAt, hit.updatedAt),
    };
  });
}

function sameParentId(a?: string | null, b?: string | null): boolean {
  return (a ?? undefined) === (b ?? undefined);
}

function isSeedStructureIntact(stored: AffixItem[], seed: AffixItem[]): boolean {
  if (stored.length !== seed.length) return false;
  const seedById = new Map(seed.map((s) => [s.id, s]));
  for (const s of stored) {
    const ref = seedById.get(s.id);
    if (!ref) return false;
    if (!sameParentId(s.parentId, ref.parentId)) return false;
    if (Boolean(s.isParent) !== Boolean(ref.isParent)) return false;
    if (s.kind !== ref.kind) return false;
  }
  return true;
}

function load(): AffixItem[] {
  const seed = loadSeedItems();
  const stored = loadArray(STORAGE_KEY);
  const seedVersion = localStorage.getItem(VERSION_KEY);
  const structureOk = isSeedStructureIntact(stored, seed);
  const versionOk = seedVersion === AFFIX_SEED_VERSION;

  if (!versionOk || !structureOk) {
    // seed 变化（版本升级 / 条目增删）：保留用户对现存条目的编辑，并保留用户新增
    // 条目（id 不在 seed 中）；仅丢弃明显噪声（如 o??-）。避免整库重置丢编辑。
    const seedIds = new Set(seed.map((s) => s.id));
    const merged = [
      ...applyStoredOverridesById(seed, stored),
      ...stored.filter((s) => !seedIds.has(s.id) && !/\?/.test(s.name)),
    ];
    safeSetItem(VERSION_KEY, AFFIX_SEED_VERSION);
    safeSetItem(STORAGE_KEY, JSON.stringify(merged));
    return merged;
  }

  const merged = applyStoredOverridesById(seed, stored);
  safeSetItem(STORAGE_KEY, JSON.stringify(merged));
  return merged;
}

export function useAffixLibrary() {
  const [items, setItems] = useState<AffixItem[]>(load);

  // 保存时与 localStorage 合并（其他标签页新增的词缀保留，本页最新优先）；删除同步清理防复活
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cur = raw ? (JSON.parse(raw) as AffixItem[]) : [];
      if (Array.isArray(cur)) {
        const byId = new Map(items.map((i) => [i.id, i]));
        for (const c of cur) {
          if (!byId.has(c.id)) byId.set(c.id, c);
        }
        safeSetItem(STORAGE_KEY, JSON.stringify([...byId.values()]));
        return;
      }
    } catch {
      /* ignore */
    }
    safeSetItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  // 跨标签页同步：其他标签页更新词缀库时刷新
  useEffect(() => {
    const onStorage = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) setItems(JSON.parse(raw) as AffixItem[]);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const getItem = useCallback((id: string) => items.find((i) => i.id === id), [items]);

  const addItem = useCallback((data: Omit<AffixItem, 'id' | 'updatedAt'>) => {
    const item: AffixItem = { ...data, id: uid(), updatedAt: Date.now() };
    setItems((prev) => [...prev, item]);
    return item;
  }, []);

  const updateItem = useCallback((id: string, patch: Partial<AffixItem>) => {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, ...patch, updatedAt: Date.now() } : i)),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    // 同步从 localStorage 删除（防合并保存"复活"）
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cur = JSON.parse(raw) as AffixItem[];
        if (Array.isArray(cur)) {
          safeSetItem(
            STORAGE_KEY,
            JSON.stringify(cur.filter((i) => i.id !== id && i.parentId !== id)),
          );
        }
      }
    } catch {
      /* ignore */
    }
    setItems((prev) => {
      const orphans = prev.filter((i) => i.parentId === id).map((i) => i.id);
      return prev
        .filter((i) => i.id !== id && i.parentId !== id)
        .map((i) => (orphans.includes(i.id) ? { ...i, parentId: undefined } : i));
    });
  }, []);

  const saveGroup = useCallback(
    (draft: { rootId?: string; kind: AffixKind; forms: string[]; meaning: string; order?: number }) => {
      const forms = draft.forms
        .map((f) => normalizeAffixForm(f.trim(), draft.kind))
        .filter(Boolean);
      if (!forms.length) return;

      const now = Date.now();
      const meaning = draft.meaning.trim();
      const isMulti = forms.length > 1;

      setItems((prev) => {
        if (!draft.rootId) {
          const rootId = uid();
          const order =
            draft.order ??
            Math.max(0, ...prev.filter((i) => i.kind === draft.kind).map((i) => i.order ?? 0)) + 1;
          const created: AffixItem[] = [
            {
              id: rootId,
              kind: draft.kind,
              name: forms[0],
              pos: '',
              meaning,
              note: '',
              isParent: isMulti,
              order,
              updatedAt: now,
            },
          ];
          for (let i = 1; i < forms.length; i++) {
            created.push({
              id: uid(),
              kind: draft.kind,
              name: forms[i],
              pos: '',
              meaning,
              note: '',
              isParent: false,
              parentId: rootId,
              order,
              updatedAt: now,
            });
          }
          return [...prev, ...created];
        }

        const root = prev.find((i) => i.id === draft.rootId);
        if (!root) return prev;

        const rootId = draft.rootId;
        const existingMembers = prev.filter((i) => i.id === rootId || i.parentId === rootId);
        const byName = new Map(existingMembers.map((m) => [m.name, m]));
        const without = prev.filter((i) => i.id !== rootId && i.parentId !== rootId);

        const rebuilt: AffixItem[] = forms.map((form, i) => {
          const prevMember = byName.get(form);
          if (i === 0) {
            return {
              ...root,
              name: form,
              meaning,
              isParent: isMulti,
              parentId: undefined,
              updatedAt: now,
            };
          }
          return {
            id: prevMember?.id ?? uid(),
            kind: draft.kind,
            name: form,
            pos: prevMember?.pos ?? '',
            meaning,
            note: prevMember?.note ?? '',
            isParent: false,
            parentId: rootId,
            order: root.order,
            updatedAt: now,
          };
        });
        return [...without, ...rebuilt];
      });
    },
    [],
  );

  const upsertItemFromNote = useCallback(
    (kind: AffixKind, note: AffixNoteData): AffixItem => {
      const form = note.current.trim();
      const existing = form ? findItemByForm(items, form, kind) : undefined;
      if (existing) return existing;

      const draft = itemFromNote(kind, note);
      const draftItem = { ...draft, id: 'draft', updatedAt: 0 };
      const meaning = isCorruptedMeaningOverride(draftItem, draft.meaning) ? '' : draft.meaning;
      return addItem({ ...draft, meaning });
    },
    [items, addItem],
  );

  return {
    items,
    getItem,
    addItem,
    updateItem,
    removeItem,
    saveGroup,
    upsertItemFromNote,
    /** @deprecated */ categories: items,
    /** @deprecated */ getCategory: getItem,
    /** @deprecated */ upsertCategoryFromNote: upsertItemFromNote,
  };
}
