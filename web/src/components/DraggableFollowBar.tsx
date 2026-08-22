import { useRef, useState } from 'react';

interface DraggableFollowBarProps {
  followRoots: string;
  followMeaning: string;
}

const MIN_TOP = 88; // 顶栏下方最小位置
const MAX_TOP_RATIO = 0.7; // 最大可拖到视口 70%

/** 可拖动的悬浮词根条（鼠标/触摸通用）：按住上下拖动决定停留位置，↺ 恢复默认（sticky） */
export function DraggableFollowBar({ followRoots, followMeaning }: DraggableFollowBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return; // 仅主键
    const startTop = ref.current?.getBoundingClientRect().top ?? 158;
    dragRef.current = { startY: e.clientY, startTop };
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    const maxTop = window.innerHeight * MAX_TOP_RATIO;
    const next = Math.min(Math.max(dragRef.current.startTop + delta, MIN_TOP), maxTop);
    setTop(next);
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      ref={ref}
      className={`variant-root-follow ${top != null ? 'is-dragged' : ''}`}
      style={top != null ? { top } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
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
