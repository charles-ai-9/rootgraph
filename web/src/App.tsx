import { useCallback, useEffect, useState } from 'react';
import type { CatalogEntry } from './types';
import { useNotes } from './hooks/useNotes';
import { useAffixLibrary } from './hooks/useAffixLibrary';
import { HomePage } from './components/HomePage';
import { FamilyNotePage } from './components/FamilyNotePage';
import { AffixLibraryPage } from './components/AffixLibraryPage';
import {
  loadCatalog,
  parseRouteHash,
  resolveRoute,
  routeHashFromView,
  type AppView,
} from './appRoute';
import './App.css';

function App() {
  const [view, setView] = useState<AppView>({ kind: 'home' });
  const [booting, setBooting] = useState(() => {
    const route = parseRouteHash(window.location.hash);
    return route.kind === 'family' || route.kind === 'affix-library';
  });

  const applyView = useCallback((next: AppView) => {
    setView(next);
    const hash = routeHashFromView(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const route = parseRouteHash(window.location.hash);
    if (route.kind === 'home') {
      setBooting(false);
      return;
    }

    resolveRoute(route)
      .then((resolved) => {
        if (!cancelled) setView(resolved);
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setBooting(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      const route = parseRouteHash(window.location.hash);
      if (route.kind === 'home') {
        setView({ kind: 'home' });
        return;
      }
      if (route.kind === 'affix-library') {
        setView({ kind: 'affix-library' });
        return;
      }
      resolveRoute(route).then(setView).catch(console.error);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const { getFamilyNote, setFamilyNote, getVideoId, setVideoId, getFamilyMeta, setFamilyMeta, getWordNote, setWordNote, getWordMnemonic, setWordMnemonic, getWordCollocations, setWordCollocations, getWordExamples, setWordExamples, getWordAffixNotes, setWordAffixNote, migrateKeys } = useNotes();
  const affixLibrary = useAffixLibrary();

  // 数据重导导致 familyId 变化时，迁移 localStorage 中旧 key 的笔记
  useEffect(() => {
    loadCatalog()
      .then((catalog) => {
        const renames: Record<string, string> = {};
        for (const e of catalog) {
          if (e.legacyId && e.legacyId !== e.id) {
            renames[`${e.textbook}/${e.legacyId}`] = `${e.textbook}/${e.id}`;
          }
        }
        if (Object.keys(renames).length > 0) migrateKeys(renames);
      })
      .catch(console.error);
  }, [migrateKeys]);

  if (booting) {
    return (
      <div className="page-loading">
        <p>加载中…</p>
      </div>
    );
  }

  if (view.kind === 'affix-library') {
    return (
      <AffixLibraryPage
        items={affixLibrary.items}
        onBack={() => applyView({ kind: 'home' })}
        onSaveGroup={affixLibrary.saveGroup}
      />
    );
  }

  if (view.kind === 'family') {
    return (
      <FamilyNotePage
        entry={view.entry}
        focusWord={view.focusWord}
        getFamilyNote={getFamilyNote}
        setFamilyNote={setFamilyNote}
        getVideoId={getVideoId}
        setVideoId={setVideoId}
        getFamilyMeta={getFamilyMeta}
        setFamilyMeta={setFamilyMeta}
        getWordNote={getWordNote}
        setWordNote={setWordNote}
        getWordMnemonic={getWordMnemonic}
        setWordMnemonic={setWordMnemonic}
        getWordCollocations={getWordCollocations}
        setWordCollocations={setWordCollocations}
        getWordExamples={getWordExamples}
        setWordExamples={setWordExamples}
        getWordAffixNotes={getWordAffixNotes}
        setWordAffixNote={setWordAffixNote}
        items={affixLibrary.items}
        getItem={affixLibrary.getItem}
        onSaveToLibrary={affixLibrary.upsertItemFromNote}
        onSaveGroup={affixLibrary.saveGroup}
        onSearchOpen={(e: CatalogEntry, word?: string) => applyView({ kind: 'family', entry: e, focusWord: word })}
        onBack={() => applyView({ kind: 'home' })}
      />
    );
  }

  return (
    <HomePage
      onOpenFamily={(entry, word) => applyView({ kind: 'family', entry, focusWord: word })}
      affixItems={affixLibrary.items}
      onSaveAffixGroup={affixLibrary.saveGroup}
      getVideoId={getVideoId}
      getFamilyMeta={getFamilyMeta}
    />
  );
}

export default App;
