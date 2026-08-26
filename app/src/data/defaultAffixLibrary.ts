import type { AffixKind } from '../types';

export function seedKindLabel(kind: AffixKind): string {
  if (kind === 'prefix') return '前缀';
  if (kind === 'suffix') return '后缀';
  return '词根';
}

export const AFFIX_LIBRARY_TABS: AffixKind[] = ['root', 'prefix', 'suffix'];
