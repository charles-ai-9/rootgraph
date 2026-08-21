import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AffixItem, AffixKind, AffixNoteData, CatalogEntry, RootFamily, WordAffixKind, WordEntry, WordAffixNotes } from '../types';
import { cleanRoots, displaySemantic, displayRoots, normalizeRootForm, wordKey } from '../types';
import { familyStorageKey, textbookLabel } from '../catalog';
import { familySummary, groupWordsByRoot } from '../utils/family';
import type { FamilyMeta } from '../hooks/useNotes';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { loadWordIndex, searchWords, type IndexedWord } from '../hooks/useWordIndex';
import { useProgress } from '../hooks/useProgress';
import { FamilyVariantNav, OVERVIEW_PANEL, VariantStepper, type VariantTab } from './FamilyVariantNav';
import { MiniRelationGraph } from './MiniRelationGraph';
import { NoteEditor } from './NoteEditor';
import { VariantMap } from './VariantMap';
import { WordCard, type WordCardProps } from './WordCard';
import { WordCardModal } from './WordCardModal';
import { AffixLibraryOverlay } from './AffixLibraryOverlay';

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
  getWordAffixNotes: (key: string) => WordAffixNotes;
  setWordAffixNote: (key: string, kind: WordAffixKind, note: AffixNoteData) => void;
  items: AffixItem[];
  getItem: (id: string) => AffixItem | undefined;
  onSaveToLibrary: (kind: WordAffixKind, note: AffixNoteData) => AffixItem;
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onSearchOpen: (entry: CatalogEntry, focusWord?: string) => void;
  onBack: () => void;
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
  getWordAffixNotes,
  setWordAffixNote,
  items,
  getItem,
  onSaveToLibrary,
  onSaveGroup,
  onSearchOpen,
  onBack,
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
  const [editingVideo, setEditingVideo] = useState(false);
  const [metaEditOpen, setMetaEditOpen] = useState(false);
  const [metaRootsText, setMetaRootsText] = useState('');
  const [metaSemanticText, setMetaSemanticText] = useState('');
  const { getStatus, setStatus, statsForKeys } = useProgress();
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const fKey = familyStorageKey(entry.textbook, entry.id);

  useEffect(() => {
    setFamilyError(false);
    fetch(`/data/${entry.textbook}/${entry.file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setFamily)
      .catch(() => setFamilyError(true));
  }, [entry, retryTick]);

  useEffect(() => {
    loadWordIndex().then(setWordIndex);
    fetch('/data/catalog.json').then((r) => r.json()).then(setCatalog).catch(console.error);
  }, []);

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

  const groups = useMemo((): Map<string, WordEntry[]> => {
    if (!family || !effectiveRoots) return new Map<string, WordEntry[]>();
    return groupWordsByRoot(family.words, effectiveRoots);
  }, [family, effectiveRoots]);

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
    window.requestAnimationFrame(() => {
      const el =
        document.getElementById(`word-${focusedWord}`)
        ?? document.querySelector(`[id^="word-${CSS.escape(focusedWord)}-"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [family, focusedWord, activePanel]);

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
      affixNotes: getWordAffixNotes(wKey),
      items,
      getItem,
      onSaveToLibrary,
      onSaveGroup,
      onOpenAffixLibrary: () => setAffixOverlayOpen(true),
      onNote: (text) => setWordNote(wKey, text),
      onMnemonicNote: (text) => setWordMnemonic(wKey, text),
      onCollocationsNote: (text) => setWordCollocations(wKey, text),
      onAffixNote: (kind, note) => setWordAffixNote(wKey, kind, note),
    };
  };

  const renderWordCards = (words: WordEntry[], panelKey: string) => (
    <div className="word-list">
      {words.map((w, index) => (
        <WordCard
          key={`${panelKey}-${w.word}-${index}`}
          {...wordCardPropsFor(w, index)}
          defaultCollapsed={focusedWord !== w.word}
          highlighted={focusedWord === w.word}
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
          <p>加载中…</p>
        )}
      </div>
    );
  }

  const semantic = familyMeta?.semantic?.trim() || displaySemantic(entry);
  const summary = familySummary(family, entry, {
    roots: effectiveRoots,
    semantic,
  });
  const familyNote = getFamilyNote(fKey);
  const videoId = getVideoId(fKey);
  const activeWords = activePanel !== OVERVIEW_PANEL ? groups.get(activePanel) ?? [] : [];
  const familyStats = statsForKeys(family.words.map((w) => wordKey(entry.textbook, family.id, w.word)));

  const openMetaEditor = () => {
    setMetaRootsText((effectiveRoots ?? []).join('，'));
    setMetaSemanticText(familyMeta?.semantic ?? displaySemantic(entry) ?? '');
    setMetaEditOpen(true);
  };

  return (
    <div className="note-page">
      <header className="note-topbar">
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
          <button type="button" className="note-topbar-affix-btn" onClick={() => setAffixOverlayOpen(true)}>
            词根词缀库
          </button>
          <div className="note-topbar-meta">
            <span className="badge">{textbookLabel(entry.textbook)}</span>
            <span className="badge muted-badge">第{entry.chapter}章</span>
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
              <label htmlFor="meta-roots">词根变体（逗号分隔，保留教材写法如 (s)pend）</label>
              <input
                id="meta-roots"
                className="family-meta-input"
                value={metaRootsText}
                onChange={(e) => setMetaRootsText(e.target.value)}
                placeholder="pens，(s)pend，(s)pon"
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
                  const roots = metaRootsText.split(/[，,、]/).map((s) => s.trim()).filter(Boolean);
                  const meta: FamilyMeta = {};
                  if (roots.length) meta.roots = roots;
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
              <section className="doc-section summary-section">
                <h2>词根族摘要</h2>
                <pre className="summary-pre">{summary}</pre>
              </section>

              <VariantMap roots={effectiveRoots ?? []} />

              <section className="doc-section">
                <h2>我的词根理解</h2>
                <NoteEditor
                  value={familyNote}
                  placeholder="点击这里写下你对整个词根族的理解（支持 **粗体** *斜体* - 列表）"
                  onChange={(text) => setFamilyNote(fKey, text)}
                  minRows={4}
                />
              </section>

              <MiniRelationGraph
                title={(effectiveRoots ?? []).join(' · ')}
                roots={effectiveRoots ?? []}
                words={family.words}
                onOpenWord={setReviewWord}
                statusFor={(w) => getStatus(wordKey(entry.textbook, family.id, w))}
              />

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
