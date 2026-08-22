import type { WordStatus } from '../types';
import { haptic } from '../utils/haptics';
import { WordCard, type WordCardProps } from './WordCard';

interface WordCardModalProps {
  wordCardProps: WordCardProps;
  status: WordStatus;
  onSetStatus: (status: WordStatus) => void;
  onClose: () => void;
}

/** 概览复习弹窗：关系图点击单词后弹出完整卡片，核对释义并标记记忆状态 */
export function WordCardModal({ wordCardProps, status, onSetStatus, onClose }: WordCardModalProps) {
  return (
    <div className="affix-modal-backdrop" onClick={onClose} role="presentation">
      <div
        className="word-review-modal"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="word-review-modal-head">
          <span className="word-review-modal-kind">复习</span>
          <button type="button" className="affix-modal-close" onClick={onClose} aria-label="关闭">×</button>
        </header>

        <div className="word-review-modal-body">
          <WordCard {...wordCardProps} />
        </div>

        <footer className="word-review-modal-foot">
          <button
            type="button"
            className={`word-review-mark is-review ${status === 'review' ? 'active' : ''}`}
            onClick={() => {
              onSetStatus('review');
              haptic([12, 40, 12]);
            }}
          >
            😕 模糊，稍后再看
          </button>
          <button
            type="button"
            className={`word-review-mark is-understood ${status === 'understood' ? 'active' : ''}`}
            onClick={() => {
              onSetStatus('understood');
              haptic(8);
            }}
          >
            ✓ 想起来了
          </button>
        </footer>
      </div>
    </div>
  );
}
