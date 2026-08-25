import { useEffect, useMemo, useRef, useState } from 'react';
import type { AffixItem, AffixKind, CatalogEntry } from '../types';
import { catalogEntryKey, displayRoots, displaySemantic } from '../types';
import { rootChapterOptions, textbookLabel } from '../catalog';
import { WordSearchResults } from './WordSearchResults';
import { AffixLibraryOverlay } from './AffixLibraryOverlay';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import type { FamilyMeta, UserFamily } from '../hooks/useNotes';
import { downloadNotesBackup, importNotesBackup, parseBackupFile } from '../utils/backup';

interface HomePageProps {
  onOpenFamily: (entry: CatalogEntry, word?: string) => void;
  affixItems: AffixItem[];
  onSaveAffixGroup: (draft: AffixGroupDraft) => void;
  getVideoId: (key: string) => string;
  getFamilyMeta: (key: string) => FamilyMeta | undefined;
  userFamilies: Record<string, UserFamily>;
  createUserFamily: (data: Omit<UserFamily, 'createdAt'>) => UserFamily;
  updateUserFamily: (id: string, data: Partial<Pick<UserFamily, 'roots' | 'meaningZh' | 'meaningEn' | 'textbook'>>) => void;
  removeUserFamily: (id: string) => void;
  getUserFamilyWords: (id: string) => import('../types').WordEntry[];
  /** 词根顺序（教材/我的 → id 列表；首页拖动排序） */
  familyOrder: Record<string, string[]>;
  setFamilyOrder: (groupKey: string, ids: string[]) => void;
}

