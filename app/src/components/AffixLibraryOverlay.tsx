import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AffixItem, AffixKind } from '../types';
import {
  emptyGroupDraft,
  groupToDraft,
  listGroupsForTable,
  type AffixGroupDraft,
} from '../utils/affixLibrary';
import { seedKindLabel } from '../data/defaultAffixLibrary';
import { parseAffixFormsLine } from '../utils/affixFormDisplay';
import { renderSimpleMarkdown } from '../utils/markdown';
import { AffixItemModal, type AffixModalMode } from './AffixItemModal';

interface AffixLibraryOverlayProps {
  kind: AffixKind;
  items: AffixItem[];
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onClose: () => void;
  /** 可选：渲染在标题下方的 Tab 切换器（用于首页弹窗切换前缀/后缀/词根） */
  kindTabs?: ReactNode;
}

export function AffixLibraryOverlay({
  kind,
  items,
  onSaveGroup,
  onClose,
  kindTabs,
}: AffixLibraryOverlayProps) {
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<AffixModalMode>('edit');
  const [draft, setDraft] = useState<AffixGroupDraft>(emptyGroupDraft(kind));

  const rows = useMemo(
    () => listGroupsForTable(items, kind, query),
    [items, kind, query],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalOpen) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, modalOpen]);

  const openEdit = (item: AffixItem) => {
    setModalMode('edit');
    setDraft(groupToDraft(item, items));
    setModalOpen(true);
  };

  const openCreate = () => {
    setModalMode('create');
    setDraft(emptyGroupDraft(kind));
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setDraft(emptyGroupDraft(kind));
  };

  const saveModal = () => {
    const forms = parseAffixFormsLine(draft.forms.join('，'), kind);
    if (!forms.length) return;
    onSaveGroup({ ...draft, forms, kind });
    closeModal();
  };

  const kindLabel = seedKindLabel(kind);

  return (
    <div className="affix-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="affix-lib-overlay"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="affix-lib-overlay-head">
          <h2 className="affix-lib-overlay-title">{kindLabel}库</h2>
          <div className="affix-lib-overlay-head-actions">
            <button type="button" className="affix-admin-btn primary small" onClick={openCreate}>
              + 新建
            </button>
            <button type="button" className="affix-modal-close" onClick={onClose} aria-label="关闭">×</button>
          </div>
        </header>

        {kindTabs}

        <div className="affix-lib-overlay-search-wrap">
          <input
            className="affix-lib-overlay-search"
            placeholder={`搜索${kindLabel}形、释义…（命中整组）`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        <div className="affix-lib-overlay-list">
          {rows.length === 0 ? (
            <p className="affix-lib-overlay-empty">
              {query.trim() ? `未找到匹配的${kindLabel}` : `暂无${kindLabel}，点击「新建」添加`}
            </p>
          ) : (
            <table className="affix-admin-table">
              <thead>
                <tr>
                  <th className="col-forms">{kind === 'root' ? '词根' : '词缀'}</th>
                  <th className="col-meaning">释义</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.root.id} onClick={() => openEdit(row.root)}>
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
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <AffixItemModal
        open={modalOpen}
        mode={modalMode}
        kind={kind}
        draft={draft}
        onClose={closeModal}
        onChange={setDraft}
        onSave={saveModal}
      />
    </div>
  );
}
