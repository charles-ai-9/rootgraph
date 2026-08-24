import { useCallback, useEffect, useState } from 'react';
import { emptyAffixNote, emptyWordAffixNotes, type AffixNoteData, type WordAffixNotes, type WordEntry } from '../types';
import { affixFormForSearch, parseVariantLines } from '../utils/affixNote';
import { registerUserFamilyResolver } from '../appRoute';
import { safeSetItem } from '../utils/storage';

export interface WordFieldOverrides {
  mnemonic?: string;
  collocations?: string;
  examples?: string; // 用户自定义例句（JSON 字符串数组）
  etymology?: string; // 用户自定义词源（覆盖数据层词源）
}

/** 用户对词根族元数据的手动覆盖（按教程修正，重导不丢） */
export interface FamilyMeta {
  /** 词根变体（教材原写法，如 ['pens', '(s)pend', '(s)pon']）；缺省用数据默认 */
  roots?: string[];
  /** 语义标签覆盖（semanticLabel） */
  semantic?: string;
  /** 英文含义覆盖（meaningEn） */
  meaningEn?: string;
  /** 中文释义覆盖（meaningZh） */
  meaningZh?: string;
}

/** 用户自建的词根族（显示在首页「我的词根」分组，localStorage 持久化） */
export interface UserFamily {
  /** 词根 id（如 'eco'），与 roots[0] 一致 */
  id: string;
  /** 词根变体（如 ['eco', 'econ']） */
  roots: string[];
  /** 中文释义 */
  meaningZh: string;
  /** 英文含义 */
  meaningEn: string;
  createdAt: number;
}

interface NotesStore {
  families: Record<string, string>;
  words: Record<string, string>;
  affixNotes: Record<string, WordAffixNotes>;
  wordFields: Record<string, WordFieldOverrides>;
  /** 词根族对应的视频课程编号（familyKey → 编号，如 "1-03"） */
  videoMap: Record<string, string>;
  /** 词根族元数据手动覆盖（familyKey → 修正后的 roots / semantic） */
  familyMeta: Record<string, FamilyMeta>;
  /** 用户自建词根族（id → 元数据） */
  userFamilies: Record<string, UserFamily>;
  /** 用户词根族挂入的词（userFamilyId → 词条快照数组） */
  userFamilyWords: Record<string, UserFamilyWord[]>;
}

/** 挂入用户词根族的词条（带原归属，用于从原族排除显示） */
export interface UserFamilyWord extends WordEntry {
  _from?: { textbook: string; familyId: string };
}

const STORAGE_KEY = 'rootgraph-notes-v2';
const LEGACY_KEY = 'rootgraph-notes-v1';

const empty: NotesStore = {
  families: {},
  words: {},
  affixNotes: {},
  wordFields: {},
  videoMap: {},
  familyMeta: {},
  userFamilies: {},
  userFamilyWords: {},
};

// 模块加载即注册：路由解析自建词根族时直接读 localStorage（含开机深链场景，不依赖 hook 实例）
registerUserFamilyResolver((textbook, id) => {
  if (textbook !== 'user') return undefined;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const uf = raw ? (JSON.parse(raw)?.userFamilies?.[id] as UserFamily | undefined) : undefined;
    if (!uf) return undefined;
    return {
      id: uf.id,
      file: '',
      chapter: '我的',
      chapterOrder: 999,
      titleZh: uf.meaningZh,
      semanticLabel: uf.meaningZh,
      meaningEn: uf.meaningEn,
      meaningZh: uf.meaningZh,
      roots: uf.roots,
      wordCount: 0,
      source: 'user',
      textbook: 'user',
    };
  } catch {
    return undefined;
  }
});

export function collocationsToText(items: string[]): string {
  return items.join('\n');
}

function normalizeAffixNote(raw: unknown): AffixNoteData {
  if (!raw || typeof raw !== 'object') return emptyAffixNote();
  const o = raw as Partial<AffixNoteData> & { affixes?: string };
  return {
    current: o.current ?? o.affixes ?? '',
    variants: o.variants ?? '',
    knowledge: o.knowledge ?? '',
    evolution: o.evolution ?? '',
    libraryRef: o.libraryRef,
    suppressed: o.suppressed,
    inferred: o.inferred,
  };
}

function migrateLegacyAffixNote(legacy: AffixNoteData): WordAffixNotes {
  const result = emptyWordAffixNotes();
  const parsed = affixFormForSearch(legacy.current);

  if (parsed?.kind === 'prefix') {
    result.prefix = { ...legacy };
  } else if (parsed?.kind === 'suffix') {
    result.suffix = { ...legacy };
  } else if (legacy.current.trim()) {
    result.prefix = { ...legacy };
  }

  for (const line of parseVariantLines(legacy.variants)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const variantParsed = affixFormForSearch(trimmed);
    if (variantParsed?.kind === 'prefix' && !result.prefix.current.trim()) {
      result.prefix = { ...emptyAffixNote(), current: trimmed };
    } else if (!result.suffix.current.trim()) {
      result.suffix = { ...emptyAffixNote(), current: trimmed };
    }
  }

  return result;
}

