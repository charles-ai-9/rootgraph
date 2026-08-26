import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AffixItem, AffixKind, AffixNoteData, CatalogEntry, RootFamily, WordAffixKind, WordEntry, WordAffixNotes } from '../types';
import { cleanRoots, displaySemantic, displayRoots, normalizeRootForm, wordKey } from '../types';
import { familyStorageKey } from '../catalog';
import { groupWordsByRoot } from '../utils/family';
import type { FamilyMeta, UserFamily, UserFamilyWord } from '../hooks/useNotes';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { loadWordIndex, searchWords, type IndexedWord } from '../hooks/useWordIndex';
import { loadCatalog } from '../appRoute';
import { fetchFamily } from '../utils/dataApi';
import { useProgress } from '../hooks/useProgress';
import { FamilyVariantNav, OVERVIEW_PANEL, VariantStepper, type VariantTab } from './FamilyVariantNav';
import { DraggableFollowBar } from './DraggableFollowBar';
import { MiniRelationGraph } from './MiniRelationGraph';
import { NoteEditor } from './NoteEditor';
import { VariantMap } from './VariantMap';
import { WordCard, type WordCardProps } from './WordCard';
import { WordCardModal } from './WordCardModal';
import { AffixLibraryOverlay } from './AffixLibraryOverlay';
import { BatchMoveModal } from './BatchMoveModal';

interface FamilyNotePageProps {
  entry: CatalogEntry;
  focusWord?: string;
  getFamilyNote: (key: string) => string;
  setFamilyNote: (key: string, text: string) => void;
  getVideoId: (key: string) => string;
  setVideoId: (key: string, videoId: string) => void;
  getFamilyMeta: (key: string) => FamilyMeta | undefined;
  setFamilyMeta: (key: string, meta: FamilyMeta) => void;
  getWordNote: (key: string) => string;
  setWordNote: (key: string, text: string) => void;
  getWordMnemonic: (key: string, seed?: string) => string;
  setWordMnemonic: (key: string, text: string) => void;
  getWordCollocations: (key: string, seed?: string[]) => string;
  setWordCollocations: (key: string, text: string) => void;
  getWordExamples: (key: string, seed?: string[]) => string[];
  setWordExamples: (key: string, examples: string[]) => void;
  getWordEtymology: (key: string, seed?: string) => string;
  setWordEtymology: (key: string, text: string) => void;
  getWordPhonetic: (key: string, seed?: string) => string;
  setWordPhonetic: (key: string, text: string) => void;
  getWordPos: (key: string, seed?: string) => string;
  setWordPos: (key: string, text: string) => void;
  getWordSenses: (key: string) => { pos: string; definition: string }[] | undefined;
  setWordSenses: (key: string, senses: { pos: string; definition: string }[]) => void;
  getWordDefinition: (key: string, seed?: string) => string;
  setWordDefinition: (key: string, text: string) => void;
  hideWord: (key: string) => void;
  getHiddenWords: () => Record<string, boolean>;
  getWordAffixNotes: (key: string) => WordAffixNotes;
  setWordAffixNote: (key: string, kind: WordAffixKind, note: AffixNoteData) => void;
  items: AffixItem[];
  getItem: (id: string) => AffixItem | undefined;
  onSaveToLibrary: (kind: WordAffixKind, note: AffixNoteData) => AffixItem;
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onSearchOpen: (entry: CatalogEntry, focusWord?: string) => void;
  onBack: () => void;
  userFamilies: Record<string, UserFamily>;
  createUserFamily: (data: Omit<UserFamily, 'createdAt'>) => void;
  moveWordsToUserFamily: (familyId: string, words: WordEntry[], from?: { textbook: string; familyId: string }) => void;
  addWordToUserFamily: (familyId: string, word: WordEntry) => void;
  removeWordFromUserFamily: (familyId: string, word: string) => void;
  getUserFamilyWords: (familyId: string) => UserFamilyWord[];
  getWordOrder: (key: string) => string[];
  setWordOrder: (key: string, words: string[]) => void;
}

