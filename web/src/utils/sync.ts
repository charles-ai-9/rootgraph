/**
 * RootGraph 前端同步模块
 * 整块 JSON + last-write-wins + 静态 token 认证
 */

// 同步 API 挂载在同域 Pages Functions 下（rootgraph.pages.dev/api/sync），
// 避免 workers.dev 在国内被 DNS 污染的问题
const SYNC_URL = '/api/sync';
const SYNC_TOKEN = 'rg_sync_2026_k8m3p7q2x9w4';

let uploadTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * 防抖上传：写入后 debounce 2s，将整块数据 PUT 到远端
 */
export function scheduleUpload(getData: () => object): void {
  if (uploadTimer) clearTimeout(uploadTimer);
  uploadTimer = setTimeout(async () => {
    uploadTimer = null;
    try {
      const data = getData();
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
  }, 2000);
}

/**
 * 启动时下载远端数据，返回完整的 NotesStore（含 updatedAt）
 * 失败返回 null
 */
export async function downloadRemote(): Promise<object | null> {
  try {
    const res = await fetch(SYNC_URL, {
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
