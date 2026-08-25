/**
 * RootGraph Sync Worker
 * 单用户极简后端：整块 JSON + last-write-wins + 静态 token 认证
 */

interface Env {
  NOTES: KVNamespace;
  SYNC_TOKEN: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const KV_KEY = 'notes';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function unauthorized(): Response {
  return json({ error: 'Unauthorized' }, 401);
}

function checkAuth(request: Request, env: Env): boolean {
  const auth = request.headers.get('Authorization');
  if (!auth || !auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7);
  return token === env.SYNC_TOKEN;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    if (url.pathname !== '/api/sync') {
      return json({ error: 'Not Found' }, 404);
    }

    // GET: 返回远端数据
    if (request.method === 'GET') {
      if (!checkAuth(request, env)) return unauthorized();
      const raw = await env.NOTES.get(KV_KEY, 'text');
      if (!raw) {
        return json({ updatedAt: 0, data: null });
      }
      try {
        const stored = JSON.parse(raw);
        return json(stored);
      } catch {
        return json({ updatedAt: 0, data: null });
      }
    }

    // PUT: 写入远端
    if (request.method === 'PUT') {
      if (!checkAuth(request, env)) return unauthorized();
      try {
        const body = await request.text();
        // 验证是合法 JSON
        const parsed = JSON.parse(body);
        // 确保有 updatedAt
        if (!parsed.updatedAt) {
          parsed.updatedAt = Date.now();
        }
        await env.NOTES.put(KV_KEY, JSON.stringify(parsed));
        return json({ ok: true, updatedAt: parsed.updatedAt });
      } catch {
        return json({ error: 'Invalid JSON' }, 400);
      }
    }

    return json({ error: 'Method Not Allowed' }, 405);
  },
};
