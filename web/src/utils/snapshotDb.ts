/** 本地快照 IndexedDB 存储：容量远大于 localStorage（~几百 MB），不占用 localStorage 配额。
 *  用于保存定期数据快照（保留最近 30 份），主数据损坏时恢复。 */

const DB_NAME = 'rootgraph-snapshots';
const STORE = 'snapshots';
const MAX_SNAPSHOTS = 30;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) {
          req.result.createObjectStore(STORE, { keyPath: 'ts' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    } catch (e) {
      reject(e);
    }
  });
}

/** 保存一份快照（异步，失败静默）；超量清理最旧的 */
export function saveSnapshot(data: unknown): void {
  openDb()
    .then((db) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.put({ ts: Date.now(), data });
      const getAll = store.getAll();
      getAll.onsuccess = () => {
        const all = (getAll.result as { ts: number }[]).sort((a, b) => b.ts - a.ts);
        for (const item of all.slice(MAX_SNAPSHOTS)) {
          store.delete(item.ts);
        }
      };
      tx.oncomplete = () => db.close();
    })
    .catch(() => {
      /* 隐私模式/不可用时静默降级 */
    });
}

/** 读取最近一份快照（无则 null） */
export function loadLatestSnapshot(): Promise<unknown | null> {
  return new Promise((resolve) => {
    openDb()
      .then((db) => {
        const tx = db.transaction(STORE, 'readonly');
        const getAll = tx.objectStore(STORE).getAll();
        getAll.onerror = () => resolve(null);
        getAll.onsuccess = () => {
          const all = (getAll.result as { ts: number; data: unknown }[]).sort(
            (a, b) => b.ts - a.ts,
          );
          db.close();
          resolve(all[0]?.data ?? null);
        };
      })
      .catch(() => resolve(null));
  });
}
