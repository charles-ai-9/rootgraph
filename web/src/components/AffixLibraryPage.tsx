import { useEffect, useMemo, useState } from 'react';
import type { AffixItem, AffixKind } from '../types';
import {
  AFFIX_PAGE_SIZE,
  emptyGroupDraft,
  groupToDraft,
  listGroupsForTable,
  type AffixGroupDraft,
} from '../utils/affixLibrary';
import { AFFIX_SEED_META } from '../data/affixSeed';
import { AFFIX_LIBRARY_TABS, seedKindLabel } from '../data/defaultAffixLibrary';
import { parseAffixFormsLine } from '../utils/affixFormDisplay';
import { renderSimpleMarkdown } from '../utils/markdown';
import { AffixItemModal, type AffixModalMode } from './AffixItemModal';

interface AffixLibraryPageProps {
  items: AffixItem[];
  onBack: () => void;
  onSaveGroup: (draft: AffixGroupDraft) => void;
}

function groupCountForKind(kind: AffixKind): number {
  if (kind === 'root') return AFFIX_SEED_META.rootGroups;
  if (kind === 'prefix') return AFFIX_SEED_META.prefixGroups;
  return AFFIX_SEED_META.suffixGroups;
}

export function AffixLibraryPage({
  items,
  onBack,
  onSaveGroup,
}: AffixLibraryPageProps) {
  const [tab, setTab] = useState<AffixKind>('root');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AffixModalMode>('edit');
  const [draft, setDraft] = useState<AffixGroupDraft>(emptyGroupDraft('root'));

  const rows = useMemo(
    () => listGroupsForTable(items, tab, query),
    [items, tab, query],
  );

  const totalPages = Math.max(1, Math.ceil(rows.length / AFFIX_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [tab, query]);

  const pageRows = useMemo(() => {
    const start = (safePage - 1) * AFFIX_PAGE_SIZE;
    return rows.slice(start, start + AFFIX_PAGE_SIZE);
  }, [rows, safePage]);

  const openEdit = (item: AffixItem) => {
    setModalMode('edit');
    setDraft(groupToDraft(item, items));
    setModalOpen(true);
  };

  const openCreate = () => {
    setModalMode('create');
    setDraft(emptyGroupDraft(tab));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDraft(emptyGroupDraft(tab));
  };

  const saveModal = () => {
    const forms = parseAffixFormsLine(draft.forms.join('，'), tab);
    if (!forms.length) return;
    onSaveGroup({ ...draft, forms, kind: tab });
    closeModal();
  };

  const totalGroups = AFFIX_SEED_META.rootGroups + AFFIX_SEED_META.prefixGroups + AFFIX_SEED_META.suffixGroups;
  const formsColumnLabel = tab === 'root' ? '词根' : '词缀';

  return (
    <div className="affix-admin">
      <div className="affix-admin-frame">
        <header className="affix-admin-header">
          <button type="button" className="back-link" onClick={onBack}>
            ← 返回
          </button>
          <div>
            <h1 className="affix-admin-title">词根词缀库</h1>
            <p className="affix-admin-subtitle">
              内容来自《{AFFIX_SEED_META.source}》· 共 {totalGroups} 组
            </p>
          </div>
        </header>

        <div className="affix-admin-toolbar">
          <div className="affix-kind-tabs">
            {AFFIX_LIBRARY_TABS.map((k) => (
              <button
                key={k}
                type="button"
                className={`affix-kind-tab ${tab === k ? 'active' : ''}`}
                onClick={() => setTab(k)}
              >
                {seedKindLabel(k)}
                <span className="affix-kind-tab-count">{groupCountForKind(k)}</span>
              </button>
            ))}
          </div>
          <input
            className="affix-admin-search"
            placeholder="搜索词缀形、释义…（命中整组）"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="button" className="affix-admin-btn primary" onClick={openCreate}>
            + 新建
          </button>
        </div>

        <div className="affix-admin-list">
          <table className="affix-admin-table affix-admin-table-xlsx">
            <thead>
              <tr>
                <th className="col-order">序号</th>
                <th className="col-forms">{formsColumnLabel}</th>
                <th className="col-meaning">释义</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={3} className="affix-admin-empty">
                    暂无{seedKindLabel(tab)}，点击「新建」添加
                  </td>
                </tr>
              ) : (
                pageRows.map((row) => (
                  <tr key={row.root.id} onClick={() => openEdit(row.root)}>
                    <td className="affix-admin-order">{row.order < 9999 ? row.order : '—'}</td>
                    <td className="affix-admin-forms">{row.formsLabel || '（未命名）'}</td>
                    <td className="affix-admin-meaning">
                      {row.meaning.trim() ? (
                        <div className="note-markdown affix-table-meaning">
                          {renderSimpleMarkdown(row.meaning)}
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {rows.length > AFFIX_PAGE_SIZE && (
            <div className="affix-admin-pagination">
              <button
                type="button"
                className="affix-admin-btn"
                disabled={safePage <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                上一页
              </button>
              <span className="affix-admin-page-info">
                第 {safePage} / {totalPages} 页 · 共 {rows.length} 组
              </span>
              <button
                type="button"
                className="affix-admin-btn"
                disabled={safePage >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                下一页
              </button>
            </div>
          )}
        </div>
      </div>

      <AffixItemModal
        open={modalOpen}
        mode={modalMode}
        kind={tab}
        draft={draft}
        onClose={closeModal}
        onChange={setDraft}
        onSave={saveModal}
      />
    </div>
  );
}
