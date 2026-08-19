import { useEffect, useRef, useState } from 'react';
import { renderSimpleMarkdown } from '../utils/markdown';

interface NoteEditorProps {
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  minRows?: number;
}

export function NoteEditor({ value, placeholder, onChange, minRows = 3 }: NoteEditorProps) {
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
        <div className="note-markdown">{renderSimpleMarkdown(value)}</div>
      ) : (
        <p className="note-placeholder">{placeholder}</p>
      )}
    </div>
  );
}
