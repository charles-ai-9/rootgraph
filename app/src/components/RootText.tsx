import {
  hasCatalogRootMarkers,
  hasVariantMarkers,
  tokenizeRootText,
  type RootToken,
} from '../utils/rootHighlight';

interface RootTextProps {
  text: string;
  catalogRoots: string[];
  matchRoots?: string[];
  className?: string;
}

function tokenClass(token: RootToken): string | undefined {
  if (token.kind === 'root') return 'root-mark';
  if (token.kind === 'variant') return 'root-mark root-mark-variant';
  return undefined;
}

function tokenTitle(token: RootToken): string | undefined {
  if (token.kind === 'variant' && token.canonical) {
    return `${token.text} · ${token.canonical} 的拼写变体（同义同族）`;
  }
  if (token.kind === 'root') {
    return `${token.text} · 教材词根`;
  }
  return undefined;
}

export function RootText({ text, catalogRoots, matchRoots, className }: RootTextProps) {
  const tokens = tokenizeRootText(text, catalogRoots, matchRoots);

  return (
    <span className={className}>
      {tokens.map((t, i) => (
        <span key={`${i}-${t.text.slice(0, 10)}`} className={tokenClass(t)} title={tokenTitle(t)}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

/** 仅展示当前文本里实际出现的高亮类型 */
export function RootLegend({
  catalogRoots,
  matchRoots,
  text,
}: {
  catalogRoots: string[];
  matchRoots?: string[];
  text: string;
}) {
  const showCatalog = hasCatalogRootMarkers(text, catalogRoots, matchRoots);
  const showVariant = hasVariantMarkers(text, catalogRoots, matchRoots);
  if (!showCatalog && !showVariant) return null;

  return (
    <div className="root-legend">
      {showCatalog && (
        <span className="root-mark" title="教材目录中的词根形式">
          词根
        </span>
      )}
      {showVariant && (
        <span className="root-mark root-mark-variant" title="同族拼写变体，含义相同">
          变体
        </span>
      )}
    </div>
  );
}
