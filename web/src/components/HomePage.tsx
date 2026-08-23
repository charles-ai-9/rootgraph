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
  removeUserFamily: (id: string) => void;
  getUserFamilyWords: (id: string) => import('../types').WordEntry[];
}

export function HomePage({
  onOpenFamily,
  affixItems,
  onSaveAffixGroup,
  getVideoId,
  getFamilyMeta,
  userFamilies,
  createUserFamily,
  removeUserFamily,
  getUserFamilyWords,
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
  const fileRef = useRef<HTMLInputElement>(null);
  const lastTopTapRef = useRef(0);

  const openUserFamily = (f: UserFamily) => {
    const entry: CatalogEntry = {
      id: f.id,
      file: '',
      chapter: '我的',
      chapterOrder: 999,
      titleZh: f.meaningZh,
      semanticLabel: f.meaningZh,
      meaningEn: f.meaningEn,
      meaningZh: f.meaningZh,
      roots: f.roots,
      wordCount: 0,
      source: 'user',
      textbook: 'user',
    };
    onOpenFamily(entry);
  };

  const handleCreateFamily = () => {
    const roots = newRootName.split(/[，,、]/).map((x) => x.trim().toLowerCase().replace(/^-+/, '')).filter(Boolean);
    if (!roots.length) return;
    const id = roots[0];
    if (userFamilies[id]) {
      setBackupMsg(`词根 ${id} 已存在`);
      return;
    }
    createUserFamily({ id, roots, meaningZh: newRootZh.trim(), meaningEn: newRootEn.trim() });
    setNewRootName('');
    setNewRootZh('');
    setNewRootEn('');
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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return catalog.filter((entry) => {
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
  }, [catalog, filter, textbook, chapterKey]);

  const grouped = useMemo(() => {
    const items = [...filtered].sort((a, b) => {
      if (a.textbook !== b.textbook) {
        return a.textbook.localeCompare(b.textbook);
      }
      return (a.chapterOrder ?? 999) - (b.chapterOrder ?? 999);
    });

    if (textbook !== 'all') {
      return [{ key: textbookLabel(textbook), items }];
    }

    const map = new Map<string, CatalogEntry[]>();
    for (const item of items) {
      const key = textbookLabel(item.textbook);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].map(([key, groupItems]) => ({ key, items: groupItems }));
  }, [filtered, textbook]);

  const totalWords = catalog.reduce((n, c) => n + c.wordCount, 0);
  const hasFilter = filter.trim().length > 0;

  const renderCard = (entry: CatalogEntry) => {
    const meta = getFamilyMeta(catalogEntryKey(entry));
    const roots = meta?.roots?.length ? meta.roots.join(' · ') : displayRoots(entry);
    const semantic = meta?.meaningZh?.trim() || meta?.semantic?.trim() || displaySemantic(entry);
    const videoId = getVideoId(catalogEntryKey(entry));

    return (
      <button
        key={catalogEntryKey(entry)}
        type="button"
        className="library-row"
        onClick={() => onOpenFamily(entry)}
      >
        <span className="library-row-chapter">第{entry.chapter}章</span>
        <span className="library-row-roots">{roots}</span>
        {semantic && <span className="library-row-semantic">{semantic}</span>}
        <span className="library-row-meta">
          <span>{entry.wordCount} 词</span>
          {videoId && <span className="video-chip">🎬 {videoId}</span>}
        </span>
      </button>
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
        onOpenWord={(entry, word) => onOpenFamily(entry, word)}
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
              {items.map((entry) => renderCard(entry))}
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

      {Object.keys(userFamilies).length > 0 && (
        <section className="topic-section">
          <h2 className="topic-section-title">我的词根</h2>
          <div className="library-list">
            {Object.values(userFamilies).map((f) => (
              <div key={f.id} className="library-row user-family-row">
                <button type="button" className="library-row-main" onClick={() => openUserFamily(f)}>
                  <span className="library-row-chapter">我的</span>
                  <span className="library-row-roots">{f.roots.join(' · ')}</span>
                  {f.meaningZh && <span className="library-row-semantic">{f.meaningZh}</span>}
                  <span className="library-row-meta">{getUserFamilyWords(f.id).length} 词</span>
                </button>
                <button
                  type="button"
                  className="user-family-del"
                  title="删除词根"
                  aria-label={`删除 ${f.id}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (window.confirm(`删除词根 ${f.roots.join(' · ')}？其挂入的词会回到原词根族。`)) {
                      removeUserFamily(f.id);
                    }
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

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
