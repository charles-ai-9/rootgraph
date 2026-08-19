import { useEffect, useMemo, useState } from 'react';
import type { AffixItem, AffixNoteData, CatalogEntry, RootFamily, WordAffixKind, WordEntry, WordAffixNotes } from '../types';
import { cleanRoots, displaySemantic, displayRoots, wordKey } from '../types';
import { familyStorageKey, textbookLabel } from '../catalog';
import { familySummary, groupWordsByRoot } from '../utils/family';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { FamilyVariantNav, OVERVIEW_PANEL, VariantStepper, type VariantTab } from './FamilyVariantNav';
import { MiniRelationGraph } from './MiniRelationGraph';
import { NoteEditor } from './NoteEditor';
import { VariantMap } from './VariantMap';
import { WordCard } from './WordCard';

interface FamilyNotePageProps {
  entry: CatalogEntry;
  focusWord?: string;
  getFamilyNote: (key: string) => string;
  setFamilyNote: (key: string, text: string) => void;
  getWordNote: (key: string) => string;
  setWordNote: (key: string, text: string) => void;
  getWordAffixNotes: (key: string) => WordAffixNotes;
  setWordAffixNote: (key: string, kind: WordAffixKind, note: AffixNoteData) => void;
  items: AffixItem[];
  getItem: (id: string) => AffixItem | undefined;
  onSaveToLibrary: (kind: WordAffixKind, note: AffixNoteData) => AffixItem;
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onOpenAffixLibrary: () => void;
  onBack: () => void;
}

export function FamilyNotePage({
  entry,
  focusWord,
  getFamilyNote,
  setFamilyNote,
  getWordNote,
  setWordNote,
  getWordAffixNotes,
  setWordAffixNote,
  items,
  getItem,
  onSaveToLibrary,
  onSaveGroup,
  onOpenAffixLibrary,
  onBack,
}: FamilyNotePageProps) {
  const [family, setFamily] = useState<RootFamily | null>(null);
  const [activePanel, setActivePanel] = useState<string>(OVERVIEW_PANEL);

  const fKey = familyStorageKey(entry.textbook, entry.id);

  useEffect(() => {
    fetch(`/data/${entry.textbook}/${entry.file}`)
      .then((r) => r.json())
      .then(setFamily)
      .catch(console.error);
  }, [entry]);

  const groups = useMemo((): Map<string, WordEntry[]> => {
    if (!family) return new Map<string, WordEntry[]>();
    return groupWordsByRoot(family.words, family.roots);
  }, [family]);

  const variantTabs = useMemo((): VariantTab[] => {
    if (!family) return [];
    return cleanRoots(family.roots)
      .filter((root) => {
        const list = groups.get(root);
        return list && list.length > 0;
      })
      .map((root) => ({ root, count: groups.get(root)!.length }));
  }, [family, groups]);

  const showVariantNav = variantTabs.length > 1;

  useEffect(() => {
    if (!family || variantTabs.length === 0) return;
    if (focusWord) {
      const hit = variantTabs.find((tab) =>
        groups.get(tab.root)?.some((w) => w.word === focusWord),
      );
      setActivePanel(hit?.root ?? variantTabs[0].root);
      return;
    }
    setActivePanel(variantTabs[0].root);
  }, [family?.id, focusWord, variantTabs, groups]);

  useEffect(() => {
    if (!family || !focusWord) return;
    window.requestAnimationFrame(() => {
      document.getElementById(`word-${focusWord}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [family, focusWord, activePanel]);

  const handlePanelChange = (panel: string) => {
    setActivePanel(panel);
    window.requestAnimationFrame(() => {
      document.querySelector('.family-variant-content')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const renderWordCards = (words: WordEntry[]) => (
    <div className="word-list">
      {words.map((w) => {
        const wKey = wordKey(entry.textbook, family!.id, w.word);
        return (
          <WordCard
            key={w.word}
            word={w}
            familyRoots={family!.roots}
            textbook={entry.textbook}
            familyId={family!.id}
            defaultCollapsed={focusWord === w.word}
            defaultShowExtra={focusWord === w.word}
            personalNote={getWordNote(wKey)}
            affixNotes={getWordAffixNotes(wKey)}
            items={items}
            getItem={getItem}
            onSaveToLibrary={onSaveToLibrary}
            onSaveGroup={onSaveGroup}
            onOpenAffixLibrary={onOpenAffixLibrary}
            onNote={(text) => setWordNote(wKey, text)}
            onAffixNote={(kind, note) => setWordAffixNote(wKey, kind, note)}
          />
        );
      })}
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
        <p>加载中…</p>
      </div>
    );
  }

  const summary = familySummary(family, entry);
  const familyNote = getFamilyNote(fKey);
  const semantic = displaySemantic(entry);
  const activeWords = activePanel !== OVERVIEW_PANEL ? groups.get(activePanel) ?? [] : [];

  return (
    <div className="note-page">
      <header className="note-topbar">
        <div className="note-topbar-inner">
          <button type="button" className="back-link" onClick={onBack}>
            ← 返回知识库
          </button>
          <div className="note-topbar-meta">
            <span className="badge">{textbookLabel(entry.textbook)}</span>
            <span className="badge muted-badge">第{entry.chapter}章</span>
            <span className="badge muted-badge">{family.words.length} 词</span>
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
          {semantic && <p className="doc-subtitle doc-roots-line">{displayRoots(entry)}</p>}
        </header>

        <div className="family-variant-content">
          {(!showVariantNav || activePanel === OVERVIEW_PANEL) && (
            <>
              <section className="doc-section summary-section">
                <h2>词根族摘要</h2>
                <pre className="summary-pre">{summary}</pre>
              </section>

              <VariantMap roots={family.roots} />

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
                title={displayRoots(entry)}
                roots={family.roots}
                words={family.words}
              />

              {!showVariantNav && [...groups.entries()].map(([root, words]) => (
                <section key={root} className="root-group">
                  <h2 className="root-group-title">{root}</h2>
                  {renderWordCards(words)}
                </section>
              ))}
            </>
          )}

          {showVariantNav && activePanel !== OVERVIEW_PANEL && (
            <section className="root-group root-group-panel">
              <header className="variant-panel-head">
                <div>
                  <h2 className="variant-panel-title">{activePanel}</h2>
                  <p className="variant-panel-hint">词根变体 · {semantic ?? displayRoots(entry)}</p>
                </div>
                <span className="variant-panel-meta">{activeWords.length} 词</span>
              </header>
              {renderWordCards(activeWords)}
              <VariantStepper
                tabs={variantTabs}
                active={activePanel}
                onChange={handlePanelChange}
              />
            </section>
          )}
        </div>
      </article>
    </div>
  );
}
