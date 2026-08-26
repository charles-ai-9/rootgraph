import type { AffixKind } from '../types';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { seedKindLabel } from '../data/defaultAffixLibrary';
import { AffixGroupFields } from './AffixGroupFields';

export type AffixModalMode = 'create' | 'edit';

interface AffixItemModalProps {
  open: boolean;
  mode: AffixModalMode;
  kind: AffixKind;
  draft: AffixGroupDraft;
  onClose: () => void;
  onChange: (draft: AffixGroupDraft) => void;
  onSave: () => void;
}

export function AffixItemModal({
  open,
  mode,
  kind,
  draft,
  onClose,
  onChange,
  onSave,
}: AffixItemModalProps) {
  if (!open) return null;

  return (
    <div className="affix-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="affix-item-modal affix-item-modal-compact"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="affix-item-modal-head">
          <span className="affix-item-modal-kind">
            {seedKindLabel(kind)} · {mode === 'create' ? '新建' : '编辑'}
          </span>
          <button type="button" className="affix-modal-close" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </header>

        <div className="affix-item-modal-body">
          <AffixGroupFields
            kind={kind}
            forms={draft.forms}
            meaning={draft.meaning}
            onFormsChange={(forms) => onChange({ ...draft, forms })}
            onMeaningChange={(meaning) => onChange({ ...draft, meaning })}
          />
        </div>

        <footer className="affix-item-modal-foot">
          <button type="button" className="affix-admin-btn primary" onClick={onSave}>
            保存
          </button>
          <button type="button" className="affix-admin-btn" onClick={onClose}>
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}
