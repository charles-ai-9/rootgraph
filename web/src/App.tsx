import { useCallback, useEffect, useState } from 'react';
import type { CatalogEntry } from './types';
import { useNotes } from './hooks/useNotes';
import { useAffixLibrary } from './hooks/useAffixLibrary';
import { useWordbook } from './hooks/useWordbook';
import { HomePage } from './components/HomePage';
import { FamilyNotePage } from './components/FamilyNotePage';
import { AffixLibraryPage } from './components/AffixLibraryPage';
import { WordbookPage } from './components/WordbookPage';
import { PasswordGate } from './components/PasswordGate';
import { isUnlocked } from './utils/unlock';
import {
  loadCatalog,
  parseRouteHash,
  resolveRoute,
  routeHashFromView,
  type AppView,
} from './appRoute';
import './App.css';

function App() {
  // 密码锁：未解锁的设备先展示锁屏，正确密码后永久解锁（见 utils/unlock.ts）
  const [unlocked, setUnlocked] = useState(isUnlocked);
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

  const { getFamilyNote, setFamilyNote, getVideoId, setVideoId, getFamilyMeta, setFamilyMeta, getUserFamilies, createUserFamily, updateUserFamily, removeUserFamily, removeWordFromUserFamily, moveWordsToUserFamily, addWordToUserFamily, getUserFamilyWords, getFamilyOrder, setFamilyOrder, getWordNote, setWordNote, getWordMnemonic, setWordMnemonic, getWordCollocations, setWordCollocations, getWordExamples, setWordExamples, getWordEtymology, setWordEtymology, getWordAffixNotes, setWordAffixNote, migrateKeys } = useNotes();
  const affixLibrary = useAffixLibrary();
  const wordbook = useWordbook();

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

  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [offline, setOffline] = useState(false);

  // Service Worker 新版本检测（App 感：发现新版本提示刷新）
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          newWorker?.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      })
      .catch(console.error);
  }, []);

  // 离线状态提示
  useEffect(() => {
    const onOffline = () => setOffline(true);
    const onOnline = () => setOffline(false);
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  if (booting) {
    return (
      <div className="page-loading">
        <p>加载中…</p>
      </div>
    );
  }

  let page: React.ReactNode;
  if (view.kind === 'affix-library') {
    page = (
      <div key="affix-library" className="page-enter">
        <AffixLibraryPage
          items={affixLibrary.items}
          onBack={() => applyView({ kind: 'home' })}
          onSaveGroup={affixLibrary.saveGroup}
        />
      </div>
    );
  } else if (view.kind === 'wordbook') {
    page = (
      <div key="wordbook" className="page-enter">
        <WordbookPage
          entries={wordbook.entries}
          onRemove={wordbook.removeWord}
          onReorder={wordbook.reorder}
          onBack={() => applyView({ kind: 'home' })}
        />
      </div>
    );
  } else if (view.kind === 'family') {
    page = (
      <div key={`family-${view.entry.textbook}-${view.entry.id}`} className="page-enter">
        <FamilyNotePage
          entry={view.entry}
          focusWord={view.focusWord}
          getFamilyNote={getFamilyNote}
          setFamilyNote={setFamilyNote}
          getVideoId={getVideoId}
          setVideoId={setVideoId}
          getFamilyMeta={getFamilyMeta}
          setFamilyMeta={setFamilyMeta}
          userFamilies={getUserFamilies()}
          createUserFamily={createUserFamily}
          moveWordsToUserFamily={moveWordsToUserFamily}
          addWordToUserFamily={addWordToUserFamily}
          removeWordFromUserFamily={removeWordFromUserFamily}
          getUserFamilyWords={getUserFamilyWords}
          getWordNote={getWordNote}
          setWordNote={setWordNote}
          getWordMnemonic={getWordMnemonic}
          setWordMnemonic={setWordMnemonic}
          getWordCollocations={getWordCollocations}
          setWordCollocations={setWordCollocations}
          getWordExamples={getWordExamples}
          setWordExamples={setWordExamples}
          getWordEtymology={getWordEtymology}
          setWordEtymology={setWordEtymology}
          getWordAffixNotes={getWordAffixNotes}
          setWordAffixNote={setWordAffixNote}
          items={affixLibrary.items}
          getItem={affixLibrary.getItem}
          onSaveToLibrary={affixLibrary.upsertItemFromNote}
          onSaveGroup={affixLibrary.saveGroup}
          onSearchOpen={(e: CatalogEntry, word?: string) => applyView({ kind: 'family', entry: e, focusWord: word })}
          onBack={() => applyView({ kind: 'home' })}
        />
      </div>
    );
  } else {
    page = (
      <div key="home" className="page-enter">
        <HomePage
          onOpenFamily={(entry, word) => applyView({ kind: 'family', entry, focusWord: word })}
          onOpenWordbook={() => applyView({ kind: 'wordbook' })}
          affixItems={affixLibrary.items}
          onSaveAffixGroup={affixLibrary.saveGroup}
          getVideoId={getVideoId}
          getFamilyMeta={getFamilyMeta}
          userFamilies={getUserFamilies()}
          createUserFamily={createUserFamily}
          updateUserFamily={updateUserFamily}
          removeUserFamily={removeUserFamily}
          getUserFamilyWords={getUserFamilyWords}
          familyOrder={getFamilyOrder()}
          setFamilyOrder={setFamilyOrder}
          wordbookCount={wordbook.entries.length}
          onAddToWordbook={wordbook.addWord}
          hasInWordbook={wordbook.hasWord}
        />
      </div>
    );
  }

  if (!unlocked) {
    return <PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  return (
    <>
      {page}
      {updateAvailable && (
        <div className="app-toast">
          <span>发现新版本</span>
          <button type="button" onClick={() => window.location.reload()}>立即刷新</button>
        </div>
      )}
      {offline && (
        <div className="app-toast">
          <span>已离线，当前为缓存数据</span>
        </div>
      )}
    </>
  );
}

export default App;