export function HomePage({
  onOpenFamily,
  affixItems,
  onSaveAffixGroup,
  getVideoId,
  getFamilyMeta,
  userFamilies,
  createUserFamily,
  updateUserFamily,
  removeUserFamily,
  getUserFamilyWords,
  familyOrder,
  setFamilyOrder,
}: HomePageProps) {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [catalogError, setCatalogError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);
  const [filter, setFilter] = useState('');
  const [textbook, setTextbook] = useState('all');
  const [chapterKey, setChapterKey] = useState('all');
  const [affixOverlayOpen, setAffixOverlayOpen] = useState(false);
  const [affixOverlayKind, setAffixOverlayKind] = useState<AffixKind>('suffix');
  const [backupMsg, setBackupMsg] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newRootName, setNewRootName] = useState('');
  const [newRootZh, setNewRootZh] = useState('');
  const [newRootEn, setNewRootEn] = useState('');
  /** 新词根的目标教材（空 = 我的词根） */
  const [newTextbook, setNewTextbook] = useState('');
  /** 编辑我的词根（如修正输入法自动纠错的词根名） */
  const [editFamily, setEditFamily] = useState<UserFamily | null>(null);
  const [editRootsText, setEditRootsText] = useState('');
  const [editZh, setEditZh] = useState('');
  const [editTextbook, setEditTextbook] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  /** 拖动排序：拖动中的临时顺序（groupKey → id 列表），松手持久化 */
  const [draftOrder, setDraftOrder] = useState<Record<string, string[]>>({});
  const [dragState, setDragState] = useState<{ group: string; id: string } | null>(null);
  const dragGroupRef = useRef<string | null>(null);
  const dragIdRef = useRef<string | null>(null);
  const lastTopTapRef = useRef(0);

  const openUserFamily = (f: UserFamily, word?: string) => {
    const entry: CatalogEntry = {
      id: f.id,
      file: '',
      chapter: f.textbook ? '补充词根' : '我的',
      chapterOrder: 999,
      titleZh: f.meaningZh,
      semanticLabel: f.meaningZh,
      meaningEn: f.meaningEn,
      meaningZh: f.meaningZh,
      roots: f.roots,
      wordCount: getUserFamilyWords(f.id).length,
      source: 'user',
      textbook: f.textbook ?? 'user',
    };
    // 焦点词经 applyView 写入深链（?word=…），刷新/复制链接后仍能定位（resolver 从 localStorage 恢复 source）
    onOpenFamily(entry, word);
  };

  const handleCreateFamily = () => {
    const roots = newRootName.split(/[，,、]/).map((x) => x.trim().toLowerCase().replace(/^-+/, '')).filter(Boolean);
    if (!roots.length) return;
    const id = roots[0];
    if (userFamilies[id]) {
      setBackupMsg(`词根 ${id} 已存在`);
      return;
    }
    createUserFamily({
      id,
      roots,
      meaningZh: newRootZh.trim(),
      meaningEn: newRootEn.trim(),
      textbook: newTextbook || undefined,
    });
    setNewRootName('');
    setNewRootZh('');
    setNewRootEn('');
    setNewTextbook('');
    setCreateOpen(false);
  };

  /** 双击 hero 回到页面顶部（App 习惯） */
  const handleHeroTap = () => {
    const now = Date.now();
    if (now - lastTopTapRef.current < 350) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      lastTopTapRef.current = 0;
    } else {
      lastTopTapRef.current = now;
    }
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = parseBackupFile(String(reader.result));
        importNotesBackup(backup);
        setBackupMsg('导入成功（导入前已自动备份现有数据）');
      } catch (e) {
        setBackupMsg(`导入失败：${(e as Error).message}`);
      }
      window.setTimeout(() => setBackupMsg(''), 4000);
    };
    reader.readAsText(file);
  };

  useEffect(() => {
    setCatalogError(false);
    fetch('/data/catalog.json')
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setCatalog)
      .catch(() => setCatalogError(true));
  }, [retryTick]);

  const textbooks = useMemo(
    () => [...new Set(catalog.map((c) => c.textbook))].sort(),
    [catalog],
  );

  const chapterOptions = useMemo(
    () => rootChapterOptions(catalog, textbook),
    [catalog, textbook],
  );

  useEffect(() => {
    setChapterKey('all');
  }, [textbook]);

  /** 与词根变体完全一致的官方数据词数（本地词根 = 官方词 + 挂载词） */
  const dataCountForRoots = (roots: string[]): number => {
    const key = [...roots].sort().join('|');
    return catalog
      .filter((e) => e.source !== 'user' && [...(e.roots ?? [])].sort().join('|') === key)
      .reduce((n, e) => n + (e.wordCount ?? 0), 0);
  };

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const system = catalog.filter((entry) => {
      if (textbook !== 'all' && entry.textbook !== textbook) return false;
      if (chapterKey !== 'all' && catalogEntryKey(entry) !== chapterKey) return false;
      if (!q) return true;
      const hay = [
        displayRoots(entry),
        displaySemantic(entry),
        entry.semanticLabel,
        entry.roots.join(' '),
        entry.textbook,
        textbookLabel(entry.textbook),
        entry.chapter,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
    // 搜索词根名时同时命中「我的词根」（textbook:'user' 条目，grouped 显示为「我的词根」组）
    if (!q) return system;
    const my = Object.values(userFamilies)
      .filter((f) => !f.textbook)
      .filter(
        (f) =>
          f.roots.some((r) => r.toLowerCase().includes(q)) ||
          (f.meaningZh ?? '').toLowerCase().includes(q),
      )
      .map((f) => ({
        id: f.id,
        file: '',
        chapter: f.textbook ? '补充词根' : '我的',
        chapterOrder: 999,
        titleZh: f.meaningZh ?? '',
        semanticLabel: f.meaningZh ?? '',
        meaningEn: f.meaningEn ?? '',
        meaningZh: f.meaningZh ?? '',
        roots: f.roots,
        wordCount: getUserFamilyWords(f.id).length + dataCountForRoots(f.roots),
        source: 'user' as const,
        textbook: (f.textbook ?? 'user') as string,
      }));
    return [...system, ...my];
  }, [catalog, filter, textbook, chapterKey, userFamilies, getUserFamilyWords]);

  const grouped = useMemo(() => {
    // 1. 基础条目：catalog 筛选 + 搜索混入的「我的词根」
    const items = [...filtered];
    // 2. 合并「教材词根」（用户创建时选了教材，显示在该教材底部；同 id 覆盖系统族）
    const q = filter.trim().toLowerCase();
    for (const f of Object.values(userFamilies)) {
      if (!f.textbook) continue;
      if (textbook !== 'all' && f.textbook !== textbook) continue;
      if (chapterKey !== 'all') continue;
      if (
        q &&
        !f.roots.some((r) => r.toLowerCase().includes(q)) &&
        !(f.meaningZh ?? '').toLowerCase().includes(q)
      ) {
        continue;
      }
      items.push({
        id: f.id,
        file: '',
        chapter: '补充词根',
        chapterOrder: 999,
        titleZh: f.meaningZh ?? '',
        semanticLabel: f.meaningZh ?? '',
        meaningEn: f.meaningEn ?? '',
        meaningZh: f.meaningZh ?? '',
        roots: f.roots,
        wordCount: getUserFamilyWords(f.id).length + dataCountForRoots(f.roots),
        source: 'user',
        textbook: f.textbook,
      });
    }
    // 3. 同 (教材, id) 去重：教材词根（后加入）覆盖系统族
    const byKey = new Map<string, CatalogEntry>();
    for (const item of items) byKey.set(`${item.textbook}:${item.id}`, item);
    // 有效顺序：拖动中的临时顺序优先，其次已保存顺序，缺省按目录 chapterOrder
    const orderIndex = (tb: string, id: string) => {
      const list = draftOrder[tb] ?? familyOrder[tb];
      if (!list) return -1;
      const i = list.indexOf(id);
      return i < 0 ? 9999 : i;
    };
    const merged = [...byKey.values()].sort((a, b) => {
      if (a.textbook !== b.textbook) return a.textbook.localeCompare(b.textbook);
      const oa = orderIndex(a.textbook, a.id);
      const ob = orderIndex(b.textbook, b.id);
      if (oa !== ob) return oa - ob;
      return (a.chapterOrder ?? 999) - (b.chapterOrder ?? 999);
    });

    if (textbook !== 'all') {
      return [{ key: textbookLabel(textbook), items: merged }];
    }

    const map = new Map<string, CatalogEntry[]>();
    for (const item of merged) {
      const key = item.textbook === 'user' ? '我的词根' : textbookLabel(item.textbook);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].map(([key, groupItems]) => ({ key, items: groupItems }));
  }, [filtered, textbook, chapterKey, userFamilies, getUserFamilyWords, draftOrder, familyOrder]);

  const totalWords = catalog.reduce((n, c) => n + c.wordCount, 0);
  const hasFilter = filter.trim().length > 0;

  /** 拖动排序：拖动把手按下后，跟随指针重排当前分组 */
  const onDragHandleDown = (e: React.PointerEvent, group: string, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    dragGroupRef.current = group;
    dragIdRef.current = id;
    setDragState({ group, id });
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onDragHandleMove = (e: React.PointerEvent) => {
    const group = dragGroupRef.current;
    const id = dragIdRef.current;
    if (!group || !id) return;
    const rows = Array.from(
      document.querySelectorAll(`[data-row-group="${CSS.escape(group)}"]`),
    ) as HTMLElement[];
    if (rows.length < 2) return;
    let targetId = id;
    for (const el of rows) {
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        targetId = el.dataset.rowId ?? id;
        break;
      }
    }
    const cur = draftOrder[group] ?? familyOrder[group] ?? rows.map((el) => el.dataset.rowId ?? '');
    const from = cur.indexOf(id);
    const to = cur.indexOf(targetId);
    if (from >= 0 && to >= 0 && from !== to) {
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, id);
      setDraftOrder((d) => ({ ...d, [group]: next }));
    }
  };

  const onDragHandleUp = () => {
    const group = dragGroupRef.current;
    if (group) {
      const ids = draftOrder[group] ?? familyOrder[group];
      if (ids && ids.length) setFamilyOrder(group, ids);
    }
    dragGroupRef.current = null;
    dragIdRef.current = null;
    setDragState(null);
  };

  const renderCard = (entry: CatalogEntry, groupKey: string) => {
    const meta = getFamilyMeta(catalogEntryKey(entry));
    const roots = meta?.roots?.length ? meta.roots.join(' · ') : displayRoots(entry);
    const semantic = meta?.meaningZh?.trim() || meta?.semantic?.trim() || displaySemantic(entry);
    const videoId = getVideoId(catalogEntryKey(entry));
    const isUser = entry.source === 'user';
    const isDragging = dragState?.group === groupKey && dragState.id === entry.id;

    return (
      <div
        key={catalogEntryKey(entry)}
        className={`library-row-wrap${isDragging ? ' is-dragging' : ''}`}
        data-row-group={groupKey}
        data-row-id={entry.id}
      >
        <button
          type="button"
          className="library-row"
          onClick={() => {
            if (isUser) {
              const f = userFamilies[entry.id];
              if (f) openUserFamily(f);
            } else {
              onOpenFamily(entry);
            }
          }}
        >
          <span className="library-row-chapter">第{entry.chapter}章</span>
          <span className="library-row-roots">{roots}</span>
          {semantic && <span className="library-row-semantic">{semantic}</span>}
          <span className="library-row-meta">
            <span>{entry.wordCount} 词</span>
            {videoId && <span className="video-chip">🎬 {videoId}</span>}
          </span>
        </button>
        {isUser && (
          <button
            type="button"
            className="user-family-edit"
            title="编辑词根"
            aria-label={`编辑 ${entry.id}`}
            onClick={(e) => {
              e.stopPropagation();
              const f = userFamilies[entry.id];
              if (!f) return;
              setEditFamily(f);
              setEditRootsText(f.roots.join('，'));
              setEditZh(f.meaningZh ?? '');
              setEditTextbook(f.textbook ?? '');
            }}
          >
            ✎
          </button>
        )}
        {isUser && (
          <button
            type="button"
            className="user-family-del"
            title="删除词根"
            aria-label={`删除 ${entry.id}`}
            onClick={(e) => {
              e.stopPropagation();
              if (window.confirm(`删除词根 ${roots}？其挂入的词会回到原词根族。`)) {
                removeUserFamily(entry.id);
              }
            }}
          >
            ✕
          </button>
        )}
        <span
          className="row-drag-handle"
          title="按住拖动排序"
          aria-label={`拖动排序 ${roots}`}
          onPointerDown={(e) => onDragHandleDown(e, groupKey, entry.id)}
          onPointerMove={onDragHandleMove}
          onPointerUp={onDragHandleUp}
          onPointerCancel={onDragHandleUp}
        >
          ≡
        </span>
      </div>
    );
  };

  return (
    <div className="library">
      <header className="library-hero" onClick={handleHeroTap}>
        <p className="eyebrow">RootGraph · 词根笔记</p>
        <h1 className="hero-enjoy-title">
          <span>享受英语</span>
          <span className="hero-coffee-icon" aria-hidden title="喝杯咖啡，轻松学">
            ☕
          </span>
        </h1>
        <p className="subtitle">
          {catalog.length} 个词根族 · {totalWords.toLocaleString()} 个单词 · 按教材目录词根分类
        </p>
        <div className="hero-actions">
          <button type="button" className="hero-action" onClick={() => setAffixOverlayOpen(true)}>
            词根词缀库
          </button>
          <button type="button" className="hero-action" onClick={() => setCreateOpen(true)}>
            ＋ 新建词根
          </button>
          <button type="button" className="hero-action subtle" onClick={downloadNotesBackup}>
            导出笔记
          </button>
          <button type="button" className="hero-action subtle" onClick={() => fileRef.current?.click()}>
            导入笔记
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = '';
            }}
          />
          {backupMsg && <p className="backup-msg">{backupMsg}</p>}
        </div>
      </header>

      <div className="library-toolbar">
        {catalogError && (
          <div className="load-error-hint">
            <span>数据加载失败（/data/catalog.json 不可用）</span>
            <button type="button" onClick={() => setRetryTick((t) => t + 1)}>重试</button>
          </div>
        )}
        <input
          className="search-input"
          placeholder="搜索词根、语义、教材、单词…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <select value={textbook} onChange={(e) => setTextbook(e.target.value)}>
          <option value="all">全部教材</option>
          {textbooks.map((tb) => (
            <option key={tb} value={tb}>
              {textbookLabel(tb)}
            </option>
          ))}
        </select>
      </div>

      <WordSearchResults
        query={filter}
        textbook={textbook}
        catalog={catalog}
        userFamilies={userFamilies}
        getUserFamilyWords={getUserFamilyWords}
        onOpenWord={(entry, word) => onOpenFamily(entry, word)}
        onOpenUserFamily={openUserFamily}
      />

      <div className="filter-hint">
        {textbook === 'all'
          ? '先选教材，再按目录词根筛选章节'
          : `${textbookLabel(textbook)} · ${chapterOptions.length} 个词根章节`}
      </div>

      {textbook !== 'all' && (
        <div className="topic-chips">
          <button
            type="button"
            className={`chip ${chapterKey === 'all' ? 'active' : ''}`}
            onClick={() => setChapterKey('all')}
          >
            全部词根章
          </button>
          {chapterOptions.map((opt) => (
            <button
              key={opt.key}
              type="button"
              className={`chip ${chapterKey === opt.key ? 'active' : ''}`}
              onClick={() => setChapterKey(opt.key)}
              title={opt.semantic ?? undefined}
            >
              {opt.roots}
            </button>
          ))}
        </div>
      )}

      {hasFilter && (
        <h2 className="topic-section-title library-section-label">词根族</h2>
      )}

      {grouped.map(({ key, items }) =>
        items.length === 0 ? null : (
          <section key={key} className="topic-section">
            {textbook === 'all' && !hasFilter && <h2 className="topic-section-title">{key}</h2>}
            <div className="library-list">
              {items.map((entry) => renderCard(entry, entry.textbook))}
            </div>
          </section>
        ),
      )}

      {catalog.length === 0 && !catalogError && (
        <div className="library-skeleton">
          <div className="skeleton-line w60" />
          {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="skeleton-card" />
          ))}
        </div>
      )}

      {!hasFilter && Object.values(userFamilies).some((f) => !f.textbook) && (() => {
        const myEntries = Object.values(userFamilies)
          .filter((f) => !f.textbook)
          .map((f) => ({
            id: f.id,
            file: '',
            chapter: '我的',
            chapterOrder: 999,
            titleZh: f.meaningZh ?? '',
            semanticLabel: f.meaningZh ?? '',
            meaningEn: f.meaningEn ?? '',
            meaningZh: f.meaningZh ?? '',
            roots: f.roots,
            wordCount: getUserFamilyWords(f.id).length + dataCountForRoots(f.roots),
            source: 'user' as const,
            textbook: 'user' as const,
          }));
        const order = draftOrder['user'] ?? familyOrder['user'];
        if (order) {
          myEntries.sort((a, b) => {
            const ia = order.indexOf(a.id);
            const ib = order.indexOf(b.id);
            return (ia < 0 ? 9999 : ia) - (ib < 0 ? 9999 : ib);
          });
        }
        return (
          <section className="topic-section">
            <h2 className="topic-section-title">我的词根</h2>
            <div className="library-list">
              {myEntries.map((entry) => renderCard(entry, 'user'))}
            </div>
          </section>
        );
      })()}

      {filtered.length === 0 && !hasFilter && !catalogError && catalog.length > 0 && (
        <p className="empty-hint">没有匹配的词根族，试试换个筛选条件</p>
      )}

      {createOpen && (
        <div className="affix-modal-backdrop" onClick={() => setCreateOpen(false)} role="presentation">
          <div className="user-family-create" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="user-family-create-title">新建词根</h3>
            <div className="family-meta-field">
              <label htmlFor="new-root-name">词根（逗号分隔多个变体，如 eco，econ）</label>
              <input
                id="new-root-name"
                className="family-meta-input"
                value={newRootName}
                onChange={(e) => setNewRootName(e.target.value)}
                placeholder="eco，econ"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="new-root-zh">中文释义</label>
              <input
                id="new-root-zh"
                className="family-meta-input"
                value={newRootZh}
                onChange={(e) => setNewRootZh(e.target.value)}
                placeholder="经济；家"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="new-root-en">英文含义</label>
              <input
                id="new-root-en"
                className="family-meta-input"
                value={newRootEn}
                onChange={(e) => setNewRootEn(e.target.value)}
                placeholder="house; economy"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="new-root-textbook">挂载到教材（可选）</label>
              <select
                id="new-root-textbook"
                className="family-meta-input"
                value={newTextbook}
                onChange={(e) => setNewTextbook(e.target.value)}
              >
                <option value="">我的词根（仅本机）</option>
                {['textbook-1', 'textbook-2', 'textbook-3', 'textbook-4', 'textbook-5', 'textbook-6', 'textbook-7', 'textbook-8'].map((tb) => (
                  <option key={tb} value={tb}>
                    {textbookLabel(tb)}（追加到最底部）
                  </option>
                ))}
              </select>
              <p className="family-meta-hint">
                选择教材后，词根显示在该教材底部；导出修正清单后可固化进全站数据。
              </p>
            </div>
            <div className="family-meta-editor-actions">
              <button
                type="button"
                className="family-meta-save"
                onClick={handleCreateFamily}
                disabled={!newRootName.trim()}
              >
                创建
              </button>
              <button type="button" className="family-meta-cancel" onClick={() => setCreateOpen(false)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {editFamily && (
        <div className="affix-modal-backdrop" onClick={() => setEditFamily(null)} role="presentation">
          <div className="user-family-create" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="user-family-create-title">编辑词根</h3>
            <div className="family-meta-field">
              <label htmlFor="edit-root-name">词根（逗号分隔多个变体，如 jus，jud）</label>
              <input
                id="edit-root-name"
                className="family-meta-input"
                value={editRootsText}
                onChange={(e) => setEditRootsText(e.target.value)}
                placeholder="jus，jud"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="edit-root-zh">中文释义</label>
              <input
                id="edit-root-zh"
                className="family-meta-input"
                value={editZh}
                onChange={(e) => setEditZh(e.target.value)}
                placeholder="法律；公正"
              />
            </div>
            <div className="family-meta-field">
              <label htmlFor="edit-root-textbook">挂载到教材（可选）</label>
              <select
                id="edit-root-textbook"
                className="family-meta-input"
                value={editTextbook}
                onChange={(e) => setEditTextbook(e.target.value)}
              >
                <option value="">我的词根（仅本机）</option>
                {['textbook-1', 'textbook-2', 'textbook-3', 'textbook-4', 'textbook-5', 'textbook-6', 'textbook-7', 'textbook-8'].map((tb) => (
                  <option key={tb} value={tb}>
                    {textbookLabel(tb)}（追加到最底部）
                  </option>
                ))}
              </select>
            </div>
            <div className="family-meta-editor-actions">
              <button
                type="button"
                className="family-meta-save"
                onClick={() => {
                  const roots = editRootsText
                    .split(/[，,、]/)
                    .map((x) => x.trim().toLowerCase().replace(/^-+/, ''))
                    .filter(Boolean);
                  if (roots.length && editFamily) {
                    updateUserFamily(editFamily.id, {
                      roots,
                      meaningZh: editZh.trim(),
                      textbook: editTextbook || undefined,
                    });
                  }
                  setEditFamily(null);
                }}
              >
                保存
              </button>
              <button type="button" className="family-meta-cancel" onClick={() => setEditFamily(null)}>
                取消
              </button>
            </div>
          </div>
        </div>
      )}

      {affixOverlayOpen && (
        <AffixLibraryOverlay
          kind={affixOverlayKind}
          items={affixItems}
          onSaveGroup={onSaveAffixGroup}
          onClose={() => setAffixOverlayOpen(false)}
          kindTabs={(
            <div className="affix-lib-overlay-tabs">
              {(['prefix', 'suffix', 'root'] as AffixKind[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`affix-lib-overlay-tab ${affixOverlayKind === k ? 'active' : ''}`}
                  onClick={() => setAffixOverlayKind(k)}
                >
                  {k === 'prefix' ? '前缀' : k === 'suffix' ? '后缀' : '词根'}
                </button>
              ))}
            </div>
          )}
        />
      )}
    </div>
  );
}
