/**
 * RootGraph 前端数据模块 — 服务端权威模型
 *
 * 架构：D1 是唯一数据源，localStorage 仅作缓存。
 * - 加载：downloadRemote() → 服务器数据覆盖本地
 * - 保存：saveToServer() → 直接 PUT 到 D1
 * - 无 debounce、无 merge、无竞态
 */

const SYNC_URL = '/api/db/sync';
const SYNC_TOKEN = 'rg_sync_2026_k8m3p7q2x9w4';
const DEVICE_KEY = 'rootgraph-device-id';

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
 * 保存数据到服务器（直接 PUT，无 debounce）。
 * fire-and-forget：失败仅 warn，不阻塞用户操作。
 */
export async function saveToServer(data: object): Promise<void> {
  try {
    const payload = { ...(data as Record<string, unknown>), deviceId: getDeviceId(), updatedAt: Date.now() };
    const res = await fetch(SYNC_URL, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SYNC_TOKEN}`,
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) console.warn('[sync] PUT failed:', res.status);
  } catch (e) {
    console.warn('[sync] PUT error:', e);
  }
}

/**
 * 启动时从服务器下载数据，返回完整的 NotesStore（含 updatedAt）。
 * 失败返回 null。
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
