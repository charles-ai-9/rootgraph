import { useState } from 'react';
import type { CatalogEntry } from './types';
import { useNotes } from './hooks/useNotes';
import { useAffixLibrary } from './hooks/useAffixLibrary';
import { HomePage } from './components/HomePage';
import { FamilyNotePage } from './components/FamilyNotePage';
import { AffixLibraryPage } from './components/AffixLibraryPage';
import './App.css';

type AppView =
  | { kind: 'home' }
  | { kind: 'family'; entry: CatalogEntry; focusWord?: string }
  | { kind: 'affix-library' };

function App() {
  const [view, setView] = useState<AppView>({ kind: 'home' });
  const { getFamilyNote, setFamilyNote, getWordNote, setWordNote, getWordAffixNotes, setWordAffixNote } = useNotes();
  const affixLibrary = useAffixLibrary();

  if (view.kind === 'affix-library') {
    return (
      <AffixLibraryPage
        items={affixLibrary.items}
        onBack={() => setView({ kind: 'home' })}
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
        getWordAffixNotes={getWordAffixNotes}
        setWordAffixNote={setWordAffixNote}
        items={affixLibrary.items}
        getItem={affixLibrary.getItem}
        onSaveToLibrary={affixLibrary.upsertItemFromNote}
        onSaveGroup={affixLibrary.saveGroup}
        onOpenAffixLibrary={() => setView({ kind: 'affix-library' })}
        onBack={() => setView({ kind: 'home' })}
      />
    );
  }

  return (
    <HomePage
      onOpenFamily={(entry, word) => setView({ kind: 'family', entry, focusWord: word })}
      onOpenAffixLibrary={() => setView({ kind: 'affix-library' })}
    />
  );
}

export default App;
