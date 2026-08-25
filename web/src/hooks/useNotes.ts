import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyAffixNote, emptyWordAffixNotes, type AffixNoteData, type WordAffixNotes, type WordEntry } from '../types';
import { affixFormForSearch, parseVariantLines } from '../utils/affixNote';
import { registerUserFamilyResolver } from '../appRoute';
import { safeSetItem } from '../utils/storage';
import { downloadRemote, getDeviceId } from '../utils/sync';
import { saveSnapshot, loadLatestSnapshot } from '../utils/snapshotDb';

export interface WordFieldOverrides {
  mnemonic?: string;
  collocations?: string;
  examples?: string; // 用户自定义例句（JSON 字符串数组）
  etymology?: string; // 用户自定义词源（覆盖数据层词源）
  phonetic?: string; // 用户自定义音标（覆盖数据层音标）
  definition?: string; // 用户自定义释义（覆盖数据层释义）
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
  /** 目标教材（如 textbook-3）。设置后该词根作为「教材词根」显示在对应教材底部；缺省为「我的词根」 */
  textbook?: string;
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
  /** 首页词根顺序（教材/我的 → 词根 id 有序列表；缺省按目录顺序） */
  familyOrder: Record<string, string[]>;
  /** 词根族内单词顺序（textbook:id:panel → 单词名有序列表） */
  wordOrder: Record<string, string[]>;
  /** 最后更新时间戳（用于多设备同步 last-write-wins） */
  updatedAt: number;
  /** key 级编辑时间戳（同步冲突时逐条取最新，key 如 'f:familyKey' / 'w:wordKey'） */
  touchMap: Record<string, number>;
  /** 被删除（本地隐藏）的单词（wordKey → true，显示时过滤） */
  wordHidden: Record<string, boolean>;
}

/** 挂入用户词根族的词条（带原归属，用于从原族排除显示） */
export interface UserFamilyWord extends WordEntry {
  _from?: { textbook: string; familyId: string };
}

const STORAGE_KEY = 'rootgraph-notes-v2';
const LEGACY_KEY = 'rootgraph-notes-v1';
/** 本地双写备份：始终保存最近一次成功写入的完整数据（主 key 损坏时自动恢复） */
const LAST_GOOD_KEY = 'rootgraph-notes-last-good';
/** 本地快照前缀：定期保存历史版本（保留最近 20 份，本地可回滚） */
const SNAP_INTERVAL_MS = 30 * 60 * 1000;

/** 本地快照：距上次超过 30 分钟则存一份到 IndexedDB（容量大，不占 localStorage 配额） */
function takeLocalSnapshot(data: unknown, lastTs: number): number {
  const now = Date.now();
  if (now - lastTs < SNAP_INTERVAL_MS) return lastTs;
  saveSnapshot(data);
  return now;
}

/** 本地恢复源：主 key → last-good → 最近快照（依次尝试，返回可用 JSON 或 null） */
function readLocalWithRecovery(): { store: NotesStore; recovered: boolean } | null {
  const attempt = (raw: string | null): NotesStore | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as NotesStore;
    } catch {
      return null;
    }
  };
  try {
    const main = attempt(localStorage.getItem(STORAGE_KEY));
    if (main) return { store: main, recovered: false };
    // 主数据损坏：从 last-good 恢复
    const good = attempt(localStorage.getItem(LAST_GOOD_KEY));
    if (good) return { store: good, recovered: true };
    } catch {
    /* ignore */
  }
  return null;
}

const empty: NotesStore = {
  families: {},
  words: {},
  affixNotes: {},
  wordFields: {},
  videoMap: {},
  familyMeta: {},
  userFamilies: {},
  userFamilyWords: {},
  familyOrder: {},
  wordOrder: {},
  updatedAt: 0,
  touchMap: {},
  wordHidden: {},
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
  // 自愈：主数据损坏时从 last-good / 本地快照恢复（本地三层保护：主 key → last-good → 快照）
  const recovered = readLocalWithRecovery();
  if (recovered) {
    const parsed = recovered.store as Partial<NotesStore>;
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
      familyOrder: parsed.familyOrder ?? {},
      wordOrder: parsed.wordOrder ?? {},
      updatedAt: parsed.updatedAt ?? 0,
      touchMap: parsed.touchMap ?? {},
      wordHidden: parsed.wordHidden ?? {},
    };
  }

  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
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
        familyOrder: {},
        wordOrder: {},
        updatedAt: 0,
        touchMap: {},
        wordHidden: {},
      };
    } catch {
      /* ignore */
    }
  }
  return { ...empty };
}

