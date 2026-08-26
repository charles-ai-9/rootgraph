/**
 * RootGraph D1 Sync API — Pages Functions
 * 挂载在 rootgraph.pages.dev/api/db/*
 *
 * GET  /api/db/sync            → 返回 app_data 中完整 NotesStore JSON
 * PUT  /api/db/sync            → 写入 app_data + data_versions + 细粒度表
 * GET  /api/db/versions        → 版本历史列表
 * POST /api/db/restore         → 从指定版本恢复
 *
 * 细粒度查询（排查用）：
 * GET  /api/db/inspect/word-fields/:key   → 查某个单词的字段覆盖
 * GET  /api/db/inspect/family-meta/:key   → 查某个词根族的元数据
 * GET  /api/db/inspect/user-families      → 查所有用户自建词根族
 *
 * 认证：Authorization: Bearer <SYNC_TOKEN>
 */

interface Env {
  DB: D1Database;
  SYNC_TOKEN: string;
}

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

/** 清理超出上限的旧版本 */
async function trimVersions(db: D1Database): Promise<void> {
  try {
    const { count } = (await db.prepare('SELECT COUNT(*) as count FROM data_versions').first()) ?? { count: 0 };
    if ((count as number) <= MAX_VERSIONS) return;
    await db
      .prepare(
        `DELETE FROM data_versions WHERE ts IN (
        SELECT ts FROM data_versions ORDER BY ts DESC LIMIT ? OFFSET ?
      )`,
      )
      .bind((count as number) - MAX_VERSIONS, MAX_VERSIONS)
      .run();
  } catch {
    /* ignore */
  }
}

