/**
 * RootGraph Sync API — Pages Functions 版
 * 挂载在 rootgraph.pages.dev/api/sync，与前端同域，绕过 workers.dev 被墙问题
 *
 * GET  /api/sync → 返回 KV 中的整块 NotesStore JSON
 * PUT  /api/sync → 写入 KV（请求体为整块 NotesStore JSON）
 * 认证：Authorization: Bearer <SYNC_TOKEN>
 */

interface Env {
  NOTES: KVNamespace;
  SYNC_TOKEN: string;
}

const KV_KEY = 'notes';

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

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  if (!checkAuth(ctx.request, ctx.env)) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const raw = await ctx.env.NOTES.get(KV_KEY, 'text');
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
    await ctx.env.NOTES.put(KV_KEY, JSON.stringify(parsed));
    return json({ ok: true, updatedAt: parsed.updatedAt });
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204 });
};
