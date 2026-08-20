import { useState } from 'react';
import type { WordEntry, WordStatus } from '../types';
import { cleanRoots, groupWordsByRoot } from '../utils/family';
import { rootsForWord } from '../utils/rootHighlight';
import { RootText } from './RootText';

interface MiniRelationGraphProps {
  title: string;
  roots: string[];
  words: WordEntry[];
  /** 点击单词 → 弹窗复习 */
  onOpenWord: (word: string) => void;
  /** 查询单词记忆状态（用于 pill 着色） */
  statusFor: (word: string) => WordStatus;
}

export function MiniRelationGraph({ title, roots, words, onOpenWord, statusFor }: MiniRelationGraphProps) {
  const [expanded, setExpanded] = useState(false);
  const usableRoots = cleanRoots(roots);
  const groups = groupWordsByRoot(words, usableRoots.length ? usableRoots : roots);

  return (
    <section className="mini-graph-section">
      <button type="button" className="section-toggle" onClick={() => setExpanded((v) => !v)}>
        <span>关系图 · 概览复习</span>
        <span className="toggle-hint">{expanded ? '收起' : '展开'} · 先回忆释义，想不起来点击单词核对</span>
        <span className="chevron">{expanded ? '▾' : '▸'}</span>
      </button>

      {expanded && (
        <div className="mini-graph">
          <div className="mini-graph-center">{title}</div>
          <div className="mini-graph-branches">
            {[...groups.entries()].map(([root, list]) => (
              <div key={root} className="mini-branch">
                <div className="mini-root">{root}</div>
                <div className="mini-words">
                  {list.map((w) => (
                    <button
                      key={w.word}
                      type="button"
                      className={`mini-word-pill is-${statusFor(w.word)}`}
                      onClick={() => onOpenWord(w.word)}
                    >
                      <RootText
                        text={w.word}
                        catalogRoots={roots}
                        matchRoots={rootsForWord(usableRoots.length ? usableRoots : roots, w.word, w.rootHint, w.mnemonic)}
                      />
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mini-graph-legend">
            <span className="mini-graph-legend-dot is-new" />未测
            <span className="mini-graph-legend-dot is-review" />模糊
            <span className="mini-graph-legend-dot is-understood" />已掌握
          </p>
        </div>
      )}
    </section>
  );
}
