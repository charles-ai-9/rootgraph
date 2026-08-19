import type { AffixKind } from '../types';

/** 规范存储用词缀形：前缀 pro-、后缀 -able、词根 -form- */
export function normalizeAffixForm(name: string, kind: AffixKind): string {
  const t = name.trim().replace(/[–—]/g, '-');
  if (!t) return '';

  const core = t.replace(/^-+|-+$/g, '');
  if (!core) return '';

  if (kind === 'prefix') {
    return `${core}-`;
  }
  if (kind === 'suffix') {
    return `-${core}`;
  }
  return `-${core}-`;
}

/** 展示用词缀形（与存储一致，顺带修正历史脏数据如 -ade-） */
export function displayAffixForm(name: string, kind: AffixKind): string {
  return normalizeAffixForm(name, kind);
}

export function joinAffixForms(forms: string[], kind: AffixKind, sep = '，'): string {
  return forms
    .map((f) => displayAffixForm(f, kind))
    .filter(Boolean)
    .join(sep);
}

export function parseAffixFormsLine(text: string, kind: AffixKind): string[] {
  return text
    .split(/[,，]/)
    .map((part) => normalizeAffixForm(part.trim(), kind))
    .filter(Boolean);
}

export function affixFormPlaceholder(kind: AffixKind): string {
  if (kind === 'prefix') return 'ab-, ac-, ad-';
  if (kind === 'suffix') return '-able, -ible, -ile';
  return '-form-, -struct-';
}