function normalizeWordAffixNotes(raw: unknown): WordAffixNotes {
  if (!raw || typeof raw !== 'object') return emptyWordAffixNotes();
  const o = raw as Partial<WordAffixNotes> & AffixNoteData;
  if ('prefix' in o || 'suffix' in o) {
    return {
      prefix: normalizeAffixNote(o.prefix),
      suffix: normalizeAffixNote(o.suffix),
    };
  }
  return migrateLegacyAffixNote(normalizeAffixNote(raw));
}

function load(): NotesStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NotesStore>;
      return {
        families: parsed.families ?? {},
        words: parsed.words ?? {},
        affixNotes: Object.fromEntries(
          Object.entries(parsed.affixNotes ?? {}).map(([k, v]) => [k, normalizeWordAffixNotes(v)]),
        ),
        wordFields: parsed.wordFields ?? {},
        videoMap: parsed.videoMap ?? {},
        familyMeta: parsed.familyMeta ?? {},
        userFamilies: parsed.userFamilies ?? {},
        userFamilyWords: parsed.userFamilyWords ?? {},
      };
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<NotesStore>;
      return {
        families: parsed.families ?? {},
        words: parsed.words ?? {},
        affixNotes: {},
        wordFields: {},
        videoMap: {},
        familyMeta: {},
        userFamilies: {},
        userFamilyWords: {},
      };
    }
  } catch {
    /* ignore */
  }
  return { ...empty };
}

