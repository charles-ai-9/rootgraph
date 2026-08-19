import { useState } from 'react';
import type { AffixItem, AffixNoteData, WordAffixKind, WordAffixNotes, WordEntry } from '../types';
import { copyText } from '../utils/clipboard';
import { parseMnemonicChain } from '../utils/family';
import { analyzeWordRoots, hasRootMarkers, rootsForWord } from '../utils/rootHighlight';
import type { AffixGroupDraft } from '../utils/affixLibrary';
import { AffixModal, affixButtonHasDot, affixButtonLabel } from './AffixModal';
import { NoteEditor } from './NoteEditor';
import { RootLegend, RootText } from './RootText';

interface WordCardProps {
  word: WordEntry;
  familyRoots: string[];
  textbook: string;
  familyId: string;
  personalNote: string;
  affixNotes: WordAffixNotes;
  items: AffixItem[];
  getItem: (id: string) => AffixItem | undefined;
  onSaveToLibrary: (kind: WordAffixKind, note: AffixNoteData) => AffixItem;
  onSaveGroup: (draft: AffixGroupDraft) => void;
  onOpenAffixLibrary: () => void;
  defaultCollapsed?: boolean;
  defaultShowExtra?: boolean;
  onNote: (text: string) => void;
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
  affixNotes,
  items,
  getItem,
  onSaveToLibrary,
  onSaveGroup,
  onOpenAffixLibrary,
  defaultCollapsed = false,
  defaultShowExtra = false,
  onNote,
  onAffixNote,
}: WordCardProps) {
  const [showExtra, setShowExtra] = useState(defaultShowExtra);
  const [copied, setCopied] = useState(false);
  const [prefixOpen, setPrefixOpen] = useState(false);
  const [suffixOpen, setSuffixOpen] = useState(false);
  const chain = parseMnemonicChain(word.mnemonic);
  const highlightRoots = rootsForWord(familyRoots, word.word, word.rootHint, word.mnemonic);
  const rootAnalysis = analyzeWordRoots(familyRoots, word.word, word.rootHint, word.mnemonic);
  const hasExtra = Boolean(
    word.mnemonic
      || word.collocations.length
      || word.examples.length
      || word.etymology,
  );

  const handleCopyWord = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const ok = await copyText(word.word);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    }
  };

  const jumpToWord = (target: string) => {
    document.getElementById(`word-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const variant = rootAnalysis.primary?.isVariant ? rootAnalysis.primary : null;

  return (
    <>
      <article className={`word-card ${defaultCollapsed ? 'is-highlighted' : ''}`} id={`word-${word.word}`}>
        <header className="word-card-head">
          <span
            className={`word-head-word ${copied ? 'word-copied' : ''}`}
            title="点击复制单词"
            onClick={handleCopyWord}
          >
            <RootText text={word.word} catalogRoots={familyRoots} matchRoots={highlightRoots} />
          </span>

          {word.phonetic && <span className="word-phonetic">/{word.phonetic}/</span>}

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

          {copied && <span className="copy-hint">已复制</span>}

          <div className="word-head-actions">
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
            {hasExtra && (
              <button
                type="button"
                className="word-extra-toggle"
                onClick={() => setShowExtra((v) => !v)}
                aria-expanded={showExtra}
              >
                {showExtra ? '收起' : '更多'}
                <span className="chevron">{showExtra ? '▾' : '▸'}</span>
              </button>
            )}
          </div>
        </header>

        {(word.pos || word.definition) && (
          <div className="word-card-def">
            {word.pos && <span className="pos-tag">{word.pos}</span>}
            <span className="word-def-text">{word.definition}</span>
            {word.frequency != null && (
              <span className="freq-tag">词频 {word.frequency}</span>
            )}
          </div>
        )}

        <section className="word-card-notes personal-note-block">
          <h4>我的笔记</h4>
          <NoteEditor
            value={personalNote}
            placeholder="点击这里记录你的理解（支持 **粗体** *斜体* `代码` 与 - 列表）"
            onChange={onNote}
            minRows={2}
          />
        </section>

        {showExtra && hasExtra && (
          <div className="word-card-extra">
            {word.mnemonic && (
              <section className="reason-block">
                <div className="reason-block-head">
                  <h4>推理链</h4>
                  {hasRootMarkers(word.mnemonic, familyRoots, highlightRoots) && (
                    <RootLegend
                      catalogRoots={familyRoots}
                      matchRoots={highlightRoots}
                      text={word.mnemonic}
                    />
                  )}
                </div>
                {chain.parts.length > 1 ? (
                  <ol className="reason-steps">
                    {chain.parts.map((p) => (
                      <li key={p}>
                        <RootText text={p} catalogRoots={familyRoots} matchRoots={highlightRoots} />
                      </li>
                    ))}
                    {chain.conclusion && (
                      <li className="reason-result">
                        <RootText text={chain.conclusion} catalogRoots={familyRoots} matchRoots={highlightRoots} />
                      </li>
                    )}
                  </ol>
                ) : (
                  <p>
                    <RootText text={word.mnemonic} catalogRoots={familyRoots} matchRoots={highlightRoots} />
                  </p>
                )}
              </section>
            )}

            {word.collocations.length > 0 && (
              <section>
                <h4>搭配</h4>
                <ul className="plain-list">
                  {word.collocations.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </section>
            )}

            {word.examples.length > 0 && (
              <section>
                <h4>例句</h4>
                <ul className="plain-list example-list">
                  {word.examples.map((ex) => (
                    <li key={ex} className="example-block">
                      {ex.split('\n').map((line) => (
                        <span key={line} className="example-line">
                          {line}
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {word.etymology && (
              <section>
                <h4>词源</h4>
                <p className="muted-text">{word.etymology}</p>
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
