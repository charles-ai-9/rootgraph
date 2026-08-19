import { useMemo, useState } from 'react';
import type { IndexedWord } from '../hooks/useWordIndex';
import { findWordsByAffix, type AffixScope } from '../hooks/useWordIndex';
import { formatAffixLabel, type AffixHint } from '../utils/affixHint';
import { parseAffixTokens } from '../utils/wordBreakdown';

interface AffixRelatedWordsProps {
  hints: AffixHint[];
  affixNoteText: string;
  index: IndexedWord[];
  indexReady: boolean;
  textbook: string;
  familyId: string;
  onJumpWord: (word: string) => void;
}

const SCOPE_LABEL: Record<AffixScope, string> = {
  family: '本章',
  textbook: '本教材',
  all: '全库',
};

export function AffixRelatedWords({
  hints,
  affixNoteText,
  index,
  indexReady,
  textbook,
  familyId,
  onJumpWord,
}: AffixRelatedWordsProps) {
  const [scope, setScope] = useState<AffixScope>('textbook');
  const [activeAffix, setActiveAffix] = useState<string | null>(null);

  const tokens = useMemo(() => {
    const fromNote = parseAffixTokens(affixNoteText);
    const fromHints = hints.map((h) => ({
      form: h.form,
      kind: h.kind,
      label: formatAffixLabel(h),
    }));
    const seen = new Set<string>();
    return [...fromHints, ...fromNote].filter((t) => {
      const k = `${t.kind}:${t.form}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [hints, affixNoteText]);

  const matches = useMemo(() => {
    if (!activeAffix || !indexReady) return [];
    const token = tokens.find((t) => t.label === activeAffix || t.form === activeAffix);
    if (!token) return [];
    return findWordsByAffix(index, token.form, token.kind, scope, { textbook, familyId }, 50);
  }, [activeAffix, index, indexReady, scope, textbook, familyId, tokens]);

  if (!tokens.length) return null;

  return (
    <div className="affix-related">
      <div className="affix-related-head">
        <span className="affix-related-title">词缀关联词</span>
        <div className="affix-scope-tabs">
          {(Object.keys(SCOPE_LABEL) as AffixScope[]).map((s) => (
            <button
              key={s}
              type="button"
              className={`affix-scope-tab ${scope === s ? 'active' : ''}`}
              onClick={() => setScope(s)}
            >
              {SCOPE_LABEL[s]}
            </button>
          ))}
        </div>
      </div>
      <p className="affix-related-hint">点击词缀，从词库中找出含同一词缀的单词</p>
      <div className="affix-hint-chips">
        {tokens.map((t) => (
          <button
            key={`${t.kind}-${t.form}`}
            type="button"
            className={`affix-hint-chip ${activeAffix === t.label ? 'active' : ''}`}
            onClick={() => setActiveAffix((v) => (v === t.label ? null : t.label))}
          >
            {t.label}
          </button>
        ))}
      </div>
      {activeAffix && (
        <div className="affix-related-list">
          {!indexReady ? (
            <p className="affix-related-loading">词库索引加载中…</p>
          ) : matches.length === 0 ? (
            <p className="affix-related-empty">未找到匹配单词</p>
          ) : (
            <>
              <p className="affix-related-count">{matches.length} 词{matches.length >= 50 ? '（仅显示前 50）' : ''}</p>
              <div className="affix-word-pills">
                {matches.map((m) => (
                  <button
                    key={`${m.textbook}-${m.familyId}-${m.word}`}
                    type="button"
                    className="affix-word-pill"
                    onClick={() => onJumpWord(m.word)}
                  >
                    {m.word}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
