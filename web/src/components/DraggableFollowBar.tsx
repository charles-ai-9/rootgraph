import { useRef, useState } from 'react';

interface DraggableFollowBarProps {
  followRoots: string;
  followMeaning: string;
}

const MIN_TOP = 88; // 顶栏下方最小位置
const MAX_TOP_RATIO = 0.7; // 最大可拖到视口 70%

/** 移动端可拖动的悬浮词根条：触摸上下拖动决定停留位置，↺ 恢复默认（sticky） */
export function DraggableFollowBar({ followRoots, followMeaning }: DraggableFollowBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);

  const onTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const startTop = ref.current?.getBoundingClientRect().top ?? 158;
    dragRef.current = { startY: t.clientY, startTop };
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (!dragRef.current || e.touches.length !== 1) return;
    const t = e.touches[0];
    const delta = t.clientY - dragRef.current.startY;
    const maxTop = window.innerHeight * MAX_TOP_RATIO;
    const next = Math.min(Math.max(dragRef.current.startTop + delta, MIN_TOP), maxTop);
    setTop(next);
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  return (
    <div
      ref={ref}
      className={`variant-root-follow ${top != null ? 'is-dragged' : ''}`}
      style={top != null ? { top } : undefined}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={endDrag}
      onTouchCancel={endDrag}
    >
      <span className="word-root-meaning-label">词根</span>
      <span className="variant-root-follow-roots">{followRoots}</span>
      <span className="variant-root-follow-eq">=</span>
      <span className="variant-root-follow-meaning">{followMeaning}</span>
      {top != null && (
        <button
          type="button"
          className="follow-reset-btn"
          onClick={() => setTop(null)}
          title="恢复默认位置"
          aria-label="恢复默认位置"
        >
          ↺
        </button>
      )}
    </div>
  );
}
