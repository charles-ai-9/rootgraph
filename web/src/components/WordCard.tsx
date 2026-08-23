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
  etymologyNote: string; // 词源（用户可编辑，覆盖数据层）
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
  onEtymologyNote: (text: string) => void;
  onAffixNote: (kind: WordAffixKind, note: AffixNoteData) => void;
  /** 批量挂载模式：头部显示复选框 */
  batchMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (word: string) => void;
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
  etymologyNote,
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
  onEtymologyNote,
  onAffixNote,
  batchMode,
  selected,
  onToggleSelect,
}: WordCardProps) {
  const [expanded, setExpanded] = useState(!defaultCollapsed);
  /** 点极简 ＋ icon 后，所有空白项一次性按上下顺序铺开 */
  const [showEmpty, setShowEmpty] = useState(false);
  /** 正在编辑的区块标识：编辑中即使内容被清空，区块也不卸载（输入框原地保留） */
  const [editingBlock, setEditingBlock] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [suffixOpen, setSuffixOpen] = useState(false);

  /** 深链/搜索定位聚焦时自动展开详情（同页点击不重挂载，需显式展开） */
  useEffect(() => {
    if (highlighted) setExpanded(true);
  }, [highlighted]);
  const highlightRoots = rootsForWord(familyRoots, word.word, word.rootHint, mnemonicNote);
  const rootAnalysis = analyzeWordRoots(familyRoots, word.word, word.rootHint, mnemonicNote);
  const hasMnemonic = Boolean(mnemonicNote.trim());
  const hasCollocations = Boolean(collocationsNote.trim());
  const hasExamples = examplesNote.length > 0;
  const hasEtymology = Boolean(etymologyNote.trim());
  const hasPersonalNote = Boolean(personalNote.trim());
  const hasExtra = Boolean(
    hasMnemonic
      || hasCollocations
      || hasExamples
      || hasEtymology,
  );
  const hasAnyEmpty = !hasPersonalNote || !hasMnemonic || !hasCollocations || !hasExamples || !hasEtymology;

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
          {batchMode && (
            <span
              className={`word-check ${selected ? 'is-on' : ''}`}
              role="checkbox"
              aria-checked={Boolean(selected)}
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onToggleSelect?.(word.word);
                haptic(8);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  e.stopPropagation();
                  onToggleSelect?.(word.word);
                }
              }}
              title={selected ? '取消选中' : '选中'}
            >
              {selected ? '✓' : ''}
            </span>
          )}
          <span className={`word-card-toggle ${expanded ? 'open' : ''}`}>{expanded ? '▾' : '▸'}</span>

          {/* 顺序：正常单词（点击=复制+展开）→ 🔊 → 拆分高亮（点击=朗读+展开）→ 音标/词性/释义 → 前缀/后缀（最右） */}
          <span
            className="word-plain"
            title="点击复制并展开"
            role="button"
            tabIndex={0}
            onClick={async () => {
              // 不阻止冒泡：复制之外，点击同时触发行级展开/收起
              const ok = await copyText(word.word);
              if (ok) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1200);
              }
            }}
            onKeyDown={async (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setExpanded((v) => !v);
                const ok = await copyText(word.word);
                if (ok) {
                  setCopied(true);
                  window.setTimeout(() => setCopied(false), 1200);
                }
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

          <span
            className={`word-head-word ${copied ? 'word-copied' : ''}`}
            title="点击朗读并展开"
            onClick={() => {
              // 不阻止冒泡：朗读之外，点击同时触发行级展开/收起
              speakWord(word.word);
            }}
          >
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

            {showEmpty ? (
              /* 展开态：五个区块固定顺序铺开；输入时原地保存，
                 不能随内容有无条件渲染（否则输入首字符即重挂载失焦） */
              <div className="word-card-extra">
                <section className="word-card-notes personal-note-block">
                  <h4>我的笔记</h4>
                  <NoteEditor
                    value={personalNote}
                    placeholder={MD_PLACEHOLDER}
                    onChange={onNote}
                    minRows={2}
                  />
                </section>

                <section className="word-card-notes editable-note-block">
                  <h4>推理链</h4>
                  <NoteEditor
                    value={mnemonicNote}
                    placeholder={MD_PLACEHOLDER}
                    onChange={onMnemonicNote}
                    minRows={2}
                  />
                </section>

                <section className="word-card-notes editable-note-block">
                  <h4>搭配</h4>
                  <NoteEditor
                    value={collocationsNote}
                    placeholder={MD_PLACEHOLDER}
                    onChange={onCollocationsNote}
                    minRows={2}
                  />
                </section>

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

                <section className="word-card-notes editable-note-block">
                  <h4>词源</h4>
                  <NoteEditor
                    value={etymologyNote}
                    placeholder={MD_PLACEHOLDER}
                    onChange={onEtymologyNote}
                    minRows={2}
                  />
                </section>
              </div>
            ) : (
              <>
                {/* 有啥显示啥：只有有内容的区块才展示；空白统一收敛到极简 ＋ icon */}
                {(hasPersonalNote || editingBlock === 'note') && (
                  <section className="word-card-notes personal-note-block">
                    <h4>我的笔记</h4>
                    <NoteEditor
                      value={personalNote}
                      placeholder={MD_PLACEHOLDER}
                      onChange={onNote}
                      onEditingChange={(e) => setEditingBlock(e ? 'note' : null)}
                      minRows={2}
                    />
                  </section>
                )}

                <div className="word-card-extra">
                  {(hasMnemonic || editingBlock === 'mnemonic') && (
                    <section className="word-card-notes editable-note-block">
                      <h4>推理链</h4>
                      <NoteEditor
                        value={mnemonicNote}
                        placeholder={MD_PLACEHOLDER}
                        onChange={onMnemonicNote}
                        onEditingChange={(e) => setEditingBlock(e ? 'mnemonic' : null)}
                        minRows={2}
                      />
                    </section>
                  )}

                  {(hasCollocations || editingBlock === 'collocations') && (
                    <section className="word-card-notes editable-note-block">
                      <h4>搭配</h4>
                      <NoteEditor
                        value={collocationsNote}
                        placeholder={MD_PLACEHOLDER}
                        onChange={onCollocationsNote}
                        onEditingChange={(e) => setEditingBlock(e ? 'collocations' : null)}
                        minRows={2}
                      />
                    </section>
                  )}

                  {(hasExamples || editingBlock === 'examples') && (
                    <section className="word-card-notes editable-note-block">
                      <h4>例句</h4>
                      <NoteEditor
                        value={examplesNote.join('\n')}
                        placeholder={MD_PLACEHOLDER}
                        onChange={(text) => {
                          const lines = text.split('\n').filter((line) => line.trim());
                          onExamplesNote(lines);
                        }}
                        onEditingChange={(e) => setEditingBlock(e ? 'examples' : null)}
                        minRows={2}
                      />
                    </section>
                  )}

                  {(hasEtymology || editingBlock === 'etymology') && (
                    <section className="word-card-notes editable-note-block">
                      <h4>词源</h4>
                      <NoteEditor
                        value={etymologyNote}
                        placeholder={MD_PLACEHOLDER}
                        onChange={onEtymologyNote}
                        onEditingChange={(e) => setEditingBlock(e ? 'etymology' : null)}
                        minRows={2}
                      />
                    </section>
                  )}
                </div>

                {/* 空白区块：极简 ＋ icon，点一下所有区块按上下顺序铺开（编辑中不出现，避免布局抽动） */}
                {hasAnyEmpty && !editingBlock && (
                  <button
                    type="button"
                    className="word-add-icon"
                    title="展开全部空白项"
                    aria-label="展开全部空白项"
                    onClick={() => setShowEmpty(true)}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                    </svg>
                  </button>
                )}
              </>
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
