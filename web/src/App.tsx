import { useCallback, useEffect, useState } from 'react';
import type { CatalogEntry } from './types';
import { useNotes } from './hooks/useNotes';
import { useAffixLibrary } from './hooks/useAffixLibrary';
import { HomePage } from './components/HomePage';
import { FamilyNotePage } from './components/FamilyNotePage';
import { AffixLibraryPage } from './components/AffixLibraryPage';
import {
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

  const { getFamilyNote, setFamilyNote, getWordNote, setWordNote, getWordMnemonic, setWordMnemonic, getWordCollocations, setWordCollocations, getWordAffixNotes, setWordAffixNote } = useNotes();
  const affixLibrary = useAffixLibrary();

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
        getWordNote={getWordNote}
        setWordNote={setWordNote}
        getWordMnemonic={getWordMnemonic}
        setWordMnemonic={setWordMnemonic}
        getWordCollocations={getWordCollocations}
        setWordCollocations={setWordCollocations}
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
    />
  );
}

export default App;
