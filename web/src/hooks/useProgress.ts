import { useCallback, useEffect, useState } from 'react';
import type { ProgressState, WordStatus } from '../types';
import { safeSetItem } from '../utils/storage';

const STORAGE_KEY = 'rootgraph-progress-v1';

export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? (JSON.parse(raw) as ProgressState) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    safeSetItem(STORAGE_KEY, JSON.stringify(progress));
  }, [progress]);

  const getStatus = useCallback(
    (key: string): WordStatus => progress[key] ?? 'new',
    [progress],
  );

  const setStatus = useCallback((key: string, status: WordStatus) => {
    setProgress((prev) => ({ ...prev, [key]: status }));
  }, []);

  const statsForKeys = useCallback(
    (keys: string[]) => {
      let understood = 0;
      let review = 0;
      for (const key of keys) {
        const s = progress[key] ?? 'new';
        if (s === 'understood') understood += 1;
        if (s === 'review') review += 1;
      }
      return { understood, review, total: keys.length };
    },
    [progress],
  );

  return { progress, getStatus, setStatus, statsForKeys };
}