export function FamilyNotePage({
  entry,
  focusWord,
  getFamilyNote,
  setFamilyNote,
  getVideoId,
  setVideoId,
  getFamilyMeta,
  setFamilyMeta,
  getWordNote,
  setWordNote,
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
  getWordPos,
  setWordPos,
  getWordSenses,
  setWordSenses,
  getWordDefinition,
  setWordDefinition,
  hideWord,
  getHiddenWords,
  getWordAffixNotes,
  setWordAffixNote,
  items,
  getItem,
  onSaveToLibrary,
  onSaveGroup,
  onSearchOpen,
  onBack,
  userFamilies,
  createUserFamily,
  moveWordsToUserFamily,
  addWordToUserFamily,
  removeWordFromUserFamily,
  getUserFamilyWords,
  getWordOrder,
  setWordOrder,
}: FamilyNotePageProps) {
  const [family, setFamily] = useState<RootFamily | null>(null);
  const [familyError, setFamilyError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [activePanel, setActivePanel] = useState<string>(OVERVIEW_PANEL);
  const panelInitForFamily = useRef<string | null>(null);
  const lastFocusWord = useRef<string | undefined>(undefined);
  /** 当前聚焦词（路由深链 ?word= 或本页搜索点击），驱动展开/高亮/锚定 */
  const [focusedWord, setFocusedWord] = useState<string | undefined>(focusWord);

  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [searchSelectedIndex, setSearchSelectedIndex] = useState(-1);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [wordIndex, setWordIndex] = useState<IndexedWord[]>([]);
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [affixOverlayOpen, setAffixOverlayOpen] = useState(false);
  const [affixOverlayKind, setAffixOverlayKind] = useState<AffixKind>('suffix');
  const [reviewWord, setReviewWord] = useState<string | null>(null);
  /** 批量挂载模式 */
  const [batchMode, setBatchMode] = useState(false);
  const [batchSelected, setBatchSelected] = useState<Set<string>>(new Set());
  const [batchMoveOpen, setBatchMoveOpen] = useState(false);
  const [batchToast, setBatchToast] = useState('');
  const [editingVideo, setEditingVideo] = useState(false);
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [familyNoteEdit, setFamilyNoteEdit] = useState(false);
  const [metaRootsList, setMetaRootsList] = useState<string[]>([]);
  const [newRootText, setNewRootText] = useState('');
  const [metaSemanticText, setMetaSemanticText] = useState('');
  const [metaMeaningZhText, setMetaMeaningZhText] = useState('');
  const [metaMeaningEnText, setMetaMeaningEnText] = useState('');
  /** 统一编辑模式（拖拽排序 + 编辑/删除 + 新建） */
  const [editMode, setEditMode] = useState(false);
  /** 编辑面板模式：编辑已有单词 / 新建单词 */
  const [editPanelMode, setEditPanelMode] = useState<'edit' | 'create'>('edit');
  /** 正在编辑的单词（打开编辑面板）；null=关闭，''=创建模式 */
  const [editWordKey, setEditWordKey] = useState<string | null>(null);
  const [editWordText, setEditWordText] = useState('');
  const [editPhonetic, setEditPhonetic] = useState('');
  const [editSenses, setEditSenses] = useState<{ pos: string; definition: string }[]>([]);
  const [wordDragIdx, setWordDragIdx] = useState<number | null>(null);
  const [wordOverIdx, setWordOverIdx] = useState<number | null>(null);
  const wordDragState = useRef<{ fromIdx: number; startY: number; itemH: number; panel: string } | null>(null);

  /** 工具栏折叠 */
  const [toolbarOpen, setToolbarOpen] = useState(false);
  const { getStatus, setStatus, statsForKeys } = useProgress();
  const searchRef = useRef<HTMLDivElement>(null);
  const lastTopTapRef = useRef(0);

  /** 双击顶栏空白区域回到页面顶部（App 习惯） */
  const handleTopbarTap = () => {
    const now = Date.now();
    if (now - lastTopTapRef.current < 350) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      lastTopTapRef.current = 0;
    } else {
      lastTopTapRef.current = now;
    }
  };
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fKey = familyStorageKey(entry.textbook, entry.id);

  useEffect(() => {
    loadWordIndex().then(setWordIndex);
    loadCatalog().then(setCatalog).catch(() => setCatalog([]));
  }, []);

  /** 系统词根族：从 D1 API 加载，仅在条目/重试变化时加载 */
  useEffect(() => {
    if (entry.source === 'user') return;
    setFamilyError(false);
    fetchFamily(entry.textbook, entry.id, entry.file)
      .then(setFamily)
      .catch(() => setFamilyError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, retryTick]);

  /** 用户词根页重定向：roots 匹配官方词根族时，跳转到官方页（合并显示，避免 user/xxx 与 textbook/xxx 分裂） */
  useEffect(() => {
    if (entry.source !== 'user' || !family || family.words.length === 0) return;
    if (!family.roots || family.roots.length === 0) return;
    const rootsKey = [...family.roots].sort().join('|');
    const official = catalog.find(
      (e) => e.source !== 'user' && [...(e.roots ?? [])].sort().join('|') === rootsKey,
    );
    if (official) {
      onSearchOpen(official, focusedWord ?? undefined);
    }
  }, [entry.source, family, catalog, onSearchOpen, focusedWord]);

  /** 官方词根页合并本地挂载词：本地词根（roots 一致）挂载的词也显示在当前词根（一个词根完整视图） */
  useEffect(() => {
    if (!family || entry.source === 'user') return;
    const curRootsKey = [...(family.roots ?? [])].sort().join('|');
    const extras: WordEntry[] = [];
    for (const uf of Object.values(userFamilies)) {
      if ([...(uf.roots ?? [])].sort().join('|') !== curRootsKey) continue;
      for (const w of getUserFamilyWords(uf.id)) {
        if (!family.words.some((x) => x.word === w.word)) extras.push(w as WordEntry);
      }
    }
    if (extras.length) {
      setFamily((prev) => (prev ? { ...prev, words: [...prev.words, ...extras] } : prev));
    }
  }, [family, entry.source, userFamilies, getUserFamilyWords]);

  /** 用户自建词根族：localStorage 实时派生 */
  useEffect(() => {
    if (entry.source !== 'user') return;
    setFamilyError(false);
    const uf = userFamilies[entry.id];
    if (uf) {
      const local = getUserFamilyWords(uf.id) as WordEntry[];
      const localWords = new Set(local.map((w) => w.word));
      // 合并同词根（roots 完全一致）的官方数据词：本地词根 = 官方词 + 挂载词，实现"一个词根"完整视图
      const localRootsKey = [...(uf.roots ?? [])].sort().join('|');
      const catByKey = new Map(catalog.map((e) => [`${e.textbook}:${e.id}`, e]));
      const dataWords: WordEntry[] = [];
      for (const r of wordIndex) {
        const cat = catByKey.get(`${r.textbook}:${r.familyId}`);
        if (!cat || cat.source === 'user') continue;
        const rootsKey = [...(cat.roots ?? [])].sort().join('|');
        if (rootsKey === localRootsKey && !localWords.has(r.word)) {
          dataWords.push({
            word: r.word,
            phonetic: r.phonetic,
            pos: r.pos,
            definition: r.definition,
            mnemonic: r.mnemonic,
            frequency: r.frequency,
            collocations: [],
            examples: [],
          });
        }
      }
      setFamily({
        id: uf.id,
        source: 'user',
        chapter: entry.chapter || '我的',
        chapterOrder: 999,
        titleZh: uf.meaningZh,
        semanticLabel: uf.meaningZh,
        meaningEn: uf.meaningEn,
        meaningZh: uf.meaningZh,
        roots: uf.roots,
        words: [...dataWords, ...local],
      });
    } else {
      setFamilyError(true);
    }
  }, [entry, userFamilies, getUserFamilyWords, wordIndex, catalog]);

  useEffect(() => {
    if (!showSearch) return;
    const onClickOutside = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [showSearch]);

  /** 合并用户新建单词到搜索索引 */
  const searchIndex = useMemo(() => {
    const userWords: IndexedWord[] = [];
    for (const uf of Object.values(userFamilies)) {
      for (const w of getUserFamilyWords(uf.id)) {
        userWords.push({
          word: w.word,
          textbook: 'user',
          familyId: uf.id,
          file: '',
          phonetic: w.phonetic,
          pos: w.pos,
          definition: w.definition,
          mnemonic: w.mnemonic,
          frequency: w.frequency,
        });
      }
    }
    return [...wordIndex, ...userWords];
  }, [wordIndex, userFamilies, getUserFamilyWords]);

  const searchHits = useMemo(
    () => searchWords(searchIndex, searchQuery, undefined, 30),
    [searchIndex, searchQuery],
  );

  const catalogMap = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const c of catalog) m.set(`${c.textbook}:${c.id}`, c);
    return m;
  }, [catalog]);

  /** 搜索结果变化时重置键盘选中 */
  useEffect(() => {
    setSearchSelectedIndex(-1);
  }, [searchQuery]);

  /** 选中项滚动到视口 */
  useEffect(() => {
    if (searchSelectedIndex < 0 || !searchPanelRef.current) return;
    const el = searchPanelRef.current.children[searchSelectedIndex] as HTMLElement;
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [searchSelectedIndex]);

  /** 用户手动覆盖的词根/语义（localStorage，重导不丢） */
  const familyMeta = getFamilyMeta(fKey);
  const effectiveRoots = familyMeta?.roots?.length ? familyMeta.roots : family?.roots;

  /** 被删除（本地隐藏）的单词 */
  const hiddenWords = getHiddenWords();

  /** 本族被挂入用户词根族的词（word → 目标我的词根），不再显示在本族但可跳转查看 */
  const movedWords = useMemo(() => {
    const map = new Map<string, { id: string; label: string }>();
    const familyWordSet = new Set((family?.words ?? []).map((x) => x.word));
    for (const [id, uf] of Object.entries(userFamilies)) {
      for (const w of getUserFamilyWords(id)) {
        if (w._from?.textbook === entry.textbook && w._from?.familyId === entry.id) {
          // 仅收集本族数据中真实存在的词（旧挂载记录不污染提示条）
          if (!familyWordSet.has(w.word)) continue;
          map.set(w.word, {
            id,
            label: `${uf.roots.join(' · ')}${uf.meaningZh ? `（${uf.meaningZh}）` : ''}`,
          });
        }
      }
    }
    return map;
  }, [userFamilies, entry, getUserFamilyWords, family]);

  const groups = useMemo((): Map<string, WordEntry[]> => {
    if (!family || !effectiveRoots) return new Map<string, WordEntry[]>();
    const visible = family.words.filter(
      (w) => !movedWords.has(w.word) && !hiddenWords[wordKey(entry.textbook, family.id, w.word)],
    );
    return groupWordsByRoot(visible, effectiveRoots);
  }, [family, effectiveRoots, movedWords]);

  const variantTabs = useMemo((): VariantTab[] => {
    if (!family || !effectiveRoots) return [];
    return cleanRoots(effectiveRoots)
      .filter((root) => {
        const list = groups.get(root);
        return list && list.length > 0;
      })
      .map((root) => ({
        root,
        display: effectiveRoots.find((r) => normalizeRootForm(r) === root) ?? root,
        count: groups.get(root)!.length,
      }));
  }, [family, effectiveRoots, groups]);

  /** 从原族提示条跳转到目标我的词根族（带焦点词，多词根族自动切面板并定位） */
  const openUserFamilyById = useCallback((id: string, word?: string) => {
    const uf = userFamilies[id];
    if (!uf) return;
    onSearchOpen(
      {
        id: uf.id,
        file: '',
        chapter: '我的',
        chapterOrder: 999,
        titleZh: uf.meaningZh ?? '',
        semanticLabel: uf.meaningZh ?? '',
        meaningEn: uf.meaningEn ?? '',
        meaningZh: uf.meaningZh ?? '',
        roots: uf.roots,
        wordCount: 0,
        source: 'user',
        textbook: 'user',
      },
      word,
    );
  }, [userFamilies, onSearchOpen]);

  const handleSearchOpen = useCallback((hit: IndexedWord) => {
    setSearchQuery('');
    setShowSearch(false);
    // 用户新建单词：优先跳转到 roots 匹配的官方词根族页（合并显示），无匹配才去我的词根
    if (hit.textbook === 'user') {
      const uf = userFamilies[hit.familyId];
      if (uf) {
        const rootsKey = [...(uf.roots ?? [])].sort().join('|');
        const official = catalog.find(
          (e) => e.source !== 'user' && [...(e.roots ?? [])].sort().join('|') === rootsKey,
        );
        if (official) {
          setFocusedWord(hit.word);
          onSearchOpen(official, hit.word);
          return;
        }
      }
      openUserFamilyById(hit.familyId, hit.word);
      return;
    }
    const hitEntry = catalogMap.get(`${hit.textbook}:${hit.familyId}`);
    if (!hitEntry) return;
    if (hitEntry.textbook === entry.textbook && hitEntry.id === entry.id) {
      // 本页单词：切换面板 + 更新聚焦词（展开/高亮），并同步地址栏深链（不触发重载）
      setActivePanel(
        variantTabs.find((tab) => groups.get(tab.root)?.some((w) => w.word === hit.word))?.root ?? activePanel,
      );
      setFocusedWord(hit.word);
      history.replaceState(
        null,
        '',
        `#/family/${encodeURIComponent(entry.textbook)}/${encodeURIComponent(entry.id)}?word=${encodeURIComponent(hit.word)}`,
      );
    } else {
      onSearchOpen(hitEntry, hit.word);
    }
  }, [catalogMap, entry, variantTabs, groups, activePanel, onSearchOpen, openUserFamilyById]);

  /** 搜索输入框键盘导航：↑↓ 选中、Enter 进入详情 */
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (searchHits.length === 0) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSearchSelectedIndex((i) => Math.min(i + 1, searchHits.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSearchSelectedIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && searchSelectedIndex >= 0 && searchSelectedIndex < searchHits.length) {
        e.preventDefault();
        handleSearchOpen(searchHits[searchSelectedIndex]);
      }
    },
    [searchHits, searchSelectedIndex, handleSearchOpen],
  );

  const showVariantNav = variantTabs.length > 1;

  useEffect(() => {
    if (!family || variantTabs.length === 0) return;

    const pickPanelForWord = (word: string) => {
      const hit = variantTabs.find((tab) =>
        groups.get(tab.root)?.some((w) => w.word === word),
      );
      return hit?.root ?? variantTabs[0].root;
    };

    // 用 entry 维度（source+id）做初始化标记：同 id 的官方/自建入口互跳、同族内再搜另一个词都要重新选面板
    const entryKey = `${entry.source}:${entry.id}`;
    if (panelInitForFamily.current !== entryKey) {
      panelInitForFamily.current = entryKey;
      lastFocusWord.current = focusWord;
      setActivePanel(focusWord ? pickPanelForWord(focusWord) : variantTabs[0].root);
      return;
    }

    if (focusWord && focusWord !== lastFocusWord.current) {
      lastFocusWord.current = focusWord;
      setActivePanel(pickPanelForWord(focusWord));
    }
  }, [family?.id, entry, focusWord, variantTabs, groups]);

  useEffect(() => {
    if (!family || !focusedWord) return;
    // 多帧重试：Tab 切换/词卡展开后 DOM 可能尚未就绪，最多等 6 帧
    let tries = 0;
    const tryScroll = () => {
      const el =
        document.getElementById(`word-${focusedWord}`)
        ?? document.querySelector(`[id^="word-${CSS.escape(focusedWord)}-"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (tries < 6) {
        tries += 1;
        window.requestAnimationFrame(tryScroll);
      }
    };
    tryScroll();
    // 仅词根族切换 / 聚焦词 / 面板切换时锚定；编辑笔记不改变 family?.id，不触发滚动
  }, [family?.id, focusedWord, activePanel]);

  /** 路由深链变化时同步本地聚焦词 */
  useEffect(() => {
    setFocusedWord(focusWord);
  }, [focusWord]);

  const handlePanelChange = (panel: string) => {
    setActivePanel(panel);
    window.requestAnimationFrame(() => {
      document.querySelector('.variant-panel-head')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  /** 悬浮条：词根链（如 -val · -vail）+ 中文语义优先（如 强壮） */
  const followRoots = useMemo(
    () => (effectiveRoots && effectiveRoots.length
      ? effectiveRoots.map((r) => `-${r.replace(/^-+/, '')}`).join(' · ')
      : ''),
    [effectiveRoots],
  );
  const followMeaning = useMemo(
    () =>
      familyMeta?.meaningZh?.trim()
      || familyMeta?.semantic?.trim()
      || family?.meaningZh?.trim()
      || family?.semanticLabel?.trim()
      || family?.meaningEn?.trim()
      || '',
    [family, familyMeta],
  );

  const wordCardPropsFor = (w: WordEntry, index: number): WordCardProps => {
    const wKey = wordKey(entry.textbook, family!.id, w.word);
    return {
      cardDomId: `word-${w.word}-${index}`,
      word: w,
      familyRoots: family!.roots,
      textbook: entry.textbook,
      familyId: family!.id,
      personalNote: getWordNote(wKey),
      mnemonicNote: getWordMnemonic(wKey, w.mnemonic),
      collocationsNote: getWordCollocations(wKey, w.collocations),
      examplesNote: getWordExamples(wKey, w.examples),
      etymologyNote: getWordEtymology(wKey, w.etymology ?? ''),
      definitionOverride: getWordDefinition(wKey, w.definition ?? ''),
      posOverride: getWordPos(wKey, w.pos ?? ''),
      sensesOverride: getWordSenses(wKey),
      affixNotes: getWordAffixNotes(wKey),
      items,
      getItem,
      onSaveToLibrary,
      onSaveGroup,
      onOpenAffixLibrary: () => setAffixOverlayOpen(true),
      onNote: (text) => setWordNote(wKey, text),
      onMnemonicNote: (text) => setWordMnemonic(wKey, text),
      onCollocationsNote: (text) => setWordCollocations(wKey, text),
      onExamplesNote: (examples) => setWordExamples(wKey, examples),
      onEtymologyNote: (text) => setWordEtymology(wKey, text),
      onAffixNote: (kind, note) => setWordAffixNote(wKey, kind, note),
      familyFrom: (w as UserFamilyWord)._from,
      editMode: editMode,
      onEditWord: (word) => {
        setEditPanelMode('edit');
        const k = wordKey(entry.textbook, family!.id, word.word);
        setEditWordKey(k);
        setEditWordText(word.word);
        setEditPhonetic(getWordPhonetic(k, word.phonetic ?? ''));
        const existingSenses = getWordSenses(k);
        if (existingSenses && existingSenses.length > 0) {
          setEditSenses(existingSenses.map((x) => ({ ...x })));
        } else {
          setEditSenses([{ pos: getWordPos(k, word.pos ?? ''), definition: getWordDefinition(k, word.definition ?? '') }]);
        }
      },
      onDeleteWord: (word) => {
        const k = wordKey(entry.textbook, family!.id, word.word);
        if (window.confirm(`删除单词 ${word.word}？（本地隐藏，可在数据导出中找回）`)) {
          hideWord(k);
          if (entry.source === 'user') removeWordFromUserFamily(entry.id, word.word);
        }
      },
      onMoveBack:
        entry.source === 'user'
          ? (word) => {
              removeWordFromUserFamily(entry.id, word);
              setBatchToast(`已移回原族 ${word}`);
              window.setTimeout(() => setBatchToast(''), 2600);
            }
          : undefined,
    };
  };

  /** 当前面板可见的词（全选的范围） */
  const batchVisibleWords = useMemo(() => {
    if (!family) return [] as WordEntry[];
    if (showVariantNav && activePanel !== OVERVIEW_PANEL) {
      return groups.get(activePanel) ?? [];
    }
    return [...groups.values()].flat();
  }, [family, showVariantNav, activePanel, groups]);

  const toggleBatchSelect = (word: string) => {
    setBatchSelected((prev) => {
      const next = new Set(prev);
      if (next.has(word)) next.delete(word);
      else next.add(word);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setBatchSelected((prev) => {
      const all = batchVisibleWords.map((w) => w.word);
      const allSelected = all.length > 0 && all.every((w) => prev.has(w));
      return allSelected ? new Set<string>() : new Set(all);
    });
  };

  const executeBatchMove = (familyId: string) => {
    if (!family) return;
    const words = [...batchSelected]
      .map((name) => family.words.find((w) => w.word === name))
      .filter((w): w is WordEntry => Boolean(w));
    if (!words.length) return;
    // 从用户词根族转出时不传 from，保留词自带的原数据族归属（否则原族会重新显示该词，破坏一词一归）
    moveWordsToUserFamily(
      familyId,
      words,
      entry.source === 'user' ? undefined : { textbook: entry.textbook, familyId: family.id },
    );
    // 在「我的词根」页内挂载到其他词根时，同时从当前族移除（保持一词一归）
    if (entry.source === 'user') {
      words.forEach((w) => removeWordFromUserFamily(entry.id, w.word));
    }
    const target = userFamilies[familyId];
    const label = target ? target.roots.join(' · ') : familyId;
    setBatchToast(`已挂载 ${words.length} 词到 ${label}`);
    setBatchMoveOpen(false);
    setBatchSelected(new Set());
    setBatchMode(false);
    window.setTimeout(() => setBatchToast(''), 2600);
  };

  const batchCreateAndMove = (roots: string[], textbook?: string) => {
    if (!roots.length) return;
    const id = roots[0];
    if (!userFamilies[id]) {
      createUserFamily({ id, roots, meaningZh: '', meaningEn: '', textbook });
    }
    executeBatchMove(id);
  };

  const batchMoveViaCatalog = (target: CatalogEntry) => {
    const id = target.id;
    if (!userFamilies[id]) {
      createUserFamily({
        id,
        roots: target.roots.length ? target.roots : [id],
        meaningZh: target.meaningZh ?? target.semanticLabel ?? target.titleZh ?? '',
        meaningEn: target.meaningEn ?? '',
      });
    }
    executeBatchMove(id);
  };

  /** 新建单词：挂入当前词根族（通过用户词根族中转） */
  /** 打开编辑面板的创建模式 */
  const openCreatePanel = () => {
    setEditPanelMode('create');
    setEditWordKey('');
    setEditWordText('');
    setEditPhonetic('');
    setEditSenses([{ pos: '', definition: '' }]);
  };

  /** 找到或创建匹配当前词根的用户词根族 */
  const ensureUserFamily = (): string | null => {
    if (!family) return null;
    const roots = effectiveRoots ?? family.roots;
    if (!roots.length) return null;
    const rootsKey = [...roots].sort().join('|');
    for (const uf of Object.values(userFamilies)) {
      if ([...(uf.roots ?? [])].sort().join('|') === rootsKey) return uf.id;
    }
    const targetId = roots[0];
    if (!userFamilies[targetId]) {
      createUserFamily({
        id: targetId,
        roots: [...roots],
        meaningZh: family.meaningZh ?? entry.meaningZh ?? '',
        meaningEn: family.meaningEn ?? entry.meaningEn ?? '',
        textbook: entry.source === 'user' ? entry.textbook : undefined,
      });
    }
    return targetId;
  };

  /** 按已保存顺序排列单词（未保存的保持原位） */
  const applyWordOrder = (words: WordEntry[], panel: string): WordEntry[] => {
    const orderKey = `${entry.textbook}:${entry.id}:${panel}`;
    const saved = getWordOrder(orderKey);
    if (!saved.length) return words;
    const idxMap = new Map(saved.map((w, i) => [w, i]));
    return [...words].sort((a, b) => {
      const ai = idxMap.get(a.word) ?? Infinity;
      const bi = idxMap.get(b.word) ?? Infinity;
      return ai - bi;
    });
  };

  /** 保存单词新顺序 */
  const saveWordOrder = (panel: string, words: WordEntry[]) => {
    const orderKey = `${entry.textbook}:${entry.id}:${panel}`;
    setWordOrder(orderKey, words.map((w) => w.word));
  };

  /* ── 单词拖拽排序（pointer events） ── */
  const onWordPointerMove = useCallback(
    (e: PointerEvent) => {
      const ds = wordDragState.current;
      if (!ds) return;
      e.preventDefault();
      const delta = e.clientY - ds.startY;
      const offset = Math.round(delta / ds.itemH);
      // 需要获取当前面板的单词数来限制范围
      const target = Math.max(0, Math.min(ds.fromIdx + offset, 999));
      setWordOverIdx(target);
    },
    [],
  );

  const onWordPointerUp = useCallback(() => {
    const ds = wordDragState.current;
    if (!ds) return;
    document.removeEventListener('pointermove', onWordPointerMove);
    document.removeEventListener('pointerup', onWordPointerUp);

    setWordOverIdx((cur) => {
      if (cur !== null && cur !== ds.fromIdx) {
        // 找到当前面板的单词列表，执行重排
        const panel = ds.panel;
        const words = groups.get(panel) ?? [];
        const ordered = applyWordOrder(words, panel);
        const from = ds.fromIdx;
        const to = Math.max(0, Math.min(cur, ordered.length - 1));
        if (from !== to && from < ordered.length) {
          const next = [...ordered];
          const [moved] = next.splice(from, 1);
          next.splice(to, 0, moved);
          saveWordOrder(panel, next);
        }
      }
      return null;
    });
    setWordDragIdx(null);
    wordDragState.current = null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onWordPointerMove, groups]);

  const startWordDrag = (idx: number, panel: string) => (e: React.PointerEvent) => {
    if (!editMode) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const el = (e.target as HTMLElement).closest('.word-card') as HTMLElement;
    const itemH = el?.getBoundingClientRect().height ?? 80;
    wordDragState.current = { fromIdx: idx, startY: e.clientY, itemH, panel };
    setWordDragIdx(idx);
    setWordOverIdx(idx);
    document.addEventListener('pointermove', onWordPointerMove, { passive: false });
    document.addEventListener('pointerup', onWordPointerUp);
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('pointermove', onWordPointerMove);
      document.removeEventListener('pointerup', onWordPointerUp);
    };
  }, [onWordPointerMove, onWordPointerUp]);

  const renderAddWordForm = () => (
    <div className="add-word-section">
      <button type="button" className="add-word-btn" onClick={openCreatePanel}>
        ＋ 新建单词
      </button>
    </div>
  );

  const renderWordCards = (words: WordEntry[], panelKey: string) => {
    const ordered = applyWordOrder(words, panelKey);
    return (
      <div className="word-list">
        {ordered.map((w, index) => {
          const isDragging = editMode && wordDragIdx === index;
          const isOver = editMode && wordOverIdx === index && wordDragIdx !== null && wordDragIdx !== index;
          return (
            <div
              key={`sort-${panelKey}-${w.word}`}
              className={[
                'word-sort-item',
                isDragging ? 'word-sort-item-dragging' : '',
                isOver ? 'word-sort-item-over' : '',
              ].filter(Boolean).join(' ')}
            >
              {editMode && (
                <span
                  className="word-sort-handle"
                  onPointerDown={startWordDrag(index, panelKey)}
                  style={{ touchAction: 'none' }}
                >
                  ≡
                </span>
              )}
              <div className="word-sort-item-content">
                <WordCard
                  key={`${panelKey}-${w.word}-${index}${focusedWord === w.word ? '-focus' : ''}`}
                  {...wordCardPropsFor(w, index)}
                  defaultCollapsed={focusedWord !== w.word}
                  highlighted={focusedWord === w.word}
                  batchMode={batchMode}
                  selected={batchSelected.has(w.word)}
                  onToggleSelect={toggleBatchSelect}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!family) {
    return (
      <div className="page-loading">
        <div className="note-topbar note-topbar-loading">
          <button type="button" className="back-link" onClick={onBack}>
            ← 返回知识库
          </button>
        </div>
        {familyError ? (
          <div className="load-error-hint">
            <span>
              {entry.source === 'user'
                ? '这个词根不存在或已被删除'
                : `词根族数据加载失败（/api/db/family/${entry.textbook}/${entry.file}）`}
            </span>
            <button type="button" onClick={() => setRetryTick((t) => t + 1)}>重试</button>
          </div>
        ) : (
          <div className="page-skeleton">
            <div className="skeleton-line w60" />
            <div className="skeleton-line w40" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
        )}
      </div>
    );
  }

  const semantic = familyMeta?.semantic?.trim()
    || familyMeta?.meaningZh?.trim()
    || displaySemantic(entry);
  const familyNote = getFamilyNote(fKey);
  const hasFamilyNote = Boolean(familyNote.trim());
  const videoId = getVideoId(fKey);
  const activeWords = activePanel !== OVERVIEW_PANEL ? groups.get(activePanel) ?? [] : [];
  const familyStats = statsForKeys(family.words.map((w) => wordKey(entry.textbook, family.id, w.word)));

  const openMetaEditor = () => {
    setMetaRootsList([...(effectiveRoots ?? [])]);
    setNewRootText('');
    setMetaSemanticText(familyMeta?.semantic ?? family?.semanticLabel ?? '');
    setMetaMeaningZhText(familyMeta?.meaningZh ?? family?.meaningZh ?? '');
    setMetaMeaningEnText(familyMeta?.meaningEn ?? family?.meaningEn ?? '');
    setMetaEditOpen(true);
  };

  /** chip 编辑器：把输入框内容追加为新词根变体（去重，保留教材写法） */
  const commitNewRoot = () => {
    const v = newRootText.trim();
    if (!v) return;
    if (!metaRootsList.some((r) => r.toLowerCase() === v.toLowerCase())) {
      setMetaRootsList((prev) => [...prev, v]);
    }
    setNewRootText('');
  };

  return (
    <div className="note-page">
      <header className="note-topbar" onClick={handleTopbarTap}>
        <div className="note-topbar-inner">
          <button type="button" className="back-link" onClick={onBack}>
            ← 返回知识库
          </button>
          <div className="detail-search-wrap" ref={searchRef}>
            <input
              ref={searchInputRef}
              className="detail-search-input"
              placeholder="搜索全库单词…"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowSearch(true); }}
              onFocus={() => { if (searchQuery.trim()) setShowSearch(true); }}
              onKeyDown={handleSearchKeyDown}
            />
            {showSearch && searchQuery.trim() && searchHits.length > 0 && (
              <div className="detail-search-panel" ref={searchPanelRef}>
                {searchHits.map((hit, idx) => {
                  const hitEntry = catalogMap.get(`${hit.textbook}:${hit.familyId}`);
                  const sameFamily = hit.textbook === entry.textbook && hit.familyId === entry.id;
                  return (
                    <button
                      key={`${hit.textbook}-${hit.familyId}-${hit.word}`}
                      type="button"
                      className={`detail-search-hit${idx === searchSelectedIndex ? ' detail-search-hit-selected' : ''}`}
                      onClick={() => handleSearchOpen(hit)}
                    >
                      <span className="detail-search-hit-word">{hit.word}</span>
                      {hit.phonetic && <span className="detail-search-hit-phonetic">/{hit.phonetic}/</span>}
                      {hit.definition && (
                        <span className="detail-search-hit-def">
                          {hit.pos && <em>{hit.pos} </em>}
                          {hit.definition.length > 60 ? `${hit.definition.slice(0, 60)}…` : hit.definition}
                        </span>
                      )}
                      {!sameFamily && hitEntry && (
                        <span className="detail-search-hit-family">{displayRoots(hitEntry)}</span>
                      )}
                      {sameFamily && <span className="detail-search-hit-here">本页</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <span className="badge muted-badge note-topbar-word-count">{family.words.length} 词</span>
          <button
            type="button"
            className={`note-topbar-toolbar-toggle ${toolbarOpen ? 'is-open' : ''}`}
            onClick={() => setToolbarOpen((v) => !v)}
            title="工具栏"
          >
            {toolbarOpen ? '✕' : '⚙'}
          </button>
        </div>
        {toolbarOpen && (
          <div className="note-topbar-toolbar">
            <button
              type="button"
              className={`note-topbar-batch-btn ${batchMode ? 'is-active' : ''}`}
              onClick={() => {
                setBatchMode((v) => !v);
                setBatchSelected(new Set());
              }}
              title="批量选择单词，挂载到我的词根"
            >
              {batchMode ? '完成' : '☑ 批量'}
            </button>
            <button
              type="button"
              className={`note-topbar-sort-btn ${editMode ? 'is-active' : ''}`}
              onClick={() => {
                setEditMode((v) => !v);
                setEditWordKey(null);
                setWordDragIdx(null);
                setWordOverIdx(null);
              }}
              title="编辑单词（拖拽排序/编辑释义/新建/删除）"
            >
              {editMode ? '完成' : '✏️ 编辑'}
            </button>
            <button type="button" className="note-topbar-affix-btn" onClick={() => setAffixOverlayOpen(true)}>
              词根词缀库
            </button>
            {editingVideo ? (
              <input
                className="video-id-input"
                autoFocus
                placeholder="如 1-03"
                defaultValue={videoId}
                onChange={(e) => {
                  // 输入即保存：无论 Enter/失焦/Esc/直接离开，视频号都已落盘
                  setVideoId(fKey, e.target.value);
                }}
                onBlur={() => setEditingVideo(false)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') (e.target as HTMLInputElement).blur();
                }}
              />
            ) : (
              <button
                type="button"
                className={`video-badge ${videoId ? 'has-id' : ''}`}
                onClick={() => setEditingVideo(true)}
                title={videoId ? `视频编号 ${videoId}，点击修改` : '点击设置该词根族的视频编号'}
              >
                🎬 {videoId || '视频编号'}
              </button>
            )}
            <button
              type="button"
              className="meta-edit-btn"
              onClick={openMetaEditor}
              title="编辑词根变体与语义（按教程修正）"
            >
              ✎ 词根
            </button>
          </div>
        )}
      </header>

      {showVariantNav && (
        <div className="family-variant-nav-wrap">
          <div className="note-topbar-inner">
            <FamilyVariantNav
              tabs={variantTabs}
              active={activePanel}
              onChange={handlePanelChange}
            />
          </div>
        </div>
      )}

      <article className="note-doc">
        <header className="doc-head">
          <h1 className="doc-title">{semantic ?? displayRoots(entry)}</h1>
          {semantic && <p className="doc-subtitle doc-roots-line">{(effectiveRoots ?? []).join(' · ')}</p>}
          {(familyStats.understood > 0 || familyStats.review > 0) && (
            <p className="progress-text">
              已掌握 {familyStats.understood}/{familyStats.total}
              {familyStats.review > 0 && ` · 待复习 ${familyStats.review}`}
            </p>
          )}
        </header>

        {metaEditOpen && (
          <div className="family-meta-editor">
            <div className="family-meta-field">
              <label htmlFor="meta-new-root">词根变体（点 × 移除，输入后回车添加）</label>
              <div className="meta-root-chips">
                {metaRootsList.map((r) => (
                  <span key={r} className="meta-root-chip">
                    {r}
                    <button
                      type="button"
                      className="meta-root-chip-del"
                      title={`移除 ${r}`}
                      aria-label={`移除词根 ${r}`}
                      onClick={() => setMetaRootsList((prev) => prev.filter((x) => x !== r))}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  id="meta-new-root"
                  className="meta-root-add-input"
                  value={newRootText}
                  onChange={(e) => setNewRootText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitNewRoot();
                    }
                    // 退格删空输入框时，退回移除最后一个 chip
                    if (e.key === 'Backspace' && !newRootText) {
                      setMetaRootsList((prev) => prev.slice(0, -1));
                    }
                  }}
                  onBlur={() => { if (newRootText.trim()) commitNewRoot(); }}
                  placeholder="＋ 新增词根"
                />
              </div>
            </div>
            <div className="family-meta-field">
              <label htmlFor="meta-meaning-zh">中文释义</label>
              <input
                id="meta-meaning-zh"
                className="family-meta-input"
                value={metaMeaningZhText}
                onChange={(e) => setMetaMeaningZhText(e.target.value)}
                placeholder="折叠；重合；倍"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="meta-meaning-en">英文含义</label>
              <input
                id="meta-meaning-en"
                className="family-meta-input"
                value={metaMeaningEnText}
                onChange={(e) => setMetaMeaningEnText(e.target.value)}
                placeholder="fold"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="meta-semantic">语义标签</label>
              <input
                id="meta-semantic"
                className="family-meta-input"
                value={metaSemanticText}
                onChange={(e) => setMetaSemanticText(e.target.value)}
                placeholder="付钱；悬挂"
              />
            </div>
            <div className="family-meta-editor-actions">
              <button
                type="button"
                className="family-meta-save"
                onClick={() => {
                  // 输入框里尚未回车的词根也一并收录，避免直接点保存时丢失
                  const pending = newRootText.trim();
                  const roots =
                    pending && !metaRootsList.some((r) => r.toLowerCase() === pending.toLowerCase())
                      ? [...metaRootsList, pending]
                      : metaRootsList;
                  const meta: FamilyMeta = {};
                  if (roots.length) meta.roots = roots;
                  if (metaMeaningZhText.trim()) meta.meaningZh = metaMeaningZhText.trim();
                  if (metaMeaningEnText.trim()) meta.meaningEn = metaMeaningEnText.trim();
                  if (metaSemanticText.trim()) meta.semantic = metaSemanticText.trim();
                  setFamilyMeta(fKey, meta);
                  setMetaEditOpen(false);
                }}
              >
                保存
              </button>
              <button
                type="button"
                className="family-meta-reset"
                onClick={() => {
                  setFamilyMeta(fKey, {});
                  setMetaEditOpen(false);
                }}
              >
                恢复默认
              </button>
              <button type="button" className="family-meta-cancel" onClick={() => setMetaEditOpen(false)}>
                取消
              </button>
            </div>
          </div>
        )}

        <div className="family-variant-content">
          {(!showVariantNav || activePanel === OVERVIEW_PANEL) && (
            <>
              {entry.source !== 'user' && <VariantMap roots={effectiveRoots ?? []} />}

              {hasFamilyNote || familyNoteEdit ? (
                <section className="doc-section">
                  <h2>我的词根理解</h2>
                  <NoteEditor
                    value={familyNote}
                    placeholder="点击这里写下你对整个词根族的理解（支持 **粗体** *斜体* - 列表）"
                    onChange={(text) => setFamilyNote(fKey, text)}
                    minRows={4}
                    autoEdit={!hasFamilyNote}
                  />
                </section>
              ) : (
                <button type="button" className="family-note-empty" onClick={() => setFamilyNoteEdit(true)}>
                  ＋ 写下你对整个词根族的理解
                </button>
              )}

              {entry.source !== 'user' && (
                <MiniRelationGraph
                  title={(effectiveRoots ?? []).join(' · ')}
                  roots={effectiveRoots ?? []}
                  words={family.words}
                  onOpenWord={setReviewWord}
                  statusFor={(w) => getStatus(wordKey(entry.textbook, family.id, w))}
                />
              )}

              {!showVariantNav && followMeaning && (
                <DraggableFollowBar
                  followRoots={followRoots}
                  followMeaning={followMeaning}
                  hidden={showSearch && Boolean(searchQuery.trim())}
                />
              )}

              {!showVariantNav && movedWords.size > 0 && (
                <div className="family-moved-hint">
                  <span className="family-moved-hint-label">
                    已移入你的词根 {movedWords.size} 词：
                  </span>
                  {[...movedWords.entries()].map(([word, t]) => (
                    <button
                      key={word}
                      type="button"
                      className="family-moved-hint-word"
                      onClick={() => openUserFamilyById(t.id, word)}
                      title={`查看我的词根 ${t.label}`}
                    >
                      {word} → {t.label}
                    </button>
                  ))}
                </div>
              )}

              {!showVariantNav && [...groups.entries()].map(([root, words]) => (
                <section key={root} className="root-group">
                  <h2 className="root-group-title">{root}</h2>
                  {renderWordCards(words, root)}
                </section>
              ))}
              {renderAddWordForm()}
            </>
          )}

          {showVariantNav && activePanel !== OVERVIEW_PANEL && (
            <section key={activePanel} className="root-group root-group-panel">
              {followMeaning && (
                <DraggableFollowBar
                  followRoots={followRoots}
                  followMeaning={followMeaning}
                  hidden={showSearch && Boolean(searchQuery.trim())}
                />
              )}
              <header className="variant-panel-head">
                <div>
                  <h2 className="variant-panel-title">{activePanel}</h2>
                  <p className="variant-panel-hint">词根变体 · {semantic ?? displayRoots(entry)}</p>
                </div>
                <span className="variant-panel-meta">{activeWords.length} 词</span>
              </header>
              {renderWordCards(activeWords, activePanel)}
              {renderAddWordForm()}
              <VariantStepper
                tabs={variantTabs}
                active={activePanel}
                onChange={handlePanelChange}
              />
            </section>
          )}
        </div>
      </article>

      {reviewWord && (() => {
        const idx = family.words.findIndex((w) => w.word === reviewWord);
        if (idx < 0) return null;
        const w = family.words[idx];
        const wKey = wordKey(entry.textbook, family.id, w.word);
        return (
          <WordCardModal
            wordCardProps={{ ...wordCardPropsFor(w, idx), cardDomId: `review-${w.word}`, defaultCollapsed: false }}
            status={getStatus(wKey)}
            onSetStatus={(s) => setStatus(wKey, s)}
            onClose={() => setReviewWord(null)}
          />
        );
      })()}

      {batchMode && (
        <div className="batch-bar">
          <div className="batch-bar-inner">
            <span className="batch-bar-count">
              已选 <b>{batchSelected.size}</b> 词
            </span>
            <button
              type="button"
              className="batch-bar-btn"
              onClick={toggleSelectAll}
              disabled={batchVisibleWords.length === 0}
            >
              {batchVisibleWords.length > 0 && batchVisibleWords.every((w) => batchSelected.has(w.word))
                ? '取消全选'
                : '全选'}
            </button>
            <button
              type="button"
              className="batch-bar-btn primary"
              disabled={batchSelected.size === 0}
              onClick={() => setBatchMoveOpen(true)}
            >
              挂载到词根
            </button>
          </div>
        </div>
      )}

      {batchMoveOpen && (
        <BatchMoveModal
          count={batchSelected.size}
          catalog={catalog}
          userFamilies={userFamilies}
          userCounts={Object.fromEntries(
            Object.keys(userFamilies).map((id) => [id, getUserFamilyWords(id).length]),
          )}
          onClose={() => setBatchMoveOpen(false)}
          onMove={executeBatchMove}
          onCreateAndMove={batchCreateAndMove}
          onMoveViaCatalog={batchMoveViaCatalog}
        />
      )}

      {editWordKey !== null && family && (() => {
        const isCreate = editPanelMode === 'create';
        const wKey = editWordKey;
        return (
          <div
            className="word-edit-backdrop"
            role="presentation"
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              (e.currentTarget as HTMLElement).dataset.pd = `${e.clientX},${e.clientY}`;
            }}
            onPointerUp={(e) => {
              if (e.target !== e.currentTarget) return;
              const start = (e.currentTarget as HTMLElement).dataset.pd;
              if (!start) return;
              const [x, y] = start.split(',').map(Number);
              const dx = Math.abs(e.clientX - x);
              const dy = Math.abs(e.clientY - y);
              if (dx < 5 && dy < 5) setEditWordKey(null);
              delete (e.currentTarget as HTMLElement).dataset.pd;
            }}
          >
            <div
              className="word-edit-panel"
              role="dialog"
              aria-modal="true"
              aria-label={isCreate ? '新建单词' : `编辑 ${editWordText}`}
              onClick={(e) => e.stopPropagation()}
            >
              <header className="word-edit-head">
                <h3 className="word-edit-title">{isCreate ? '新建单词' : `编辑单词 · ${editWordText}`}</h3>
                <button type="button" className="word-edit-close" onClick={() => setEditWordKey(null)}>
                  ✕
                </button>
              </header>
              {isCreate && (
                <div className="word-edit-field">
                  <label htmlFor="word-edit-name">单词（必填）</label>
                  <input
                    id="word-edit-name"
                    className="word-edit-input"
                    value={editWordText}
                    onChange={(e) => setEditWordText(e.target.value)}
                    placeholder="respect"
                    autoFocus
                    spellCheck={false}
                    autoCorrect="off"
                  />
                </div>
              )}
              <div className="word-edit-field">
                <label>词性与释义（词典风格，每个词性对应各自的解释）</label>
                {editSenses.map((sense, idx) => (
                  <div key={idx} className="word-sense-row">
                    <input
                      className="word-edit-input word-sense-pos"
                      value={sense.pos}
                      onChange={(e) => {
                        const next = [...editSenses];
                        next[idx] = { ...next[idx], pos: e.target.value };
                        setEditSenses(next);
                      }}
                      placeholder="vt."
                      spellCheck={false}
                      autoCorrect="off"
                    />
                    <textarea
                      className="word-edit-input word-sense-def word-sense-textarea"
                      value={sense.definition}
                      onChange={(e) => {
                        const next = [...editSenses];
                        next[idx] = { ...next[idx], definition: e.target.value };
                        setEditSenses(next);
                      }}
                      placeholder="系；把……打成结…"
                      rows={1}
                    />
                    <button
                      type="button"
                      className="word-sense-del"
                      title="删除该词性"
                      onClick={() => setEditSenses((prev) => prev.filter((_, i) => i !== idx))}
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="word-sense-add"
                  onClick={() => setEditSenses((prev) => [...prev, { pos: '', definition: '' }])}
                >
                  ＋ 添加词性
                </button>
              </div>
              <div className="word-edit-field">
                <label htmlFor="word-edit-phonetic">音标</label>
                <input
                  id="word-edit-phonetic"
                  className="word-edit-input"
                  value={editPhonetic}
                  onChange={(e) => setEditPhonetic(e.target.value)}
                  placeholder="rɪˈspɛkt"
                  spellCheck={false}
                  autoCorrect="off"
                />
              </div>
              <div className="word-edit-actions">
                <button
                  type="button"
                  className="word-edit-save"
                  disabled={isCreate && !editWordText.trim()}
                  onClick={() => {
                    const cleaned = editSenses
                      .map((x) => ({ pos: x.pos.trim(), definition: x.definition.trim() }))
                      .filter((x) => x.pos || x.definition);

                    if (isCreate) {
                      const word = editWordText.trim().toLowerCase();
                      if (!word) return;
                      const targetId = ensureUserFamily();
                      if (!targetId) return;
                      const newEntry: WordEntry = {
                        word,
                        phonetic: editPhonetic.trim() || undefined,
                        definition: cleaned.length > 0
                          ? cleaned.map((x) => (x.pos ? `${x.pos} ${x.definition}` : x.definition)).join(' ')
                          : undefined,
                        collocations: [],
                        examples: [],
                      };
                      addWordToUserFamily(targetId, newEntry);
                      if (cleaned.length > 0) {
                        const newWKey = wordKey(entry.textbook, targetId, word);
                        setWordSenses(newWKey, cleaned);
                        setWordPos(newWKey, cleaned.map((x) => x.pos).filter(Boolean).join('/'));
                        if (editPhonetic.trim()) setWordPhonetic(newWKey, editPhonetic.trim());
                      }
                      setBatchToast(`已新建 ${word}`);
                    } else {
                      setWordPhonetic(wKey, editPhonetic.trim());
                      if (cleaned.length > 0) {
                        setWordSenses(wKey, cleaned);
                        setWordPos(wKey, cleaned.map((x) => x.pos).filter(Boolean).join('/'));
                        setWordDefinition(
                          wKey,
                          cleaned.map((x) => (x.pos ? `${x.pos} ${x.definition}` : x.definition)).join(' '),
                        );
                      } else {
                        setWordSenses(wKey, []);
                      }
                      setBatchToast(`已保存 ${editWordText}`);
                    }
                    setEditWordKey(null);
                    window.setTimeout(() => setBatchToast(''), 2600);
                  }}
                >
                  保存
                </button>
                <button type="button" className="word-edit-cancel" onClick={() => setEditWordKey(null)}>
                  取消
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {batchToast && <div className="family-toast" role="status">{batchToast}</div>}

      {affixOverlayOpen && (
        <AffixLibraryOverlay
          kind={affixOverlayKind}
          items={items}
          onSaveGroup={onSaveGroup}
          onClose={() => setAffixOverlayOpen(false)}
          kindTabs={(
            <div className="affix-lib-overlay-tabs">
              {(['prefix', 'suffix', 'root'] as AffixKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`affix-lib-overlay-tab ${affixOverlayKind === k ? 'active' : ''}`}
                  onClick={() => setAffixOverlayKind(k)}
                >
                  {k === 'prefix' ? '前缀' : k === 'suffix' ? '后缀' : '词根'}
                </button>
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}
