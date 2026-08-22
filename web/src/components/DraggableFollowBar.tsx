import { useRef, useState } from 'react';

interface DraggableFollowBarProps {
  followRoots: string;
  followMeaning: string;
  /** 临时浮层（如搜索列表）打开时隐藏悬浮条 */
  hidden?: boolean;
}

const STORAGE_KEY = 'rootgraph-follow-bar-top';
const MIN_TOP = 48;
const BAR_EST_HEIGHT = 60; // 条高估算（含 padding）

function clampTop(v: number): number {
  const maxTop = Math.max(MIN_TOP, window.innerHeight - BAR_EST_HEIGHT);
  return Math.min(Math.max(v, MIN_TOP), maxTop);
}

function loadSavedTop(): number | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? clampTop(v) : null;
  } catch {
    return null;
  }
}

/** 可拖动的悬浮词根条（鼠标/触摸通用）：按住上下拖动自由定位（位置持久化），↺ 恢复默认（sticky） */
export function DraggableFollowBar({ followRoots, followMeaning, hidden = false }: DraggableFollowBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState<number | null>(loadSavedTop);
  const topRef = useRef<number | null>(top);
  const dragRef = useRef<{ startY: number; startTop: number } | null>(null);

  const applyTop = (v: number | null) => {
    topRef.current = v;
    setTop(v);
  };

  const persistTop = () => {
    try {
      if (topRef.current == null) {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, String(topRef.current));
      }
    } catch {
      /* ignore */
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return; // 仅主键
    const startTop = ref.current?.getBoundingClientRect().top ?? 158;
    dragRef.current = { startY: e.clientY, startTop };
    ref.current?.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const delta = e.clientY - dragRef.current.startY;
    applyTop(clampTop(dragRef.current.startTop + delta));
  };

  const endDrag = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    if (ref.current?.hasPointerCapture(e.pointerId)) {
      ref.current.releasePointerCapture(e.pointerId);
    }
    persistTop();
  };

  const reset = () => {
    applyTop(null);
    persistTop();
  };

  return (
    <div
      ref={ref}
      className={`variant-root-follow ${top != null ? 'is-dragged' : ''} ${hidden ? 'is-hidden' : ''}`}
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
          onClick={reset}
          title="恢复默认位置"
          aria-label="恢复默认位置"
        >
          ↺
        </button>
      )}
    </div>
  );
}