/** 将 NotesStore 的嵌套对象同步写入细粒度表（供 SQL 查询排查） */
async function syncFineGrainedTables(db: D1Database, store: Record<string, unknown>, now: number): Promise<void> {
  try {
    // families: Record<string, string>
    const families = (store.families ?? {}) as Record<string, string>;
    for (const [key, content] of Object.entries(families)) {
      await db
        .prepare('INSERT OR REPLACE INTO families (key, content, updated_at) VALUES (?, ?, ?)')
        .bind(key, content ?? '', now)
        .run();
    }

    // words: Record<string, string>
    const words = (store.words ?? {}) as Record<string, string>;
    for (const [key, content] of Object.entries(words)) {
      await db
        .prepare('INSERT OR REPLACE INTO words (key, content, updated_at) VALUES (?, ?, ?)')
        .bind(key, content ?? '', now)
        .run();
    }

    // wordFields: Record<string, WordFieldOverrides>
    const wordFields = (store.wordFields ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, fields] of Object.entries(wordFields)) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO word_fields
        (key, mnemonic, collocations, examples, etymology, phonetic, definition, pos, senses, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          key,
          (fields.mnemonic as string) ?? null,
          (fields.collocations as string) ?? null,
          (fields.examples as string) ?? null,
          (fields.etymology as string) ?? null,
          (fields.phonetic as string) ?? null,
          (fields.definition as string) ?? null,
          (fields.pos as string) ?? null,
          fields.senses ? JSON.stringify(fields.senses) : null,
          now,
        )
        .run();
    }

    // familyMeta: Record<string, FamilyMeta>
    const familyMeta = (store.familyMeta ?? {}) as Record<string, Record<string, unknown>>;
    for (const [key, meta] of Object.entries(familyMeta)) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO family_meta (key, roots, semantic, meaning_en, meaning_zh, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          key,
          meta.roots ? JSON.stringify(meta.roots) : null,
          (meta.semantic as string) ?? null,
          (meta.meaningEn as string) ?? null,
          (meta.meaningZh as string) ?? null,
          now,
        )
        .run();
    }

    // userFamilies: Record<string, UserFamily>
    const userFamilies = (store.userFamilies ?? {}) as Record<string, Record<string, unknown>>;
    for (const [id, uf] of Object.entries(userFamilies)) {
      await db
        .prepare(
          `INSERT OR REPLACE INTO user_families (id, roots, meaning_zh, meaning_en, textbook, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          JSON.stringify(uf.roots ?? []),
          (uf.meaningZh as string) ?? '',
          (uf.meaningEn as string) ?? '',
          (uf.textbook as string) ?? null,
          (uf.createdAt as number) ?? now,
        )
        .run();
    }

    // touchMap: Record<string, number>
    const touchMap = (store.touchMap ?? {}) as Record<string, number>;
    for (const [key, ts] of Object.entries(touchMap)) {
      await db
        .prepare('INSERT OR REPLACE INTO touch_map (key, ts) VALUES (?, ?)')
        .bind(key, ts)
        .run();
    }
  } catch {
    /* 细粒度同步失败不影响主流程 */
  }
}

// ─── GET /api/db/sync ─────────────────────────────────────────────
async function handleGet(ctx: { request: Request; env: Env }): Promise<Response> {
  if (!checkAuth(ctx.request, ctx.env)) return json({ error: 'Unauthorized' }, 401);

  const url = new URL(ctx.request.url);

  // 版本历史
  if (url.pathname.endsWith('/versions')) {
    const rows = await ctx.env.DB.prepare('SELECT ts, updated_at, device_id FROM data_versions ORDER BY ts DESC LIMIT ?')
      .bind(MAX_VERSIONS)
      .all();
    return json({ versions: rows.results });
  }

  // 细粒度查询：word-fields
  if (url.pathname.includes('/inspect/word-fields/')) {
    const key = decodeURIComponent(url.pathname.split('/inspect/word-fields/')[1]);
    const row = await ctx.env.DB.prepare('SELECT * FROM word_fields WHERE key = ?').bind(key).first();
    return json(row ?? { error: 'Not found' }, row ? 200 : 404);
  }

  // 细粒度查询：family-meta
  if (url.pathname.includes('/inspect/family-meta/')) {
    const key = decodeURIComponent(url.pathname.split('/inspect/family-meta/')[1]);
    const row = await ctx.env.DB.prepare('SELECT * FROM family_meta WHERE key = ?').bind(key).first();
    return json(row ?? { error: 'Not found' }, row ? 200 : 404);
  }

  // 细粒度查询：user-families
  if (url.pathname.endsWith('/inspect/user-families')) {
    const rows = await ctx.env.DB.prepare('SELECT * FROM user_families ORDER BY created_at DESC').all();
    return json({ userFamilies: rows.results });
  }

  // 主同步：返回 app_data 中的完整 NotesStore
  const row = await ctx.env.DB.prepare('SELECT data, updated_at, device_id FROM app_data WHERE id = 1').first();
  if (!row || !row.data) {
    return json({ updatedAt: 0 });
  }
  try {
    const store = JSON.parse(row.data as string);
    return json({ ...store, updatedAt: row.updated_at, deviceId: row.device_id });
  } catch {
    return json({ updatedAt: 0 });
  }
}

// ─── PUT /api/db/sync ─────────────────────────────────────────────
async function handlePut(ctx: { request: Request; env: Env }): Promise<Response> {
  if (!checkAuth(ctx.request, ctx.env)) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await ctx.request.text();
    const parsed = JSON.parse(body);
    const now = Date.now();
    if (!parsed.updatedAt) parsed.updatedAt = now;
    const deviceId = parsed.deviceId ?? null;
    const ts = now;

    // 写入 app_data（主存储）
    await ctx.env.DB.prepare(
      'INSERT OR REPLACE INTO app_data (id, data, updated_at, device_id) VALUES (1, ?, ?, ?)',
    )
      .bind(JSON.stringify(parsed), parsed.updatedAt, deviceId)
      .run();

    // 写入版本历史
    await ctx.env.DB.prepare(
      'INSERT OR REPLACE INTO data_versions (ts, data, updated_at, device_id) VALUES (?, ?, ?, ?)',
    )
      .bind(ts, JSON.stringify(parsed), parsed.updatedAt, deviceId)
      .run();

    // 清理旧版本
    await trimVersions(ctx.env.DB);

    // 同步写入细粒度表（供 SQL 查询排查）
    await syncFineGrainedTables(ctx.env.DB, parsed, now);

    return json({ ok: true, updatedAt: parsed.updatedAt, versionTs: ts });
  } catch (e) {
    return json({ error: 'Invalid JSON', detail: String(e) }, 400);
  }
}

// ─── POST /api/db/restore ─────────────────────────────────────────
async function handleRestore(ctx: { request: Request; env: Env }): Promise<Response> {
  if (!checkAuth(ctx.request, ctx.env)) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = (await ctx.request.json()) as { ts?: number };
    if (!body.ts) return json({ error: 'Missing ts' }, 400);

    const row = await ctx.env.DB.prepare('SELECT data FROM data_versions WHERE ts = ?').bind(body.ts).first();
    if (!row || !row.data) return json({ error: 'Version not found' }, 404);

    const parsed = JSON.parse(row.data as string);
    const now = Date.now();

    // 保存当前数据为一个版本（保留恢复前数据）
    const current = await ctx.env.DB.prepare('SELECT data FROM app_data WHERE id = 1').first();
    if (current?.data) {
      await ctx.env.DB.prepare(
        'INSERT OR REPLACE INTO data_versions (ts, data, updated_at) VALUES (?, ?, ?)',
      )
        .bind(now, current.data, now)
        .run();
    }

    // 恢复：app_data 指向历史版本
    const restored = { ...parsed, updatedAt: now, restoredFrom: body.ts };
    await ctx.env.DB.prepare('INSERT OR REPLACE INTO app_data (id, data, updated_at) VALUES (1, ?, ?)')
      .bind(JSON.stringify(restored), now)
      .run();

    // 同步细粒度表
    await syncFineGrainedTables(ctx.env.DB, restored, now);

    return json({ ok: true, restoredFrom: body.ts });
  } catch {
    return json({ error: 'Invalid request' }, 400);
  }
}

// ─── Pages Functions 路由入口 ──────────────────────────────────────
export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  return handleGet({ request: ctx.request, env: ctx.env as unknown as Env });
};

export const onRequestPut: PagesFunction<Env> = async (ctx) => {
  return handlePut({ request: ctx.request, env: ctx.env as unknown as Env });
};

export const onRequestPost: PagesFunction<Env> = async (ctx) => {
  const url = new URL(ctx.request.url);
  if (url.pathname.endsWith('/restore')) {
    return handleRestore({ request: ctx.request, env: ctx.env as unknown as Env });
  }
  // POST 也支持上传（sendBeacon 走 POST）
  return handlePut({ request: ctx.request, env: ctx.env as unknown as Env });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204 });
};