export function useNotes() {
  const [store, setStore] = useState<NotesStore>(load);

  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  const getFamilyNote = useCallback((key: string) => store.families[key] ?? '', [store]);

  const setFamilyNote = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      families: { ...prev.families, [key]: text },
    }));
  }, []);

  const getVideoId = useCallback((key: string) => store.videoMap[key] ?? '', [store]);

  const setVideoId = useCallback((key: string, videoId: string) => {
    setStore((prev) => ({
      ...prev,
      videoMap: { ...prev.videoMap, [key]: videoId.trim() },
    }));
  }, []);

  const getFamilyMeta = useCallback((key: string) => store.familyMeta[key], [store]);

  const setFamilyMeta = useCallback((key: string, meta: FamilyMeta) => {
    setStore((prev) => ({
      ...prev,
      familyMeta: { ...prev.familyMeta, [key]: meta },
    }));
  }, []);

  const getUserFamilies = useCallback(() => store.userFamilies, [store]);

  const createUserFamily = useCallback((data: Omit<UserFamily, 'createdAt'>) => {
    const family: UserFamily = { ...data, createdAt: Date.now() };
    setStore((prev) => ({
      ...prev,
      userFamilies: { ...prev.userFamilies, [family.id]: family },
      userFamilyWords: { ...prev.userFamilyWords, [family.id]: prev.userFamilyWords[family.id] ?? [] },
    }));
    return family;
  }, []);

  const removeUserFamily = useCallback((id: string) => {
    setStore((prev) => {
      const next: NotesStore = {
        ...prev,
        userFamilies: { ...prev.userFamilies },
        userFamilyWords: { ...prev.userFamilyWords },
      };
      delete next.userFamilies[id];
      delete next.userFamilyWords[id];
      return next;
    });
  }, []);

  /** 编辑我的词根（词根名/释义；保留 id，笔记与挂载词不受影响） */
  const updateUserFamily = useCallback(
    (id: string, data: Partial<Pick<UserFamily, 'roots' | 'meaningZh' | 'meaningEn'>>) => {
      setStore((prev) => {
        const cur = prev.userFamilies[id];
        if (!cur) return prev;
        return {
          ...prev,
          userFamilies: {
            ...prev.userFamilies,
            [id]: { ...cur, ...data },
          },
        };
      });
    },
    [],
  );

  /** 批量把词挂入用户词根族（词条快照 + 来源标记，从原族排除显示） */
  const moveWordsToUserFamily = useCallback(
    (familyId: string, words: WordEntry[], from?: { textbook: string; familyId: string }) => {
    setStore((prev) => {
      const existing = new Set((prev.userFamilyWords[familyId] ?? []).map((w) => w.word));
      // from 缺省（用户词根族间转移）时保留词自带的 _from，避免丢失原数据族归属
      const added = words.filter((w) => !existing.has(w.word)).map((w) => (from ? { ...w, _from: from } : w));
      if (!added.length) return prev;
      return {
        ...prev,
        userFamilyWords: {
          ...prev.userFamilyWords,
          [familyId]: [...(prev.userFamilyWords[familyId] ?? []), ...added],
        },
      };
    });
  }, []);

  const removeWordFromUserFamily = useCallback((familyId: string, word: string) => {
    setStore((prev) => {
      const list = (prev.userFamilyWords[familyId] ?? []).filter((w) => w.word !== word);
      return {
        ...prev,
        userFamilyWords: { ...prev.userFamilyWords, [familyId]: list },
      };
    });
  }, []);

  const getUserFamilyWords = useCallback(
    (familyId: string): UserFamilyWord[] => store.userFamilyWords[familyId] ?? [],
    [store],
  );

  const getWordNote = useCallback((key: string) => store.words[key] ?? '', [store]);

  const setWordNote = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      words: { ...prev.words, [key]: text },
    }));
  }, []);

  const getWordAffixNotes = useCallback(
    (key: string) => store.affixNotes[key] ?? emptyWordAffixNotes(),
    [store],
  );

  const setWordAffixNote = useCallback(
    (key: string, kind: 'prefix' | 'suffix', note: AffixNoteData) => {
      setStore((prev) => {
        const current = prev.affixNotes[key] ?? emptyWordAffixNotes();
        return {
          ...prev,
          affixNotes: {
            ...prev.affixNotes,
            [key]: { ...current, [kind]: note },
          },
        };
      });
    },
    [],
  );

  const getWordMnemonic = useCallback(
    (key: string, seed = '') => {
      const hit = store.wordFields[key]?.mnemonic;
      // null/undefined 都回退；seed 也可能是数据层的 null，一律兜底为字符串
      return hit != null ? hit : (seed ?? '');
    },
    [store],
  );

  const setWordMnemonic = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      wordFields: {
        ...prev.wordFields,
        [key]: { ...prev.wordFields[key], mnemonic: text },
      },
    }));
  }, []);

  const getWordCollocations = useCallback(
    (key: string, seed: string[] = []) => {
      const hit = store.wordFields[key]?.collocations;
      return hit != null ? hit : collocationsToText(seed);
    },
    [store],
  );

  const setWordCollocations = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      wordFields: {
        ...prev.wordFields,
        [key]: { ...prev.wordFields[key], collocations: text },
      },
    }));
  }, []);

  const getWordExamples = useCallback(
    (key: string, seed: string[] = []) => {
      const hit = store.wordFields[key]?.examples;
      if (hit != null) {
        try {
          const parsed = JSON.parse(hit) as unknown;
          return Array.isArray(parsed) ? (parsed as string[]) : seed;
        } catch {
          return seed;
        }
      }
      return seed;
    },
    [store],
  );

  const setWordExamples = useCallback((key: string, examples: string[]) => {
    setStore((prev) => ({
      ...prev,
      wordFields: {
        ...prev.wordFields,
        [key]: { ...prev.wordFields[key], examples: JSON.stringify(examples) },
      },
    }));
  }, []);

  const getWordEtymology = useCallback(
    (key: string, seed = '') => {
      const hit = store.wordFields[key]?.etymology;
      return hit != null ? hit : (seed ?? '');
    },
    [store],
  );

  const setWordEtymology = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      wordFields: {
        ...prev.wordFields,
        [key]: { ...prev.wordFields[key], etymology: text },
      },
    }));
  }, []);

  /** 数据重导导致 familyId 变化时，迁移旧 key 的笔记到新 key（如 textbook-5/plus → textbook-5/plus-2）。
   *  安全：迁移前先把整个 store 快照到 rootgraph-notes-backup-auto-*，即使迁移异常也可恢复。 */
  const migrateKeys = useCallback((renames: Record<string, string>) => {
    const hasRealRename = Object.entries(renames).some(([a, b]) => a !== b);
    if (hasRealRename) {
      try {
        localStorage.setItem(`rootgraph-notes-backup-auto-${Date.now()}`, JSON.stringify(store));
      } catch {
        /* 配额满则跳过快照，迁移仍继续 */
      }
    }
    setStore((prev) => {
      const next: NotesStore = {
        families: { ...prev.families },
        words: { ...prev.words },
        affixNotes: { ...prev.affixNotes },
        wordFields: { ...prev.wordFields },
        videoMap: { ...prev.videoMap },
        familyMeta: { ...prev.familyMeta },
        userFamilies: { ...prev.userFamilies },
        userFamilyWords: { ...prev.userFamilyWords },
      };
      let changed = false;
      for (const [oldKey, newKey] of Object.entries(renames)) {
        if (oldKey === newKey) continue;
        for (const section of ['families', 'words', 'affixNotes', 'wordFields', 'videoMap', 'familyMeta'] as const) {
          const map = next[section];
          for (const k of Object.keys(map)) {
            if (k === oldKey || k.startsWith(`${oldKey}/`)) {
              map[`${newKey}${k.slice(oldKey.length)}`] = map[k];
              delete map[k];
              changed = true;
            }
          }
        }
      }
      return changed ? next : prev;
    });
  }, [store]);

  return {
    getFamilyNote,
    setFamilyNote,
    getVideoId,
    setVideoId,
    getFamilyMeta,
    setFamilyMeta,
    getUserFamilies,
    createUserFamily,
    updateUserFamily,
    removeUserFamily,
    moveWordsToUserFamily,
    removeWordFromUserFamily,
    getUserFamilyWords,
    getWordNote,
    setWordNote,
    getWordAffixNotes,
    setWordAffixNote,
    getWordMnemonic,
    setWordMnemonic,
    getWordCollocations,
    setWordCollocations,
    getWordExamples,
    setWordExamples,
    getWordEtymology,
    setWordEtymology,
    migrateKeys,
  };
}
