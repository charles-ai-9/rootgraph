import type { AffixItem, AffixKind } from '../types';
import seedPayload from './affix-library-seed.json';
import { normalizeAffixForm } from '../utils/affixFormDisplay';

export const AFFIX_SEED_VERSION = 'docx-v14';
export const AFFIX_SEED_META = seedPayload.meta as {
  source: string;
  rootGroups: number;
  prefixGroups: number;
  suffixGroups: number;
  xlsxExamplesMerged?: boolean;
};

type SeedRow = {
  id: string;
  kind: string;
  name: string;
  pos?: string;
  meaning?: string;
  note?: string;
  isParent?: boolean;
  parentId?: string | null;
  order?: number;
};

function toKind(raw: string): AffixKind {
  if (raw === 'prefix') return 'prefix';
  if (raw === 'suffix') return 'suffix';
  return 'root';
}

export function loadSeedItems(): AffixItem[] {
  const now = Date.now();
  return (seedPayload.items as SeedRow[]).map((row) => ({
    id: row.id,
    kind: toKind(row.kind),
    name: normalizeAffixForm(row.name, toKind(row.kind)),
    pos: row.pos ?? '',
    meaning: row.meaning ?? '',
    note: row.note ?? '',
    isParent: Boolean(row.isParent),
    parentId: row.parentId ?? undefined,
    order: typeof row.order === 'number' ? row.order : undefined,
    updatedAt: now,
  }));
}
