import { useEffect, useRef, useState } from 'react';
import type { AffixKind } from '../types';
import {
  affixFormPlaceholder,
  joinAffixForms,
  parseAffixFormsLine,
} from '../utils/affixFormDisplay';
import { renderSimpleMarkdown } from '../utils/markdown';

interface AffixGroupFieldsProps {
  kind: AffixKind;
  forms: string[];
  meaning: string;
  onFormsChange: (forms: string[]) => void;
  onMeaningChange: (meaning: string) => void;
  /** 点击「完成」时触发（用于单词弹窗自动写入词缀库） */
  onFormsComplete?: (forms: string[]) => void;
  onMeaningComplete?: (meaning: string) => void;
}

function formsLabel(kind: AffixKind): string {
  return kind === 'root' ? '词根' : '词缀';
}

function FieldEditButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="affix-field-edit-btn" onClick={onClick}>
      编辑
    </button>
  );
}

/** 词缀组：词缀形 + 释义（与词缀库弹窗一致） */
export function AffixGroupFields({
  kind,
  forms,
  meaning,
  onFormsChange,
  onMeaningChange,
  onFormsComplete,
  onMeaningComplete,
}: AffixGroupFieldsProps) {
  const [editingForms, setEditingForms] = useState(false);
  const [editingMeaning, setEditingMeaning] = useState(false);
  const [formsLine, setFormsLine] = useState('');
  const formsInputRef = useRef<HTMLInputElement>(null);
  const meaningInputRef = useRef<HTMLTextAreaElement>(null);

  const displayForms = joinAffixForms(forms, kind);

  useEffect(() => {
    if (editingForms) formsInputRef.current?.focus();
  }, [editingForms]);

  useEffect(() => {
    if (editingMeaning) meaningInputRef.current?.focus();
  }, [editingMeaning]);

  const startEditForms = () => {
    setFormsLine(displayForms);
    setEditingForms(true);
  };

  const finishEditForms = () => {
    const next = parseAffixFormsLine(formsLine, kind);
    const resolved = next.length ? next : [''];
    onFormsChange(resolved);
    onFormsComplete?.(resolved);
    setEditingForms(false);
  };

  const finishEditMeaning = () => {
    onMeaningComplete?.(meaning);
    setEditingMeaning(false);
  };

  return (
    <>
      <section className="affix-group-field">
        <div className="affix-group-field-head">
          <span className="affix-group-field-label">{formsLabel(kind)}</span>
          {!editingForms && <FieldEditButton onClick={startEditForms} />}
        </div>
        {editingForms ? (
          <div className="affix-field-editor">
            <input
              ref={formsInputRef}
              className="affix-forms-line-input"
              value={formsLine}
              onChange={(e) => setFormsLine(e.target.value)}
              placeholder={affixFormPlaceholder(kind)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  finishEditForms();
                }
              }}
            />
            <button type="button" className="affix-inline-done" onClick={finishEditForms}>
              完成
            </button>
          </div>
        ) : (
          <div className="affix-group-field-value">
            {displayForms || `（未填写${formsLabel(kind)}）`}
          </div>
        )}
      </section>

      <section className="affix-group-field">
        <div className="affix-group-field-head">
          <span className="affix-group-field-label">释义</span>
          {!editingMeaning && <FieldEditButton onClick={() => setEditingMeaning(true)} />}
        </div>
        {editingMeaning ? (
          <div className="affix-field-editor">
            <textarea
              ref={meaningInputRef}
              className="affix-meaning-textarea"
              rows={5}
              value={meaning}
              onChange={(e) => onMeaningChange(e.target.value)}
              placeholder={'1. 表示…\n2. 加强语气\n支持 **粗体**、*斜体*、列表等'}
            />
            <button type="button" className="affix-inline-done" onClick={finishEditMeaning}>
              完成
            </button>
          </div>
        ) : (
          <div className="affix-group-field-value affix-group-field-meaning">
            {meaning.trim() ? (
              <div className="note-markdown">{renderSimpleMarkdown(meaning)}</div>
            ) : (
              '（未填写释义）'
            )}
          </div>
        )}
      </section>
    </>
  );
}
