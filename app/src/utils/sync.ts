/**
 * RootGraph 前端同步模块
 * 整块 JSON + last-write-wins + 静态 token 认证
 */

// 同步 API 挂载在同域 Pages Functions 下（rootgraph.pages.dev/api/db/sync），
// 后端存储从 KV 迁移到 D1 (SQLite)，支持 SQL 查询排查
const SYNC_URL = '/api/db/sync';
const SYNC_TOKEN = 'rg_sync_2026_k8m3p7q2x9w4';
const DEVICE_KEY = 'rootgraph-device-id';

let uploadTimer: ReturnType<typeof setTimeout> | null = null;
let pending: (() => object) | null = null;

/** 生成/读取稳定的设备标识（云端版本历史可追踪哪个设备写入） */
export function getDeviceId(): string {
  let id = '';
  try {
    id = localStorage.getItem(DEVICE_KEY) ?? '';
  } catch {
    /* ignore */
  }
  if (!id) {
    id = `dev-${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
    try {
      localStorage.setItem(DEVICE_KEY, id);
    } catch {
      /* ignore */
    }
  }
  return id;
}

/**
 * 防抖上传：写入后 debounce 500ms，将整块数据 PUT 到远端（近实时云端备份）
 */
export function scheduleUpload(getData: () => object): void {
  pending = getData;
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(async () => {
    uploadTimer = null;
    const fn = pending;
    pending = null;
    if (!fn) return;
    try {
      const data = { ...fn(), deviceId: getDeviceId() };
      await fetch(SYNC_URL, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SYNC_TOKEN}`,
        },
        body: JSON.stringify(data),
      });
    } catch {
      // 静默失败：离线/网络异常不影响本地使用
    }
  }, 500);
}

/**
 * 页面关闭/刷新前立即上传（sendBeacon 在卸载时可靠送达，避免"保存了但没上传"）
 */
export function flushUpload(data: object): void {
  try {
    const payload = { ...data, deviceId: getDeviceId() };
    navigator.sendBeacon(SYNC_URL, new Blob([JSON.stringify(payload)], { type: 'application/json' }));
  } catch {
    /* ignore */
  }
}

/**
 * 启动时下载远端数据，返回完整的 NotesStore（含 updatedAt）
 * 失败返回 null
 */
export async function downloadRemote(): Promise<object | null> {
  try {
    const res = await fetch(SYNC_URL, {
      cache: 'no-store',
      headers: { Authorization: `Bearer ${SYNC_TOKEN}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Worker 返回格式：{ updatedAt, families, words, ... } 或 { updatedAt: 0, data: null }
    if (data.updatedAt === 0 || !data.families) return null;
    return data;
  } catch {
    return null;
  }
}
