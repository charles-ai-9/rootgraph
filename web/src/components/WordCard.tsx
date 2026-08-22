import { useEffect, useState } from 'react';
import type { AffixItem, AffixNoteData, WordAffixKind, WordAffixNotes, WordEntry } from '../types';
import { copyText } from '../utils/clipboard';
import { haptic } from '../utils/haptics';
import { speakWord } from '../utils/speech';
import { analyzeWordRoots, rootsForWord } from '../utils/rootHighlight';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { AffixModal, affixButtonHasDot, affixButtonLabel } from './AffixModal';
import { NoteEditor } from './NoteEditor';
import { RootText } from './RootText';

const MD_PLACEHOLDER = '点击编辑（支持 **粗体** *斜体* `代码` 与 - 列表）';

export interface WordCardProps {
  word: WordEntry;
  familyRoots: string[];
  textbook: string;
  familyId: string;
  personalNote: string;
  mnemonicNote: string;
  collocationsNote: string;
  examplesNote: string[]; // 用户自定义例句
  affixNotes: WordAffixNotes;
  items: AffixItem[];
  getItem: (id: string) => AffixItem | undefined;
  onSaveToLibrary: (kind: WordAffixKind, note: AffixNoteData) => AffixItem;
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onOpenAffixLibrary: () => void;
  /** 初始折叠（笔记风默认折叠，点击词行展开）；false = 初始展开（复习弹窗/深链） */
  defaultCollapsed?: boolean;
  /** 深链定位高亮 */
  highlighted?: boolean;
  cardDomId?: string;
  onNote: (text: string) => void;
  onMnemonicNote: (text: string) => void;
  onCollocationsNote: (text: string) => void;
  onExamplesNote: (examples: string[]) => void;
  onAffixNote: (kind: WordAffixKind, note: AffixNoteData) => void;
}

