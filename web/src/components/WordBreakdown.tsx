import type { WordSegment } from '../utils/wordBreakdown';

interface WordBreakdownProps {
  segments: WordSegment[];
  className?: string;
}

function segmentClass(kind: WordSegment['kind']): string | undefined {
  switch (kind) {
    case 'root':
      return 'root-mark';
    case 'variant':
      return 'root-mark root-mark-variant';
    case 'prefix':
    case 'suffix':
      return 'affix-mark';
    default:
      return undefined;
  }
}

function segmentTitle(seg: WordSegment): string | undefined {
  if (seg.label) return seg.label;
  if (seg.kind === 'prefix') return `${seg.text}- · 前缀`;
  if (seg.kind === 'suffix') return `-${seg.text} · 后缀`;
  return undefined;
}

export function WordBreakdown({ segments, className }: WordBreakdownProps) {
  if (segments.length === 1 && segments[0].kind === 'plain') return null;

  return (
    <span className={`word-breakdown ${className ?? ''}`}>
      {segments.map((seg, i) => (
        <span key={`${i}-${seg.text}`} className={segmentClass(seg.kind)} title={segmentTitle(seg)}>
          {seg.text}
        </span>
      ))}
    </span>
  );
}

export function BreakdownLegend() {
  return (
    <span className="breakdown-legend">
      <span className="root-mark">词根</span>
      <span className="root-mark root-mark-variant">变体</span>
      <span className="affix-mark">词缀</span>
    </span>
  );
}
