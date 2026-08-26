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

// ─── GET /api/db/catalog ──────────────────────────────────────────
async function handleCatalog(env: Env): Promise<Response> {
  const rows = await env.DB
    .prepare(
      `SELECT id, textbook, file, chapter, chapter_order, title_zh, semantic_label,
        meaning_en, meaning_zh, roots, word_count, source, legacy_id
       FROM catalog_entries ORDER BY textbook, chapter_order`,
    )
    .all();
  // 映射为前端 CatalogEntry 格式（camelCase）
  const entries = rows.results.map((r) => ({
    id: r.id,
    textbook: r.textbook,
    file: r.file,
    chapter: r.chapter,
    chapterOrder: r.chapter_order,
    titleZh: r.title_zh,
    semanticLabel: r.semantic_label,
    meaningEn: r.meaning_en,
    meaningZh: r.meaning_zh,
    roots: r.roots ? JSON.parse(r.roots as string) : [],
    wordCount: r.word_count,
    source: r.source,
    legacyId: r.legacy_id,
  }));
  return json(entries);
}

// ─── GET /api/db/family/:textbook/:id ─────────────────────────────
async function handleFamily(env: Env, textbook: string, id: string): Promise<Response> {
  const row = await env.DB
    .prepare('SELECT data_json FROM textbook_families WHERE textbook = ? AND family_id = ?')
    .bind(textbook, id)
    .first();
  if (!row || !row.data_json) {
    return json({ error: 'Not found' }, 404);
  }
  return new Response(row.data_json as string, {
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── GET /api/db/word-index ───────────────────────────────────────
async function handleWordIndex(env: Env): Promise<Response> {
  const rows = await env.DB
    .prepare(
      `SELECT word, textbook, family_id, phonetic, pos, definition, mnemonic, root_hint, frequency
       FROM word_index ORDER BY word`,
    )
    .all();
  const index = rows.results.map((r) => ({
    word: r.word,
    textbook: r.textbook,
    familyId: r.family_id,
    phonetic: r.phonetic,
    pos: r.pos,
    definition: r.definition,
    mnemonic: r.mnemonic,
    rootHint: r.root_hint,
    frequency: r.frequency,
  }));
  return json(index);
}

// ─── GET /api/db/sync ─────────────────────────────────────────────
async function handleGet(ctx: { request: Request; env: Env }): Promise<Response> {
  const url = new URL(ctx.request.url);

  // 公开端点：教材数据（无需认证，与旧 /data/* 一致）
  if (url.pathname.endsWith('/catalog')) {
    return handleCatalog(ctx.env);
  }
  if (url.pathname.endsWith('/word-index')) {
    return handleWordIndex(ctx.env);
  }
  const familyMatch = url.pathname.match(/\/family\/([^/]+)\/(.+)$/);
  if (familyMatch) {
    return handleFamily(ctx.env, decodeURIComponent(familyMatch[1]), decodeURIComponent(familyMatch[2]));
  }

  // 以下端点需要认证
  if (!checkAuth(ctx.request, ctx.env)) return json({ error: 'Unauthorized' }, 401);

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

// ─── POST /api/db/import ──────────────────────────────────────────
async function handleImport(ctx: { request: Request; env: Env }): Promise<Response> {
  if (!checkAuth(ctx.request, ctx.env)) return json({ error: 'Unauthorized' }, 401);

  try {
    const body = await ctx.request.text();
    const payload = JSON.parse(body) as {
      catalog?: Array<Record<string, unknown>>;
      families?: Array<{ textbook: string; familyId: string; dataJson: string }>;
      words?: Array<Record<string, unknown>>;
    };

    const db = ctx.env.DB;

    // 事务内全量替换
    await db.prepare('DELETE FROM word_index').run();
    await db.prepare('DELETE FROM textbook_families').run();
    await db.prepare('DELETE FROM catalog_entries').run();

    let catalogCount = 0;
    if (payload.catalog) {
      for (const e of payload.catalog) {
        await db
          .prepare(
            `INSERT INTO catalog_entries
             (id, textbook, file, chapter, chapter_order, title_zh, semantic_label, meaning_en, meaning_zh, roots, word_count, source, legacy_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            e.id as string,
            e.textbook as string,
            (e.file as string) ?? '',
            (e.chapter as string) ?? null,
            (e.chapterOrder as number) ?? null,
            (e.titleZh as string) ?? null,
            (e.semanticLabel as string) ?? null,
            (e.meaningEn as string) ?? null,
            (e.meaningZh as string) ?? null,
            JSON.stringify((e.roots as string[]) ?? []),
            (e.wordCount as number) ?? 0,
            (e.source as string) ?? null,
            (e.legacyId as string) ?? null,
          )
          .run();
        catalogCount++;
      }
    }

    let familyCount = 0;
    if (payload.families) {
      for (const f of payload.families) {
        await db
          .prepare('INSERT INTO textbook_families (textbook, family_id, data_json, updated_at) VALUES (?, ?, ?, 0)')
          .bind(f.textbook, f.familyId, f.dataJson)
          .run();
        familyCount++;
      }
    }

    let wordCount = 0;
    if (payload.words) {
      for (const w of payload.words) {
        await db
          .prepare(
            `INSERT INTO word_index
             (word, textbook, family_id, phonetic, pos, definition, mnemonic, root_hint, frequency)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            w.word as string,
            w.textbook as string,
            w.familyId as string,
            (w.phonetic as string) ?? null,
            (w.pos as string) ?? null,
            (w.definition as string) ?? null,
            (w.mnemonic as string) ?? null,
            (w.rootHint as string) ?? null,
            (w.frequency as number) ?? null,
          )
          .run();
        wordCount++;
      }
    }

    return json({ ok: true, catalog: catalogCount, families: familyCount, words: wordCount });
  } catch (e) {
    return json({ error: 'Invalid request', detail: String(e) }, 400);
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
  if (url.pathname.endsWith('/import')) {
    return handleImport({ request: ctx.request, env: ctx.env as unknown as Env });
  }
  // POST 也支持上传（sendBeacon 走 POST）
  return handlePut({ request: ctx.request, env: ctx.env as unknown as Env });
};

export const onRequestOptions: PagesFunction<Env> = async () => {
  return new Response(null, { status: 204 });
};