function AffixKindButton({
  kind,
  note,
  word,
  onOpen,
}: {
  kind: WordAffixKind;
  note: AffixNoteData;
  word: WordEntry;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      className={`affix-open-btn ${affixButtonHasDot(note, kind, word.mnemonic, word.word, word.pos) ? 'has-note' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
    >
      {affixButtonLabel(note, kind)}
    </button>
  );
}

export function WordCard({
  word,
  familyRoots,
  textbook,
  familyId,
  personalNote,
  mnemonicNote,
  collocationsNote,
  examplesNote,
  affixNotes,
  items,
  getItem,
  onSaveToLibrary,
  onSaveGroup,
  onOpenAffixLibrary,
  defaultCollapsed = true,
  highlighted = false,
  cardDomId,
  onNote,
  onMnemonicNote,
  onCollocationsNote,
  onExamplesNote,
  onAffixNote,
}: WordCardProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  const [openSections, setOpenSections] = useState<Set<string>>(new Set());
  const [showAddRow, setShowAddRow] = useState(false);
  const [copied, setCopied] = useState(false);
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [suffixOpen, setSuffixOpen] = useState(false);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /** 深链/搜索定位聚焦时自动展开详情（同页点击不重挂载，需显式展开） */
  useEffect(() => {
    if (highlighted) setExpanded(true);
  }, [highlighted]);
  const highlightRoots = rootsForWord(familyRoots, word.word, word.rootHint, mnemonicNote);
  const rootAnalysis = analyzeWordRoots(familyRoots, word.word, word.rootHint, mnemonicNote);
  const hasMnemonic = Boolean(mnemonicNote.trim());
  const hasCollocations = Boolean(collocationsNote.trim());
  const hasExamples = examplesNote.length > 0;
  const hasPersonalNote = Boolean(personalNote.trim());
  const hasAffixNote = Boolean(affixNotes.prefix.libraryRef || affixNotes.suffix.libraryRef
    || affixNotes.prefix.current.trim() || affixNotes.suffix.current.trim());
  const hasExtra = Boolean(
    hasMnemonic
      || hasCollocations
      || hasExamples
      || word.etymology,
  );
  const hasAnyNote = hasPersonalNote || hasExtra || hasAffixNote;
  const hasAnyEmpty = !hasPersonalNote || !hasMnemonic || !hasCollocations || !hasExamples;

  const handleCopyWord = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(word.word);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const jumpToWord = (target: string) => {
    // 多帧重试 + 居中定位（弹窗关闭后目标卡可能尚未就绪）
    let tries = 0;
    const tryScroll = () => {
      const el =
        document.getElementById(`word-${target}`)
        ?? document.querySelector(`[id^="word-${CSS.escape(target)}-"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      if (tries < 6) {
        tries += 1;
        window.requestAnimationFrame(tryScroll);
      }
    };
    tryScroll();
  };

  const variant = rootAnalysis.primary?.isVariant ? rootAnalysis.primary : null;

  return (
    <>
      <article
        className={`word-card ${expanded ? 'is-expanded' : 'is-collapsed'} ${highlighted ? 'is-highlighted' : ''}`}
        id={cardDomId ?? `word-${word.word}`}
      >
        <header
          className="word-card-head"
          role="button"
          aria-expanded={expanded}
          onClick={() => {
            setExpanded((v) => !v);
            haptic(6);
          }}
          title={expanded ? '点击收起' : '点击展开'}
        >
          <span className={`word-card-toggle ${expanded ? 'open' : ''}`}>{expanded ? '▾' : '▸'}</span>

          {/* 顺序：正常单词（点击朗读）→ 拆分高亮（点击复制）→ 音标/词性/释义 → 前缀/后缀（最右） */}
          <span
            className="word-plain"
            title="点击朗读"
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              speakWord(word.word);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.stopPropagation();
                speakWord(word.word);
              }
            }}
          >
            {word.word}
          </span>

          <button
            type="button"
            className="word-speak-btn"
            title="朗读"
            aria-label={`朗读 ${word.word}`}
            onClick={(e) => {
              e.stopPropagation();
              speakWord(word.word);
            }}
          >
            🔊
          </button>

          <span className={`word-head-word ${copied ? 'word-copied' : ''}`}>
            <RootText text={word.word} catalogRoots={familyRoots} matchRoots={highlightRoots} />
          </span>
          <button
            type="button"
            className={`word-copy-btn ${copied ? 'is-copied' : ''}`}
            title="复制单词"
            aria-label={`复制 ${word.word}`}
            onClick={handleCopyWord}
          >
            <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
              <rect x="5.6" y="5.6" width="7.8" height="7.8" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
              <path d="M10.6 3.4h-6a1 1 0 0 0-1 1v6" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            </svg>
          </button>

          {word.phonetic && <span className="word-phonetic">/{word.phonetic}/</span>}

          {word.pos && (
            <span className={`word-pos-inline ${expanded ? 'is-hidden' : ''}`}>{word.pos}</span>
          )}

          {variant?.canonical && (
            <span
              className="word-root-tag is-variant is-inline"
              title={`${variant.canonical} 的变体 ${variant.form}`}
            >
              {variant.canonical}
              <span className="word-root-tag-arrow">→</span>
              {variant.form}
            </span>
          )}

          {word.definition && (
            <span className={`word-card-def-inline ${expanded ? 'is-hidden' : ''}`}>{word.definition}</span>
          )}

          <div className="affix-open-group">
            <AffixKindButton
              kind="prefix"
              note={affixNotes.prefix}
              word={word}
              onOpen={() => setPrefixOpen(true)}
            />
            <AffixKindButton
              kind="suffix"
              note={affixNotes.suffix}
              word={word}
              onOpen={() => setSuffixOpen(true)}
            />
          </div>

          {hasAnyNote && (
            <span className="word-has-note-dot" title="有笔记/词缀记录">●</span>
          )}

          {copied && <span className="copy-hint">已复制</span>}
        </header>

        {expanded && (
          <div className="word-card-body">
            {(word.pos || word.definition) && (
              <div className="word-card-def">
                {word.pos && <span className="pos-tag">{word.pos}</span>}
                <span className="word-def-text">{word.definition}</span>
                {word.frequency != null && (
                  <span className="freq-tag">词频 {word.frequency}</span>
                )}
              </div>
            )}

            {/* 有啥显示啥：只有有内容的区块才展示；空白统一收敛到「＋ 添加」入口 */}
            {hasPersonalNote && (
              <section className="word-card-notes personal-note-block">
                <h4>我的笔记</h4>
                <NoteEditor
                  value={personalNote}
                  placeholder={MD_PLACEHOLDER}
                  onChange={onNote}
                  minRows={2}
                />
              </section>
            )}

            <div className="word-card-extra">
              {hasMnemonic && (
                <section className="word-card-notes editable-note-block">
                  <h4>推理链</h4>
                  <NoteEditor
                    value={mnemonicNote}
                    placeholder={MD_PLACEHOLDER}
                    onChange={onMnemonicNote}
                    minRows={2}
                  />
                </section>
              )}

              {hasCollocations && (
                <section className="word-card-notes editable-note-block">
                  <h4>搭配</h4>
                  <NoteEditor
                    value={collocationsNote}
                    placeholder={MD_PLACEHOLDER}
                    onChange={onCollocationsNote}
                    minRows={2}
                  />
                </section>
              )}

              {hasExamples && (
                <section className="word-card-notes editable-note-block">
                  <h4>例句</h4>
                  <NoteEditor
                    value={examplesNote.join('\n')}
                    placeholder={MD_PLACEHOLDER}
                    onChange={(text) => {
                      const lines = text.split('\n').filter((line) => line.trim());
                      onExamplesNote(lines);
                    }}
                    minRows={2}
                  />
                </section>
              )}

              {word.etymology && (
                <section>
                  <h4>词源</h4>
                  <p className="muted-text">{word.etymology}</p>
                </section>
              )}
            </div>

            {/* 空白区块：统一入口，点击展开可添加项 */}
            {hasAnyEmpty && !showAddRow && (
              <button type="button" className="word-add-btn" onClick={() => setShowAddRow(true)}>
                ＋ 添加
              </button>
            )}

            {hasAnyEmpty && showAddRow && (
              <div className="word-card-add-row">
                {(!hasPersonalNote && !openSections.has('note')) && (
                  <button type="button" className="empty-note-row" onClick={() => toggleSection('note')}>
                    <span className="empty-note-plus">＋</span> 我的笔记
                  </button>
                )}
                {(!hasMnemonic && !openSections.has('chain')) && (
                  <button type="button" className="empty-note-row" onClick={() => toggleSection('chain')}>
                    <span className="empty-note-plus">＋</span> 推理链
                  </button>
                )}
                {(!hasCollocations && !openSections.has('colloc')) && (
                  <button type="button" className="empty-note-row" onClick={() => toggleSection('colloc')}>
                    <span className="empty-note-plus">＋</span> 搭配
                  </button>
                )}
                {(!hasExamples && !openSections.has('examples')) && (
                  <button type="button" className="empty-note-row" onClick={() => toggleSection('examples')}>
                    <span className="empty-note-plus">＋</span> 例句
                  </button>
                )}
              </div>
            )}

            {/* 编辑中的空白区块（从 ＋ 行进入） */}
            {openSections.has('note') && !hasPersonalNote && (
              <section className="word-card-notes personal-note-block">
                <h4>我的笔记</h4>
                <NoteEditor value={personalNote} placeholder={MD_PLACEHOLDER} onChange={onNote} minRows={2} autoEdit />
              </section>
            )}
            {openSections.has('chain') && !hasMnemonic && (
              <section className="word-card-notes editable-note-block">
                <h4>推理链</h4>
                <NoteEditor value={mnemonicNote} placeholder={MD_PLACEHOLDER} onChange={onMnemonicNote} minRows={2} autoEdit />
              </section>
            )}
            {openSections.has('colloc') && !hasCollocations && (
              <section className="word-card-notes editable-note-block">
                <h4>搭配</h4>
                <NoteEditor value={collocationsNote} placeholder={MD_PLACEHOLDER} onChange={onCollocationsNote} minRows={2} autoEdit />
              </section>
            )}
            {openSections.has('examples') && !hasExamples && (
              <section className="word-card-notes editable-note-block">
                <h4>例句</h4>
                <NoteEditor
                  value=""
                  placeholder={MD_PLACEHOLDER}
                  onChange={(text) => {
                    const lines = text.split('\n').filter((line) => line.trim());
                    onExamplesNote(lines);
                  }}
                  minRows={2}
                  autoEdit
                />
              </section>
            )}
          </div>
        )}
      </article>

      <AffixModal
        open={prefixOpen}
        kind="prefix"
        word={word}
        note={affixNotes.prefix}
        items={items}
        getItem={getItem}
        textbook={textbook}
        familyId={familyId}
        onClose={() => setPrefixOpen(false)}
        onChange={(note) => onAffixNote('prefix', note)}
        onJumpWord={jumpToWord}
        onSaveToLibrary={(n) => onSaveToLibrary('prefix', n)}
        onSaveGroup={(draft) => onSaveGroup({ ...draft, kind: 'prefix' })}
        onOpenLibrary={onOpenAffixLibrary}
      />

      <AffixModal
        open={suffixOpen}
        kind="suffix"
        word={word}
        note={affixNotes.suffix}
        items={items}
        getItem={getItem}
        textbook={textbook}
        familyId={familyId}
        onClose={() => setSuffixOpen(false)}
        onChange={(note) => onAffixNote('suffix', note)}
        onJumpWord={jumpToWord}
        onSaveToLibrary={(n) => onSaveToLibrary('suffix', n)}
        onSaveGroup={(draft) => onSaveGroup({ ...draft, kind: 'suffix' })}
        onOpenLibrary={onOpenAffixLibrary}
      />
    </>
  );
}
