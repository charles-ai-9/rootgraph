import { useCallback, useEffect, useState } from 'react';
import { emptyAffixNote, emptyWordAffixNotes, type AffixNoteData, type WordAffixNotes } from '../types';
import { affixFormForSearch, parseVariantLines } from '../utils/affixNote';

interface NotesStore {
  families: Record<string, string>;
  words: Record<string, string>;
  affixNotes: Record<string, WordAffixNotes>;
}

const STORAGE_KEY = 'rootgraph-notes-v2';
const LEGACY_KEY = 'rootgraph-notes-v1';

const empty: NotesStore = { families: {}, words: {}, affixNotes: {} };

function normalizeAffixNote(raw: unknown): AffixNoteData {
  if (!raw || typeof raw !== 'object') return emptyAffixNote();
  const o = raw as Partial<AffixNoteData> & { affixes?: string };
  return {
    current: o.current ?? o.affixes ?? '',
    variants: o.variants ?? '',
    knowledge: o.knowledge ?? '',
    evolution: o.evolution ?? '',
    libraryRef: o.libraryRef,
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
      };
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as Partial<NotesStore>;
      return {
        families: parsed.families ?? {},
        words: parsed.words ?? {},
        affixNotes: {},
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  }, [store]);

  const getFamilyNote = useCallback((key: string) => store.families[key] ?? '', [store]);

  const setFamilyNote = useCallback((key: string, text: string) => {
    setStore((prev) => ({
      ...prev,
      families: { ...prev.families, [key]: text },
    }));
  }, []);

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

  return {
    getFamilyNote,
    setFamilyNote,
    getWordNote,
    setWordNote,
    getWordAffixNotes,
    setWordAffixNote,
  };
}
