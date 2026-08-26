import { useCallback, useEffect, useState } from 'react';
import type { ProgressState, WordStatus } from '../types';
import { safeSetItem } from '../utils/storage';

const STORAGE_KEY = 'rootgraph-progress-v1';
const LAST_GOOD_KEY = 'rootgraph-progress-last-good';

function loadProgress(): ProgressState {
  const attempt = (raw: string | null): ProgressState | null => {
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ProgressState;
    } catch {
      return null;
    }
  };
  return attempt(localStorage.getItem(STORAGE_KEY))
    ?? attempt(localStorage.getItem(LAST_GOOD_KEY))
    ?? {};
}

export function useProgress() {
  const [progress, setProgress] = useState<ProgressState>(loadProgress);

  // 保存时与 localStorage 合并（其他标签页的进度保留，本页最新优先）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cur = raw ? JSON.parse(raw) : {};
      const json = JSON.stringify({ ...cur, ...progress });
      safeSetItem(STORAGE_KEY, json);
      safeSetItem(LAST_GOOD_KEY, json);
    } catch {
      const json = JSON.stringify(progress);
      safeSetItem(STORAGE_KEY, json);
      safeSetItem(LAST_GOOD_KEY, json);
    }
  }, [progress]);

  // 跨标签页同步：其他标签页更新进度时刷新
  useEffect(() => {
    const onStorage = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        setProgress(raw ? (JSON.parse(raw) as ProgressState) : {});
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

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
