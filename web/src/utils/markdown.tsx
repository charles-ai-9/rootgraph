import type { ReactNode } from 'react';

/** 轻量 Markdown：bold / italic / code / 列表 / 换行 */
export function renderSimpleMarkdown(text: string): ReactNode {
  const lines = text.split('\n');
  const nodes: ReactNode[] = [];
  let listBuffer: string[] = [];
  let blockIdx = 0;

  const flushList = () => {
    if (!listBuffer.length) return;
    nodes.push(
      <ul key={`ul-${blockIdx++}`} className="md-list">
        {listBuffer.map((item, i) => (
          <li key={i}>{parseInline(item, `li-${blockIdx}-${i}`)}</li>
        ))}
      </ul>,
    );
    listBuffer = [];
  };

  lines.forEach((line, li) => {
    const trimmed = line.trimStart();
    const isList = /^[-*]\s+/.test(trimmed);

    if (isList) {
      listBuffer.push(trimmed.replace(/^[-*]\s+/, ''));
      return;
    }

    flushList();
    if (nodes.length > 0) nodes.push(<br key={`br-${li}`} />);
    nodes.push(<span key={`p-${li}`}>{parseInline(line, `l${li}`)}</span>);
  });

  flushList();
  return <>{nodes}</>;
}

function parseInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const re = /(\*\*.+?\*\*|\*.+?\*|`.+?`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(text.slice(last, m.index));
    }
    const token = m[0];
    const k = `${keyPrefix}-${i++}`;
    if (token.startsWith('**')) {
      parts.push(<strong key={k}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      parts.push(<em key={k}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      parts.push(<code key={k}>{token.slice(1, -1)}</code>);
    }
    last = m.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length ? parts : [text];
}
