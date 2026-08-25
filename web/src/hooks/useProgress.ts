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

  // 保存时与 localStorage 合并（其他标签页的进度保留，本页最新优先）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const cur = raw ? JSON.parse(raw) : {};
      safeSetItem(STORAGE_KEY, JSON.stringify({ ...cur, ...progress }));
    } catch {
      safeSetItem(STORAGE_KEY, JSON.stringify(progress));
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