export function useNotes() {
  const [store, setStore] = useState<NotesStore>(load);
  /** 本地快照时间戳（节流：每 10 分钟最多一份） */
  const lastSnapRef = useRef(0);

  // 最新 store 引用：供 beforeunload / storage 同步使用
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  }, [store]);

  useEffect(() => {
    // 合并持久化：与 localStorage 现有数据取并集（userFamilies/userFamilyWords 等追加型字段），
    // 防止多标签页中旧 store 覆盖其他标签页新建的词根/单词（如新建 respect 后消失）。
    // 删除操作会同步清理 localStorage（见 removeUserFamily 等），因此不会"复活"已删除条目。
    const now = Date.now();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const current = JSON.parse(raw) as Partial<NotesStore>;
        const cur = (k: keyof NotesStore) => (current as Record<string, unknown>)[k] ?? {};
        // 全字段合并持久化：本页最新（store）优先 + localStorage 现有（current）补充。
        // 保证「任何编辑都不丢失」：本页刚编辑的值写入（编辑生效），其他标签页/旧数据里
        // 本页没有的键保留（不覆盖丢失）；删除操作同步清理 localStorage，不会"复活"。
        const merged = {
          ...store,
          families: { ...(cur('families') as object), ...store.families },
          words: { ...(cur('words') as object), ...store.words },
          affixNotes: { ...(cur('affixNotes') as object), ...store.affixNotes },
          wordFields: { ...(cur('wordFields') as object), ...store.wordFields },
          videoMap: { ...(cur('videoMap') as object), ...store.videoMap },
          familyMeta: { ...(cur('familyMeta') as object), ...store.familyMeta },
          userFamilies: { ...(cur('userFamilies') as object), ...store.userFamilies },
          userFamilyWords: { ...(cur('userFamilyWords') as object), ...store.userFamilyWords },
          familyOrder: { ...(cur('familyOrder') as object), ...store.familyOrder },
          wordOrder: { ...(cur('wordOrder') as object), ...store.wordOrder },
          wordHidden: { ...(cur('wordHidden') as object), ...store.wordHidden },
          updatedAt: now,
        };
        // 双写：主 key + last-good（始终保存最近成功写入，主 key 损坏时自动恢复）
        const json = JSON.stringify(merged);
        safeSetItem(STORAGE_KEY, json);
        safeSetItem(LAST_GOOD_KEY, json);
        // 本地快照（>10 分钟间隔，保留 20 份）
        lastSnapRef.current = takeLocalSnapshot(merged, lastSnapRef.current);
        return;
      }
    } catch {
      /* 忽略异常，回退直接写入 */
    }
    const withTimestamp = { ...store, updatedAt: now };
    const json = JSON.stringify(withTimestamp);
    safeSetItem(STORAGE_KEY, json);
    safeSetItem(LAST_GOOD_KEY, json);
    lastSnapRef.current = takeLocalSnapshot(withTimestamp, lastSnapRef.current);
  }, [store]);

  /** 远端数据合并进本地（本地优先：保留本地最新编辑，远端独有补入）；返回是否发生了合并 */
  const mergeRemote = useCallback((remote: object): boolean => {
    const remoteStore = remote as NotesStore;
    const remoteWordbook = (remote as { wordbook?: unknown }).wordbook;
    const localUpdatedAt = storeRef.current.updatedAt ?? 0;
    if (!(remoteStore.updatedAt > localUpdatedAt)) return false;
    // 覆盖前先备份本地（防 last-write-wins 误覆盖造成笔记丢失）
    try {
      localStorage.setItem(
        `rootgraph-notes-backup-pre-sync-${Date.now()}`,
        JSON.stringify(storeRef.current),
      );
    } catch {
      /* ignore */
    }
    // 单词本（独立 key）写回本地并通知刷新
    if (Array.isArray(remoteWordbook)) {
      try {
        localStorage.setItem('rootgraph-wordbook-v1', JSON.stringify(remoteWordbook));
        window.dispatchEvent(new Event('rootgraph-wordbook-updated'));
      } catch {
        /* ignore */
      }
    }
    // 记录本次同步时间（拉取合并成功）
    try {
      localStorage.setItem('rootgraph-last-sync-time', String(Date.now()));
      window.dispatchEvent(new Event('rootgraph-synced'));
    } catch {
      /* ignore */
    }
    // 合并：笔记类按 key 级时间戳（touchMap）逐条取最新——A 设备改的条目在 B 设备上也能拉到；
    // 词根/顺序类保持本地优先（追加型数据，并集最安全）。
    const { wordbook: _wb, ...remoteRest } = remoteStore as NotesStore & { wordbook?: unknown };
    setStore((prev) => {
      const rt = remoteRest.touchMap ?? {};
      const lt = prev.touchMap ?? {};
      const mergeByTouch = (remoteVal: unknown, localVal: unknown, touchKey: string) => {
        if (remoteVal === undefined) return localVal;
        if (localVal === undefined) return remoteVal;
        return (rt[touchKey] ?? 0) > (lt[touchKey] ?? 0) ? remoteVal : localVal;
      };
      const mergeObj = <T,>(remoteObj: Record<string, T> | undefined, localObj: Record<string, T> | undefined, prefix: string): Record<string, T> => {
        const out: Record<string, T> = {};
        for (const k of new Set([...Object.keys(remoteObj ?? {}), ...Object.keys(localObj ?? {})])) {
          out[k] = mergeByTouch(remoteObj?.[k], localObj?.[k], `${prefix}:${k}`) as T;
        }
        return out;
      };
      return {
        ...prev,
        ...remoteRest,
        families: mergeObj(remoteRest.families as Record<string, string> | undefined, prev.families, 'f'),
        words: mergeObj(remoteRest.words as Record<string, string> | undefined, prev.words, 'w'),
        affixNotes: mergeObj(remoteRest.affixNotes as Record<string, WordAffixNotes> | undefined, prev.affixNotes, 'a'),
        wordFields: mergeObj(remoteRest.wordFields as Record<string, WordFieldOverrides> | undefined, prev.wordFields, 'wf'),
        videoMap: mergeObj(remoteRest.videoMap as Record<string, string> | undefined, prev.videoMap, 'v'),
        familyMeta: mergeObj(remoteRest.familyMeta as Record<string, FamilyMeta> | undefined, prev.familyMeta, 'm'),
        // 词根/挂载/顺序：本地优先并集（追加型，避免整条覆盖丢数据）
        userFamilies: { ...(remoteRest.userFamilies ?? {}), ...prev.userFamilies },
        userFamilyWords: { ...(remoteRest.userFamilyWords ?? {}), ...prev.userFamilyWords },
        familyOrder: { ...(remoteRest.familyOrder ?? {}), ...prev.familyOrder },
        wordOrder: { ...(remoteRest.wordOrder ?? {}), ...prev.wordOrder },
        wordHidden: { ...(remoteRest.wordHidden ?? {}), ...prev.wordHidden },
        touchMap: { ...rt, ...lt },
        updatedAt: Math.max(remoteRest.updatedAt ?? 0, prev.updatedAt ?? 0),
      };
    });
    return true;
  }, []);

  /** 手动/定时同步：上传本地完整数据（含单词本）→ 下载合并远端（本地优先） */
  const syncNow = useCallback(async (): Promise<{ ok: boolean; msg: string }> => {
    try {
      let wordbook: unknown = [];
      try {
        const raw = localStorage.getItem('rootgraph-wordbook-v1');
        wordbook = raw ? JSON.parse(raw) : [];
      } catch {
        /* ignore */
      }
      const payload = {
        ...storeRef.current,
        wordbook,
        deviceId: getDeviceId(),
        updatedAt: Date.now(),
      };
      const res = await fetch('/api/sync', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer rg_sync_2026_k8m3p7q2x9w4',
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) return { ok: false, msg: '上传失败（请检查网络）' };
      // 下载合并（本地优先，防远端旧数据覆盖）
      const remote = await downloadRemote();
      if (remote) mergeRemote(remote);
      try {
        localStorage.setItem('rootgraph-last-sync-time', String(Date.now()));
        window.dispatchEvent(new Event('rootgraph-synced'));
      } catch {
        /* ignore */
      }
      return {
        ok: true,
        msg: `已同步 ${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
      };
    } catch {
      return { ok: false, msg: '同步失败（网络异常）' };
    }
  }, [mergeRemote]);

  /** 每日 18:40 自动同步（打开页面时若已过当天 18:40 且未同步，补一次） */
  useEffect(() => {
    const run = () => {
      const now = new Date();
      const today = now.toDateString();
      try {
        if (localStorage.getItem('rootgraph-sync-date') === today) return;
        const target = new Date();
        target.setHours(18, 40, 0, 0);
        if (now >= target) {
          localStorage.setItem('rootgraph-sync-date', today);
          syncNow();
        }
      } catch {
        /* ignore */
      }
    };
    run();
    const timer = setInterval(run, 60000);
    return () => clearInterval(timer);
  }, [syncNow]);

  // 启动时：① 每天最多拉取 1 次云端（避免每次打开页面都请求，降低网络交互）
  //         ② 主数据缺失时从 IndexedDB 快照恢复（本地快照兜底）
  useEffect(() => {
    try {
      const today = new Date().toDateString();
      if (localStorage.getItem('rootgraph-last-pull-date') !== today) {
        localStorage.setItem('rootgraph-last-pull-date', today);
        downloadRemote().then((remote) => {
          if (remote) mergeRemote(remote);
        });
      }
    } catch {
      /* ignore */
    }
    if (!localStorage.getItem(STORAGE_KEY)) {
      loadLatestSnapshot().then((snap) => {
        if (snap && typeof snap === 'object' && !localStorage.getItem(STORAGE_KEY)) {
          setStore(snap as NotesStore);
        }
      });
    }
  }, [mergeRemote]);

  // 跨标签页同步：其他标签页写入时深合并进当前 store，避免浅合并覆盖嵌套对象（如 familyMeta/wordFields 丢失）
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        const external = JSON.parse(e.newValue) as NotesStore;
        setStore((prev) => ({
          ...prev,
          families: { ...prev.families, ...external.families },
          words: { ...prev.words, ...external.words },
          affixNotes: { ...prev.affixNotes, ...external.affixNotes },
          wordFields: { ...prev.wordFields, ...external.wordFields },
          videoMap: { ...prev.videoMap, ...external.videoMap },
          familyMeta: { ...prev.familyMeta, ...external.familyMeta },
          userFamilies: { ...prev.userFamilies, ...external.userFamilies },
          userFamilyWords: { ...prev.userFamilyWords, ...external.userFamilyWords },
          familyOrder: { ...prev.familyOrder, ...external.familyOrder },
          wordOrder: { ...prev.wordOrder, ...external.wordOrder },
        }));
      } catch {
        /* 忽略非法数据 */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // 页面关闭/刷新前同步落盘（本地为主；云端更新靠手动同步 + 每日 18:40，减少交互）
  useEffect(() => {
    const flush = () => {
      const json = JSON.stringify(storeRef.current);
      safeSetItem(STORAGE_KEY, json);
      safeSetItem(LAST_GOOD_KEY, json);
    };
    window.addEventListener('beforeunload', flush);
    window.addEventListener('pagehide', flush);
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flush();
    });
    return () => {
      window.removeEventListener('beforeunload', flush);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('visibilitychange', flush);
    };
  }, []);

  const getFamilyNote = useCallback((key: string) => store.families[key] ?? '', [store]);

  const setFamilyNote = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      families: { ...prev.families, [key]: text },
      touchMap: { ...prev.touchMap, ['f:' + key]: Date.now() },
    }));
  }, []);

  const getVideoId = useCallback((key: string) => store.videoMap[key] ?? '', [store]);

  const setVideoId = useCallback((key: string, videoId: string) => {
    setStore((prev) => ({
      ...prev,
      videoMap: { ...prev.videoMap, [key]: videoId.trim() },
      touchMap: { ...prev.touchMap, ['v:' + key]: Date.now() },
    }));
  }, []);

  const getFamilyMeta = useCallback((key: string) => store.familyMeta[key], [store]);

  const setFamilyMeta = useCallback((key: string, meta: FamilyMeta) => {
    // 恢复默认（空对象）：同步清理 localStorage，防止合并持久化把它"复活"
    if (Object.keys(meta).length === 0) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const cur = JSON.parse(raw);
          if (cur.familyMeta) delete cur.familyMeta[key];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
        }
      } catch {
        /* ignore */
      }
    }
    setStore((prev) => ({
      ...prev,
      familyMeta: { ...prev.familyMeta, [key]: meta },
      touchMap: { ...prev.touchMap, ['m:' + key]: Date.now() },
    }));
  }, []);

  const getUserFamilies = useCallback(() => store.userFamilies, [store]);

  const getFamilyOrder = useCallback((): Record<string, string[]> => store.familyOrder, [store]);

  /** 保存某教材（或我的词根 'user'）的词根顺序（首页拖动排序） */
  const setFamilyOrder = useCallback((groupKey: string, ids: string[]) => {
    setStore((prev) => ({
      ...prev,
      familyOrder: { ...prev.familyOrder, [groupKey]: ids },
    }));
  }, []);

  const getWordOrder = useCallback((key: string): string[] => store.wordOrder[key] ?? [], [store]);

  const setWordOrder = useCallback((key: string, words: string[]) => {
    setStore((prev) => ({
      ...prev,
      wordOrder: { ...prev.wordOrder, [key]: words },
    }));
  }, []);

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
    // 同步清理 localStorage 中的对应条目（合并持久化下防"复活"）
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cur = JSON.parse(raw);
        if (cur.userFamilies) delete cur.userFamilies[id];
        if (cur.userFamilyWords) delete cur.userFamilyWords[id];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
      }
    } catch {
      /* ignore */
    }
    setStore((prev) => {
      const next: NotesStore = {
        ...prev,
        userFamilies: { ...prev.userFamilies },
        userFamilyWords: { ...prev.userFamilyWords },
        familyOrder: { ...prev.familyOrder },
      };
      delete next.userFamilies[id];
      delete next.userFamilyWords[id];
      return next;
    });
  }, []);

  /** 编辑我的词根（词根名/释义/目标教材；保留 id，笔记与挂载词不受影响） */
  const updateUserFamily = useCallback(
    (id: string, data: Partial<Pick<UserFamily, 'roots' | 'meaningZh' | 'meaningEn' | 'textbook'>>) => {
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

  /** 新建单词挂入用户词根族（无 _from，纯新增） */
  const addWordToUserFamily = useCallback((familyId: string, word: WordEntry) => {
    setStore((prev) => {
      const existing = new Set((prev.userFamilyWords[familyId] ?? []).map((w) => w.word));
      if (existing.has(word.word)) return prev;
      return {
        ...prev,
        userFamilyWords: {
          ...prev.userFamilyWords,
          [familyId]: [...(prev.userFamilyWords[familyId] ?? []), word],
        },
      };
    });
  }, []);

  const removeWordFromUserFamily = useCallback((familyId: string, word: string) => {
    // 同步清理 localStorage（合并持久化下防"复活"）
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cur = JSON.parse(raw);
        const list = (cur.userFamilyWords?.[familyId] ?? []).filter((w: { word?: string }) => w.word !== word);
        cur.userFamilyWords = { ...(cur.userFamilyWords ?? {}), [familyId]: list };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cur));
      }
    } catch {
      /* ignore */
    }
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
      touchMap: { ...prev.touchMap, ['w:' + key]: Date.now() },
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
          touchMap: { ...prev.touchMap, ['a:' + key]: Date.now() },
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
      touchMap: { ...prev.touchMap, ['wf:' + key]: Date.now() },
    }));  }, []);

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
      touchMap: { ...prev.touchMap, ['wf:' + key]: Date.now() },
    }));  }, []);

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
      touchMap: { ...prev.touchMap, ['wf:' + key]: Date.now() },
    }));  }, []);

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
      touchMap: { ...prev.touchMap, ['wf:' + key]: Date.now() },
    }));  }, []);

  const getWordPhonetic = useCallback(
    (key: string, seed = '') => {
      const hit = store.wordFields[key]?.phonetic;
      return hit != null ? hit : (seed ?? '');
    },
    [store],
  );

  const getWordDefinition = useCallback(
    (key: string, seed = '') => {
      const hit = store.wordFields[key]?.definition;
      return hit != null ? hit : (seed ?? '');
    },
    [store],
  );

  const setWordDefinition = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      wordFields: {
        ...prev.wordFields,
        [key]: { ...prev.wordFields[key], definition: text },
      },
      touchMap: { ...prev.touchMap, ['wf:' + key]: Date.now() },
    }));
  }, []);

  /** 删除单词（本地隐藏，显示过滤；数据保留可导出恢复） */
  const hideWord = useCallback((key: string) => {
    setStore((prev) => ({
      ...prev,
      wordHidden: { ...prev.wordHidden, [key]: true },
    }));
  }, []);

  const unhideWord = useCallback((key: string) => {
    setStore((prev) => {
      const next = { ...prev.wordHidden };
      delete next[key];
      return { ...prev, wordHidden: next };
    });
  }, []);

  const getHiddenWords = useCallback((): Record<string, boolean> => store.wordHidden, [store]);

  const setWordPhonetic = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      wordFields: {
        ...prev.wordFields,
        [key]: { ...prev.wordFields[key], phonetic: text },
      },
      touchMap: { ...prev.touchMap, ['wf:' + key]: Date.now() },
    }));  }, []);

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
        familyOrder: { ...prev.familyOrder },
        wordOrder: { ...prev.wordOrder },
        touchMap: { ...prev.touchMap },
        wordHidden: { ...prev.wordHidden },
        updatedAt: prev.updatedAt,
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
    addWordToUserFamily,
    removeWordFromUserFamily,
    getUserFamilyWords,
    syncNow,
    getFamilyOrder,
    setFamilyOrder,
    getWordOrder,
    setWordOrder,
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
    getWordPhonetic,
    setWordPhonetic,
    getWordDefinition,
    setWordDefinition,
    hideWord,
    unhideWord,
    getHiddenWords,
    migrateKeys,
  };
}
