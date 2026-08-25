/**
 * RootGraph Sync API — Pages Functions 版（版本化，防数据丢失）
 * 挂载在 rootgraph.pages.dev/api/sync
 *
 * GET  /api/sync            → 返回 KV 中最新整块 NotesStore JSON
 * GET  /api/sync?history=1  → 返回版本列表（ts + updatedAt + deviceId）
 * POST /api/sync/restore    → 从指定版本恢复为 latest（body: { ts }）
 * PUT  /api/sync            → 写入 KV：latest + 版本历史（每次写入一条，可回滚）
 * 认证：Authorization: Bearer <SYNC_TOKEN>
 */

interface Env {
  NOTES: KVNamespace;
  SYNC_TOKEN: string;
}

const KV_LATEST = 'notes';
const VERSION_PREFIX = 'notes:v:';
const MAX_VERSIONS = 50;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function checkAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  return auth.slice(7) === env.SYNC_TOKEN;
}

/** 清理超出上限的旧版本（保留最近 MAX_VERSIONS 个） */
async function trimVersions(kv: KVNamespace): Promise<void> {
  try {
    const list = await kv.list({ prefix: VERSION_PREFIX });
    if (list.keys.length <= MAX_VERSIONS) return;
    const sorted = list.keys
      .map((k) => ({ name: k.name, ts: Number(k.name.slice(VERSION_PREFIX.length)) }))
      .sort((a, b) => b.ts - a.ts);
    for (const k of sorted.slice(MAX_VERSIONS)) {
      await kv.delete(k.name);
    }
  } catch {
    /* ignore */
  }
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!checkAuth(ctx.request, ctx.env)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const url = new URL(ctx.request.url);
  if (url.searchParams.get('history') === '1') {
    // 版本历史列表
    const list = await ctx.env.NOTES.list({ prefix: VERSION_PREFIX });
    const versions = [];
    for (const k of list.keys) {
      const ts = Number(k.name.slice(VERSION_PREFIX.length));
      const raw = await ctx.env.NOTES.get(k.name, 'text');
      try {
        const parsed = raw ? JSON.parse(raw) : null;
        versions.push({ ts, updatedAt: parsed?.updatedAt ?? ts, deviceId: parsed?.deviceId ?? null });
      } catch {
        versions.push({ ts, updatedAt: ts, deviceId: null });
      }
    }
    versions.sort((a, b) => b.ts - a.ts);
    return json({ versions: versions.slice(0, MAX_VERSIONS) });
  }

  const raw = await ctx.env.NOTES.get(KV_LATEST, 'text');
  if (!raw) {
    return json({ updatedAt: 0, data: null });
  }
  try {
    return json(JSON.parse(raw));
  } catch {
    return json({ updatedAt: 0, data: null });
  }
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  if (!checkAuth(ctx.request, ctx.env)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  try {
    const body = await ctx.request.text();
    const parsed = JSON.parse(body);
    if (!parsed.updatedAt) {
      parsed.updatedAt = Date.now();
    }
    const ts = Date.now();
    // 写入最新
    await ctx.env.NOTES.put(KV_LATEST, JSON.stringify(parsed));
    // 写入版本历史（每次写入一条，防止数据被覆盖后无法找回）
    await ctx.env.NOTES.put(`${VERSION_PREFIX}${ts}`, JSON.stringify(parsed));
    await trimVersions(ctx.env.NOTES);
    return json({ ok: true, updatedAt: parsed.updatedAt, versionTs: ts });
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  if (!checkAuth(ctx.request, ctx.env)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const url = new URL(ctx.request.url);
  if (url.pathname.endsWith('/restore')) {
    return handleRestore(ctx);
  }
  // POST /api/sync：sendBeacon 上传入口（与 PUT 等价，写入 latest + 版本历史）
  try {
    const body = await ctx.request.text();
    const parsed = JSON.parse(body);
    if (!parsed.updatedAt) parsed.updatedAt = Date.now();
    const ts = Date.now();
    await ctx.env.NOTES.put(KV_LATEST, JSON.stringify(parsed));
    await ctx.env.NOTES.put(`${VERSION_PREFIX}${ts}`, JSON.stringify(parsed));
    await trimVersions(ctx.env.NOTES);
    return json({ ok: true, updatedAt: parsed.updatedAt, versionTs: ts });
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
};

async function handleRestore(ctx: Parameters<PagesFunction<Env>>[0]): Promise<Response> {
  try {
    const body = (await ctx.request.json()) as { ts?: number };
    if (!body.ts) return json({ error: 'Missing ts' }, 400);
    const raw = await ctx.env.NOTES.get(`${VERSION_PREFIX}${body.ts}`, 'text');
    if (!raw) return json({ error: 'Version not found' }, 404);
    const parsed = JSON.parse(raw);
    // 恢复：latest 指向历史版本（同时再存一个恢复版本，保留恢复前数据）
    const currentLatest = await ctx.env.NOTES.get(KV_LATEST, 'text');
    const restoreTs = Date.now();
    if (currentLatest) {
      await ctx.env.NOTES.put(`${VERSION_PREFIX}${restoreTs}`, currentLatest);
    }
    await ctx.env.NOTES.put(KV_LATEST, JSON.stringify({ ...parsed, updatedAt: Date.now(), restoredFrom: body.ts }));
    await trimVersions(ctx.env.NOTES);
    return json({ ok: true, restoredFrom: body.ts });
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204 });
};
