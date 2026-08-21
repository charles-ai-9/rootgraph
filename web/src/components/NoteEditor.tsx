import { useEffect, useRef, useState, type ReactNode } from 'react';
import { renderSimpleMarkdown } from '../utils/markdown';

interface NoteEditorProps {
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  minRows?: number;
  /** 自定义只读预览（默认 markdown） */
  renderPreview?: (value: string) => ReactNode;
}

export function NoteEditor({ value, placeholder, onChange, minRows = 3, renderPreview }: NoteEditorProps) {
  const [editing, setEditing] = useState(false);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) areaRef.current?.focus();
  }, [editing]);

  const finish = () => setEditing(false);

  if (editing) {
    return (
      <textarea
        ref={areaRef}
        className="note-input note-input-block"
        rows={minRows}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          // Enter 保存并退出；Shift+Enter 换行
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            finish();
          }
        }}
      />
    );
  }

  return (
    <div
      className={`note-editable ${value ? 'has-content' : 'is-empty'}`}
      role="button"
      tabIndex={0}
      onClick={() => setEditing(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') setEditing(true);
      }}
    >
      {value ? (
        renderPreview ? renderPreview(value) : (
          <div className="note-markdown">{renderSimpleMarkdown(value)}</div>
        )
      ) : (
        <p className="note-placeholder">{placeholder}</p>
      )}
    </div>
  );
}
