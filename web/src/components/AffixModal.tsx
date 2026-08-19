import { useEffect, useMemo, useState } from 'react';
import type { AffixItem, AffixNoteData, WordAffixKind, WordEntry } from '../types';
import { hasAffixNoteContent } from '../types';
import { findWordsByAffix, type AffixScope, useWordIndex } from '../hooks/useWordIndex';
import {
  findItemByForm,
  getItemGroup,
  groupToDraft,
  rankItems,
  resolveAffixNote,
  type AffixGroupDraft,
} from '../utils/affixLibrary';
import {
  affixFormForSearch,
  hasInferredAffix,
  highlightWordAffix,
  hintSummaryForKind,
  seedAffixNoteForKind,
} from '../utils/affixNote';
import { parseAffixFormsLine } from '../utils/affixFormDisplay';
import { AffixGroupFields } from './AffixGroupFields';
import { NoteEditor } from './NoteEditor';

interface AffixModalProps {
  open: boolean;
  kind: WordAffixKind;
  word: WordEntry;
  note: AffixNoteData;
  items: AffixItem[];
  getItem: (id: string) => AffixItem | undefined;
  textbook: string;
  familyId: string;
  onClose: () => void;
  onChange: (note: AffixNoteData) => void;
  onJumpWord: (word: string) => void;
  onSaveToLibrary: (note: AffixNoteData) => AffixItem;
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onOpenLibrary?: () => void;
}

const KIND_LABEL: Record<WordAffixKind, string> = { prefix: '前缀', suffix: '后缀' };
const KIND_PLACEHOLDER: Record<WordAffixKind, string> = { prefix: 'pro-', suffix: '-cess' };
const SCOPE_LABEL: Record<AffixScope, string> = {
  family: '本章',
  textbook: '本教材',
  all: '全库',
};

function patch(note: AffixNoteData, field: keyof AffixNoteData, value: string): AffixNoteData {
  return { ...note, [field]: value };
}

