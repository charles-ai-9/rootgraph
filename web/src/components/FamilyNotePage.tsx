import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AffixItem, AffixKind, AffixNoteData, CatalogEntry, RootFamily, WordAffixKind, WordEntry, WordAffixNotes } from '../types';
import { cleanRoots, displaySemantic, displayRoots, normalizeRootForm, wordKey } from '../types';
import { familyStorageKey } from '../catalog';
import { groupWordsByRoot } from '../utils/family';
import type { FamilyMeta, UserFamily, UserFamilyWord } from '../hooks/useNotes';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { loadWordIndex, searchWords, type IndexedWord } from '../hooks/useWordIndex';
import { loadCatalog } from '../appRoute';
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
  removeWordFromUserFamily: (familyId: string, word: string) => void;
  getUserFamilyWords: (familyId: string) => UserFamilyWord[];
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
  removeWordFromUserFamily,
  getUserFamilyWords,
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

  /** 系统词根族：静态 JSON，仅在条目/重试变化时加载（不依赖笔记 store，避免打字触发重取） */
  useEffect(() => {
    if (entry.textbook === 'user') return;
    setFamilyError(false);
    fetch(`/data/${entry.textbook}/${entry.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setFamily)
      .catch(() => setFamilyError(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, retryTick]);

  /** 用户自建词根族：localStorage 实时派生 */
  useEffect(() => {
    if (entry.textbook !== 'user') return;
    setFamilyError(false);
    const uf = userFamilies[entry.id];
    if (uf) {
      setFamily({
        id: uf.id,
        source: 'user',
        chapter: '我的',
        chapterOrder: 999,
        titleZh: uf.meaningZh,
        semanticLabel: uf.meaningZh,
        meaningEn: uf.meaningEn,
        meaningZh: uf.meaningZh,
        roots: uf.roots,
        words: getUserFamilyWords(uf.id) as WordEntry[],
      });
    } else {
      setFamilyError(true);
    }
  }, [entry, userFamilies, getUserFamilyWords]);

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

  const searchHits = useMemo(
    () => searchWords(wordIndex, searchQuery, undefined, 30),
    [wordIndex, searchQuery],
  );

  const catalogMap = useMemo(() => {
    const m = new Map<string, CatalogEntry>();
    for (const c of catalog) m.set(`${c.textbook}:${c.id}`, c);
    return m;
  }, [catalog]);

  /** 用户手动覆盖的词根/语义（localStorage，重导不丢） */
  const familyMeta = getFamilyMeta(fKey);
  const effectiveRoots = familyMeta?.roots?.length ? familyMeta.roots : family?.roots;

  /** 本族被挂入用户词根族的词（不再显示在本族） */
  const movedWords = useMemo(() => {
    const set = new Set<string>();
    for (const id of Object.keys(userFamilies)) {
      for (const w of getUserFamilyWords(id)) {
        if (w._from?.textbook === entry.textbook && w._from?.familyId === entry.id) {
          set.add(w.word);
        }
      }
    }
    return set;
  }, [userFamilies, entry, getUserFamilyWords]);

  const groups = useMemo((): Map<string, WordEntry[]> => {
    if (!family || !effectiveRoots) return new Map<string, WordEntry[]>();
    const visible = family.words.filter((w) => !movedWords.has(w.word));
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

  const handleSearchOpen = useCallback((hit: IndexedWord) => {
    setSearchQuery('');
    setShowSearch(false);
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
  }, [catalogMap, entry, variantTabs, groups, activePanel, onSearchOpen]);

  const showVariantNav = variantTabs.length > 1;

  useEffect(() => {
    if (!family || variantTabs.length === 0) return;

    const pickPanelForWord = (word: string) => {
      const hit = variantTabs.find((tab) =>
        groups.get(tab.root)?.some((w) => w.word === word),
      );
      return hit?.root ?? variantTabs[0].root;
    };

    if (panelInitForFamily.current !== family.id) {
      panelInitForFamily.current = family.id;
      lastFocusWord.current = focusWord;
      setActivePanel(focusWord ? pickPanelForWord(focusWord) : variantTabs[0].root);
      return;
    }

    if (focusWord && focusWord !== lastFocusWord.current) {
      lastFocusWord.current = focusWord;
      setActivePanel(pickPanelForWord(focusWord));
    }
  }, [family?.id, focusWord, variantTabs, groups]);

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
      entry.textbook === 'user' ? undefined : { textbook: entry.textbook, familyId: family.id },
    );
    // 在「我的词根」页内挂载到其他词根时，同时从当前族移除（保持一词一归）
    if (entry.textbook === 'user') {
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

  const batchCreateAndMove = (roots: string[]) => {
    if (!roots.length) return;
    const id = roots[0];
    if (!userFamilies[id]) {
      createUserFamily({ id, roots, meaningZh: '', meaningEn: '' });
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

  const renderWordCards = (words: WordEntry[], panelKey: string) => (
    <div className="word-list">
      {words.map((w, index) => (
        <WordCard
          key={`${panelKey}-${w.word}-${index}${focusedWord === w.word ? '-focus' : ''}`}
          {...wordCardPropsFor(w, index)}
          defaultCollapsed={focusedWord !== w.word}
          highlighted={focusedWord === w.word}
          batchMode={batchMode}
          selected={batchSelected.has(w.word)}
          onToggleSelect={toggleBatchSelect}
        />
      ))}
    </div>
  );

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
            <span>词根族数据加载失败（/data/{entry.textbook}/{entry.file}）</span>
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
            />
            {showSearch && searchQuery.trim() && searchHits.length > 0 && (
              <div className="detail-search-panel">
                {searchHits.map((hit) => {
                  const hitEntry = catalogMap.get(`${hit.textbook}:${hit.familyId}`);
                  const sameFamily = hit.textbook === entry.textbook && hit.familyId === entry.id;
                  return (
                    <button
                      key={`${hit.textbook}-${hit.familyId}-${hit.word}`}
                      type="button"
                      className="detail-search-hit"
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
          <button type="button" className="note-topbar-affix-btn" onClick={() => setAffixOverlayOpen(true)}>
            词根词缀库
          </button>
          <div className="note-topbar-meta">
            <span className="badge muted-badge">{family.words.length} 词</span>
            {editingVideo ? (
              <input
                className="video-id-input"
                autoFocus
                placeholder="如 1-03"
                defaultValue={videoId}
                onBlur={(e) => {
                  setVideoId(fKey, e.target.value);
                  setEditingVideo(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  if (e.key === 'Escape') setEditingVideo(false);
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
        </div>
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
              <VariantMap roots={effectiveRoots ?? []} />

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

              <MiniRelationGraph
                title={(effectiveRoots ?? []).join(' · ')}
                roots={effectiveRoots ?? []}
                words={family.words}
                onOpenWord={setReviewWord}
                statusFor={(w) => getStatus(wordKey(entry.textbook, family.id, w))}
              />

              {!showVariantNav && followMeaning && (
                <DraggableFollowBar
                  followRoots={followRoots}
                  followMeaning={followMeaning}
                  hidden={showSearch && Boolean(searchQuery.trim())}
                />
              )}

              {!showVariantNav && [...groups.entries()].map(([root, words]) => (
                <section key={root} className="root-group">
                  <h2 className="root-group-title">{root}</h2>
                  {renderWordCards(words, root)}
                </section>
              ))}
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
