import { useEffect, useRef, useState, type ReactNode } from 'react';
import { renderSimpleMarkdown } from '../utils/markdown';

interface NoteEditorProps {
  value: string;
  placeholder: string;
  onChange: (text: string) => void;
  minRows?: number;
  /** 自定义只读预览（默认 markdown） */
  renderPreview?: (value: string) => ReactNode;
  /** 初始直接进入编辑态（空内容展开编辑用） */
  autoEdit?: boolean;
  /** 编辑态变化回调（父级用于“编辑中不随内容清空而卸载区块”） */
  onEditingChange?: (editing: boolean) => void;
}

export function NoteEditor({ value, placeholder, onChange, minRows = 3, renderPreview, autoEdit = false, onEditingChange }: NoteEditorProps) {
  const [editing, setEditing] = useState(autoEdit);
  /** 编辑期本地缓冲：输入过程中不通知父组件，退出编辑时才一次性提交最终内容 */
  const [localText, setLocalText] = useState(value);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  const startEdit = () => {
    setLocalText(value);
    setEditing(true);
    onEditingChange?.(true);
  };

  const finish = () => {
    setEditing(false);
    onEditingChange?.(false);
    onChange(localText);
  };

  // 外部 value 变化时同步（如云端数据拉取），保持 textarea 受控
  useEffect(() => {
    setLocalText(value);
  }, [value]);

  useEffect(() => {
    if (editing) areaRef.current?.focus();
  }, [editing]);

  // 编辑框高度：进入编辑时按当前内容一次性设定，输入过程中保持固定（内部滚动）。
  // 之前随输入自动增高，在部分移动浏览器（如 MIUI 浏览器）会因布局变化自动滚动焦点元素，
  // 导致"每次输入页面就滑动"；固定高度后输入期间布局零变化。
  useEffect(() => {
    if (!editing) return;
    const ta = areaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
    // 仅进入编辑时设定一次；不依赖 value，输入不再改变高度
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  if (editing) {
    return (
      <textarea
        ref={areaRef}
        className="note-input note-input-block"
        rows={minRows}
        placeholder={placeholder}
        value={localText}
        onChange={(e) => setLocalText(e.target.value)}
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
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') startEdit();
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
