import { useState } from 'react';
import type { WordEntry } from '../types';
import { cleanRoots, groupWordsByRoot } from '../utils/family';
import { rootsForWord } from '../utils/rootHighlight';
import { RootText } from './RootText';

interface MiniRelationGraphProps {
  title: string;
  roots: string[];
  words: WordEntry[];
}

export function MiniRelationGraph({ title, roots, words }: MiniRelationGraphProps) {
  const [expanded, setExpanded] = useState(false);
  const usableRoots = cleanRoots(roots);
  const groups = groupWordsByRoot(words, usableRoots.length ? usableRoots : roots);

  const scrollToWord = (word: string) => {
    document.getElementById(`word-${word}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="mini-graph-section">
      <button type="button" className="section-toggle" onClick={() => setExpanded((v) => !v)}>
        <span>关系图</span>
        <span className="toggle-hint">{expanded ? '收起' : '展开'} · 点击单词可跳转</span>
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
                  {list.slice(0, 12).map((w) => (
                    <button
                      key={w.word}
                      type="button"
                      className="mini-word-pill"
                      onClick={() => scrollToWord(w.word)}
                    >
                      <RootText
                        text={w.word}
                        catalogRoots={roots}
                        matchRoots={rootsForWord(usableRoots.length ? usableRoots : roots, w.word, w.rootHint, w.mnemonic)}
                      />
                    </button>
                  ))}
                  {list.length > 12 && (
                    <span className="mini-more">+{list.length - 12} 词</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
