import { useEffect, useMemo, useState } from 'react';
import type { AffixItem, AffixNoteData, WordAffixKind, WordEntry } from '../types';
import { emptyAffixNote, hasAffixNoteContent } from '../types';
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
  normalizeAffixLabel,
  seedAffixNoteForKind,
} from '../utils/affixNote';
import { parseAffixHints } from '../utils/affixHint';
import { normalizeAffixForm, parseAffixFormsLine } from '../utils/affixFormDisplay';
import { speakWord } from '../utils/speech';
import { AffixGroupFields } from './AffixGroupFields';
import { AffixLibraryOverlay } from './AffixLibraryOverlay';
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
const KIND_PLACEHOLDER: Record<WordAffixKind, string> = { prefix: '如：in-、pre-', suffix: '如：-tion、-able' };
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
  const { index, ready, error: wordIndexError } = useWordIndex();
  const [scope, setScope] = useState<AffixScope>('textbook');
  const [lookup, setLookup] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerQuery, setPickerQuery] = useState('');
  const [groupDraft, setGroupDraft] = useState<AffixGroupDraft | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [clearedSnapshot, setClearedSnapshot] = useState<AffixNoteData | null>(null);

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
    setPickerQuery('');
    setClearedSnapshot(null);
    const seeded = seedAffixNoteForKind(kind, note, word.word, word.mnemonic, word.pos, items);
    if (
      seeded.current !== note.current
      || seeded.knowledge !== note.knowledge
      || seeded.libraryRef !== note.libraryRef
      || seeded.inferred !== note.inferred
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

  /** 助记中明确标注了该词缀的词才可信；其余仅拼写匹配，可能不含该词缀 */
  const { verified, unverified } = useMemo(() => {
    const target = normalizeAffixLabel(lookup ?? effective.current);
    if (!target) return { verified: related, unverified: [] };
    const verified = related.filter((row) => row.word === word.word
      || parseAffixHints(row.mnemonic).some((h) => h.kind === kind && normalizeAffixLabel(h.form) === target));
    return { verified, unverified: related.filter((row) => !verified.includes(row)) };
  }, [related, lookup, effective.current, kind, word.word]);

  const affixLabels = useMemo(() => {
    if (linked) return getItemGroup(linked, items).map((i) => i.name);
    const label = (effective.current || note.current).trim();
    return label ? [label] : [];
  }, [linked, items, effective.current, note.current]);

  const wordHighlight = useMemo(
    () => highlightWordAffix(word.word, affixLabels, kind),
    [word.word, affixLabels, kind],
  );

  const currentForm = (note.current || effective.current).trim();
  const isEmptySeed = !isLinked && !currentForm;

  const isNewAffix = useMemo(() => {
    if (isLinked) return false;
    const form = (note.current || effective.current).trim();
    if (!form) return false;
    return !findItemByForm(items, form, kind);
  }, [isLinked, note.current, effective.current, items, kind]);

  /** 用户主动编辑/选择即视为撤销「无词缀」/「推断」标记 */
  const updateLocal = (field: keyof AffixNoteData, value: string) =>
    onChange({ ...patch(note, field, value), suppressed: undefined, inferred: undefined });

  const handleReference = (item: AffixItem) => {
    onChange({
      libraryRef: item.id,
      current: item.name,
      variants: note.variants,
      knowledge: item.meaning,
      evolution: note.evolution,
      suppressed: undefined,
      inferred: undefined,
    });
    setShowPicker(false);
    setPickerQuery('');
    setLookup(item.name);
  };

  /** 解除引用 / 无此词缀：清空全部字段并标记已确认，自动推断不再回填 */
  const handleClearAffix = () => {
    setClearedSnapshot(note);
    onChange({ ...emptyAffixNote(), suppressed: true });
    setShowPicker(false);
    setPickerQuery('');
    setLookup(null);
  };

  const handleUndoClear = () => {
    if (!clearedSnapshot) return;
    onChange({ ...clearedSnapshot, suppressed: undefined });
    setLookup(clearedSnapshot.current.trim() || null);
    setClearedSnapshot(null);
  };

  /** picker 搜索无结果时，直接新建该词缀并绑定 */
  const handleCreateAndBind = () => {
    const form = normalizeAffixForm(pickerQuery.trim(), kind);
    if (!form) return;
    const saved = onSaveToLibrary({ current: form, knowledge: '', variants: '', evolution: '' });
    onChange({
      libraryRef: saved.id,
      current: saved.name,
      variants: note.variants,
      knowledge: saved.meaning,
      evolution: note.evolution,
      suppressed: undefined,
      inferred: undefined,
    });
    setShowPicker(false);
    setPickerQuery('');
    setLookup(saved.name);
  };

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
    if (match) {
      onChange({ ...note, libraryRef: match.id, current: label, knowledge: '', suppressed: undefined, inferred: undefined });
    }
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
          <div className="affix-modal-header-actions">
            {onOpenLibrary && (
              <button type="button" className="affix-action-btn subtle" onClick={() => setLibraryOpen(true)}>词缀库管理</button>
            )}
            <button type="button" className="affix-modal-close" onClick={onClose} aria-label="关闭">×</button>
          </div>
        </header>

        <div className="affix-modal-body compact">
          {clearedSnapshot && (
            <div className="affix-cleared-hint">
              <span>
                已标记：{word.word} 暂未识别到{KIND_LABEL[kind]}，自动推断已停止
              </span>
              <button type="button" className="affix-cleared-undo" onClick={handleUndoClear}>撤销</button>
            </div>
          )}

          {!isLinked && (
            <div className="affix-modal-actions">
              <button type="button" className="affix-action-btn" onClick={() => setShowPicker((v) => !v)}>引用词缀库</button>
              {currentForm && (
                <button type="button" className="affix-action-btn subtle" onClick={handleClearAffix}>
                  无此{KIND_LABEL[kind]}
                </button>
              )}
              <button
                type="button"
                className={`affix-action-btn ${isNewAffix ? 'primary' : ''}`}
                onClick={handleSave}
                disabled={!currentForm}
                title={currentForm ? undefined : '先输入词缀形'}
              >
                {isNewAffix ? '新建并绑定' : '保存到词缀库'}
              </button>
            </div>
          )}

          {isLinked && linked && groupDraft && (
            <div className="affix-linked-card affix-linked-editable">
              <div className="affix-linked-head">
                <div>
                  <span className="affix-linked-tag">词缀库</span>
                  <span className="affix-linked-name">{linked.name}</span>
                  {linked.pos && <span className="affix-linked-pos">{linked.pos}</span>}
                </div>
                <div className="affix-linked-actions">
                  <button type="button" className="affix-ref-swap" onClick={() => setShowPicker((v) => !v)}>{showPicker ? '收起' : '更换'}</button>
                  <button type="button" className="affix-ref-unlink" onClick={handleClearAffix}>解除引用</button>
                </div>
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
              {isEmptySeed && (
                <p className="affix-empty-hint">
                  未检测到 {word.word} 的{KIND_LABEL[kind]}。输入你识别到的{KIND_LABEL[kind]}形，或点「引用词缀库」从已有条目中选择。
                </p>
              )}
              <div className="affix-chalk-row is-current">
                <span className="affix-chalk-prefix">词缀形</span>
                <input
                  className="affix-chalk-input is-highlight"
                  value={note.current}
                  placeholder={KIND_PLACEHOLDER[kind]}
                  onChange={(e) => { updateLocal('current', e.target.value); setLookup(e.target.value); }}
                  onBlur={() => note.current.trim() && tryAutoLink(note.current)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      // 与失焦一致：Enter 即完成输入，命中库内条目则自动绑定
                      if (note.current.trim()) tryAutoLink(note.current);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                />
                {currentForm && (
                  isNewAffix
                    ? <span className="affix-lib-state-tag not-in">未入库</span>
                    : <span className="affix-lib-state-tag in">已在库中</span>
                )}
              </div>
              <div className="affix-chalk-field">
                <span className="affix-chalk-label-text">含义</span>
                <NoteEditor value={note.knowledge} placeholder="含义" onChange={(v) => updateLocal('knowledge', v)} minRows={2} />
              </div>
              {isNewAffix && note.current.trim() && (
                <p className="affix-new-hint">
                  词缀库中暂无「{note.current.trim()}」，点击「新建并绑定」即可创建并关联到 {word.word}
                </p>
              )}
              {isEmptySeed && (
                <button type="button" className="affix-empty-exit" onClick={() => { onChange({ ...note, suppressed: true }); onClose(); }}>
                  该词无{KIND_LABEL[kind]}，关闭
                </button>
              )}
            </>
          )}

          {showPicker && (
            <div className="affix-ref-picker">
              <input
                className="affix-ref-picker-search"
                type="text"
                placeholder="搜索词缀形或释义…"
                value={pickerQuery}
                onChange={(e) => setPickerQuery(e.target.value)}
                autoFocus
              />
              {(() => {
                const q = pickerQuery.trim().toLowerCase();
                const filtered = q
                  ? ranked.filter((item) => item.name.toLowerCase().includes(q) || item.meaning.toLowerCase().includes(q))
                  : ranked;
                const candidateForm = normalizeAffixForm(pickerQuery.trim(), kind);
                const canCreate = Boolean(candidateForm) && !findItemByForm(items, pickerQuery.trim(), kind);
                return (
                  <>
                    {filtered.slice(0, 20).map((item) => {
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
                    {canCreate && (
                      <button type="button" className="affix-ref-option affix-ref-option-create" onClick={handleCreateAndBind}>
                        <span className="affix-ref-option-title">新建「{candidateForm}」并绑定</span>
                        <span className="affix-ref-option-meta">词缀库中暂无此{KIND_LABEL[kind]}，点击创建并关联到 {word.word}</span>
                      </button>
                    )}
                    {filtered.length === 0 && !canCreate && (
                      <p className="affix-chalk-muted">无匹配词缀</p>
                    )}
                  </>
                );
              })()}
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
              {wordIndexError ? <p className="affix-chalk-muted">单词索引加载失败</p> : !ready ? <p className="affix-chalk-muted">加载中…</p> : related.length === 0 ? (
                <p className="affix-chalk-muted">暂无</p>
              ) : (
                <>
                  {verified.length > 0 && (
                    <p className="affix-chalk-words">
                      {verified.map((m, i) => (
                        <span key={`${m.textbook}-${m.familyId}-${m.word}`}>
                          {i > 0 && '、'}
                          <button type="button" className={`affix-chalk-word-link ${m.word === word.word ? 'is-current' : ''}`} onClick={() => { onJumpWord(m.word); onClose(); }}>{m.word}</button>
                          <button
                            type="button"
                            className="word-speak-btn inline"
                            title="朗读"
                            aria-label={`朗读 ${m.word}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              speakWord(m.word);
                            }}
                          >
                            🔊
                          </button>
                        </span>
                      ))}
                    </p>
                  )}
                  {unverified.length > 0 && (
                    <>
                      <p className="affix-same-unverified-label">以下仅拼写匹配，助记未确认含该{KIND_LABEL[kind]}</p>
                      <p className="affix-chalk-words is-unverified">
                        {unverified.map((m, i) => (
                          <span key={`${m.textbook}-${m.familyId}-${m.word}`}>
                            {i > 0 && '、'}
                            <button type="button" className={`affix-chalk-word-link ${m.word === word.word ? 'is-current' : ''}`} onClick={() => { onJumpWord(m.word); onClose(); }}>{m.word}</button>
                          <button
                            type="button"
                            className="word-speak-btn inline"
                            title="朗读"
                            aria-label={`朗读 ${m.word}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              speakWord(m.word);
                            }}
                          >
                            🔊
                          </button>
                          </span>
                        ))}
                      </p>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {libraryOpen && (
        <AffixLibraryOverlay
          kind={kind}
          items={items}
          onSaveGroup={onSaveGroup}
          onClose={() => setLibraryOpen(false)}
        />
      )}
    </div>
  );
}

export function affixButtonLabel(note: AffixNoteData, kind: WordAffixKind): string {
  return note.libraryRef ? `${kind === 'prefix' ? '前缀' : '后缀'} ↗` : kind === 'prefix' ? '前缀' : '后缀';
}

export function affixButtonHasDot(note: AffixNoteData, kind: WordAffixKind, mnemonic?: string, word?: string, pos?: string): boolean {
  return hasAffixNoteContent(note) || Boolean(word && hasInferredAffix(word, kind, pos, mnemonic));
}