export function AffixModal({
  open,
  kind,
  word,
  note,
  items,
  getItem,
  textbook,
  familyId,
  onClose,
  onChange,
  onJumpWord,
  onSaveToLibrary,
  onSaveGroup,
  onOpenLibrary,
}: AffixModalProps) {
  const { index, ready } = useWordIndex();
  const [scope, setScope] = useState<AffixScope>('textbook');
  const [lookup, setLookup] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [groupDraft, setGroupDraft] = useState<AffixGroupDraft | null>(null);

  const linked = note.libraryRef ? getItem(note.libraryRef) : undefined;
  const effective = resolveAffixNote(note, linked);
  const isLinked = Boolean(note.libraryRef && linked);
  const groupRoot = linked
    ? items.find((i) => i.id === (linked.parentId ?? linked.id))
    : undefined;

  useEffect(() => {
    if (!open || !groupRoot) {
      setGroupDraft(null);
      return;
    }
    setGroupDraft(groupToDraft(groupRoot, items));
  }, [open, groupRoot?.id, groupRoot?.updatedAt, items]); // eslint-disable-line react-hooks/exhaustive-deps

  /** saveGroup 保留 id，但若引用已失效则按词缀形重新关联 */
  useEffect(() => {
    if (!open || !note.libraryRef) return;
    if (getItem(note.libraryRef)) return;
    const label = note.current.trim() || linked?.name || '';
    if (!label) return;
    const match = findItemByForm(items, label, kind);
    if (match) {
      onChange({ ...note, libraryRef: match.id, current: match.name });
    }
  }, [open, items, note.libraryRef, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const mnemonicHint = hintSummaryForKind(word.mnemonic, kind);
  const ranked = useMemo(
    () => rankItems(items, effective.current || note.current, kind),
    [items, effective.current, note.current, kind],
  );

  useEffect(() => {
    if (!open) return;
    setShowPicker(false);
    const seeded = seedAffixNoteForKind(kind, note, word.word, word.mnemonic, word.pos, items);
    if (
      seeded.current !== note.current
      || seeded.knowledge !== note.knowledge
      || seeded.libraryRef !== note.libraryRef
    ) {
      onChange(seeded);
    }
    const primary = seeded.libraryRef ? getItem(seeded.libraryRef)?.name ?? seeded.current : seeded.current;
    setLookup(primary.trim() || null);
  }, [open, kind, word.word]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const related = useMemo(() => {
    const target = lookup ?? effective.current;
    const parsed = affixFormForSearch(target);
    if (!parsed || !ready) return [];
    return findWordsByAffix(index, parsed.form, kind, scope, { textbook, familyId }, 30);
  }, [lookup, effective.current, ready, index, scope, textbook, familyId, kind]);

  const affixLabels = useMemo(() => {
    if (linked) return getItemGroup(linked, items).map((i) => i.name);
    const label = (effective.current || note.current).trim();
    return label ? [label] : [];
  }, [linked, items, effective.current, note.current]);

  const wordHighlight = useMemo(
    () => highlightWordAffix(word.word, affixLabels, kind),
    [word.word, affixLabels, kind],
  );

  const updateLocal = (field: keyof AffixNoteData, value: string) => onChange(patch(note, field, value));

  const handleReference = (item: AffixItem) => {
    onChange({
      libraryRef: item.id,
      current: note.current.trim() || item.name,
      variants: note.variants,
      knowledge: '',
      evolution: note.evolution,
    });
    setShowPicker(false);
    setLookup(item.name);
  };

  const handleUnlink = () => onChange({ ...note, libraryRef: undefined });

  const commitToLibrary = (patch: { forms?: string[]; meaning?: string }) => {
    if (!groupDraft?.rootId) return;
    const merged = {
      ...groupDraft,
      forms: patch.forms ?? groupDraft.forms,
      meaning: patch.meaning ?? groupDraft.meaning,
    };
    const forms = parseAffixFormsLine(merged.forms.join('，'), kind);
    if (!forms.length) return;
    setGroupDraft({ ...merged, forms });
    onSaveGroup({ ...merged, forms, kind });
  };

  const handleSave = () => {
    const saved = onSaveToLibrary({ ...note, current: (note.current || effective.current).trim() });
    onChange({ libraryRef: saved.id, current: saved.name, variants: note.variants, knowledge: '', evolution: note.evolution });
  };

  const tryAutoLink = (label: string) => {
    const match = findItemByForm(items, label, kind);
    if (match) onChange({ ...note, libraryRef: match.id, current: label, knowledge: '' });
  };

  if (!open) return null;

  return (
    <div className="affix-modal-backdrop" onClick={onClose} role="presentation">
      <div className="affix-modal affix-modal-compact" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <header className="affix-modal-header compact">
          <h2 className="affix-modal-title compact">
            <span className="affix-modal-word">
              {wordHighlight ? (
                <>
                  {wordHighlight.before}
                  <mark className={`affix-modal-word-mark is-${kind}`}>{wordHighlight.mark}</mark>
                  {wordHighlight.after}
                </>
              ) : (
                word.word
              )}
            </span>
            <span className="affix-modal-sub">{KIND_LABEL[kind]}</span>
          </h2>
          <button type="button" className="affix-modal-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="affix-modal-body compact">
          <div className="affix-modal-actions">
            {!isLinked && (
              <button type="button" className="affix-action-btn" onClick={() => setShowPicker((v) => !v)}>引用词缀库</button>
            )}
            {!isLinked && (
              <button type="button" className="affix-action-btn" onClick={handleSave}>
                保存到词缀库
              </button>
            )}
            {onOpenLibrary && (
              <button type="button" className="affix-action-btn subtle" onClick={onOpenLibrary}>词缀库管理</button>
            )}
          </div>

          {isLinked && linked && groupDraft && (
            <div className="affix-linked-card affix-linked-editable">
              <div className="affix-linked-head">
                <div>
                  <span className="affix-linked-tag">词缀库</span>
                  <span className="affix-linked-name">{linked.name}</span>
                  {linked.pos && <span className="affix-linked-pos">{linked.pos}</span>}
                </div>
                <button type="button" className="affix-ref-unlink" onClick={handleUnlink}>解除引用</button>
              </div>
              <AffixGroupFields
                key={groupDraft.rootId ?? groupRoot?.id}
                kind={kind}
                forms={groupDraft.forms}
                meaning={groupDraft.meaning}
                onFormsChange={(forms) => setGroupDraft({ ...groupDraft, forms })}
                onMeaningChange={(meaning) => setGroupDraft({ ...groupDraft, meaning })}
                onFormsComplete={(forms) => commitToLibrary({ forms })}
                onMeaningComplete={(meaning) => commitToLibrary({ meaning })}
              />
            </div>
          )}

          {!isLinked && (
            <>
              {mnemonicHint && <p className="affix-chalk-hint">助记：{mnemonicHint}</p>}
              <div className="affix-chalk-row is-current">
                <span className="affix-chalk-prefix">本词</span>
                <input
                  className="affix-chalk-input is-highlight"
                  value={note.current}
                  placeholder={KIND_PLACEHOLDER[kind]}
                  onChange={(e) => { updateLocal('current', e.target.value); setLookup(e.target.value); }}
                  onBlur={() => note.current.trim() && tryAutoLink(note.current)}
                />
              </div>
              <div className="affix-chalk-field">
                <span className="affix-chalk-label-text">含义</span>
                <NoteEditor value={note.knowledge} placeholder="含义" onChange={(v) => updateLocal('knowledge', v)} minRows={2} />
              </div>
            </>
          )}

          {showPicker && !isLinked && (
            <div className="affix-ref-picker">
              {ranked.slice(0, 20).map((item) => {
                const group = getItemGroup(item, items);
                return (
                  <button key={item.id} type="button" className="affix-ref-option" onClick={() => handleReference(item)}>
                    <span className="affix-ref-option-title">
                      {item.name}
                      {item.pos && <em>{item.pos}</em>}
                    </span>
                    <span className="affix-ref-option-meta">{item.meaning}</span>
                    {group.length > 1 && (
                      <span className="affix-ref-option-group">{group.map((g) => g.name).join(' · ')}</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {(lookup ?? effective.current).trim() && (
            <div className="affix-chalk-related">
              <div className="affix-chalk-related-head">
                <span className="affix-chalk-label-inline">同缀词 · {lookup ?? effective.current}</span>
                <div className="affix-scope-tabs mini">
                  {(Object.keys(SCOPE_LABEL) as AffixScope[]).map((s) => (
                    <button key={s} type="button" className={`affix-scope-tab ${scope === s ? 'active' : ''}`} onClick={() => setScope(s)}>{SCOPE_LABEL[s]}</button>
                  ))}
                </div>
              </div>
              {!ready ? <p className="affix-chalk-muted">加载中…</p> : related.length === 0 ? (
                <p className="affix-chalk-muted">暂无</p>
              ) : (
                <p className="affix-chalk-words">
                  {related.map((m, i) => (
                    <span key={`${m.textbook}-${m.familyId}-${m.word}`}>
                      {i > 0 && '、'}
                      <button type="button" className={`affix-chalk-word-link ${m.word === word.word ? 'is-current' : ''}`} onClick={() => { onJumpWord(m.word); onClose(); }}>{m.word}</button>
                    </span>
                  ))}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function affixButtonLabel(note: AffixNoteData, kind: WordAffixKind): string {
  return note.libraryRef ? `${kind === 'prefix' ? '前缀' : '后缀'} ↗` : kind === 'prefix' ? '前缀' : '后缀';
}

export function affixButtonHasDot(note: AffixNoteData, kind: WordAffixKind, mnemonic?: string, word?: string, pos?: string): boolean {
  return hasAffixNoteContent(note) || Boolean(word && hasInferredAffix(word, kind, pos, mnemonic));
}
