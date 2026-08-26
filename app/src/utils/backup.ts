/** 笔记备份：localStorage → 文件（导出/导入），用户笔记资产的保险 */

export interface NoteBackup {
  version: 1;
  exportedAt: string;
  stores: Record<string, string>;
}

const BACKUP_KEYS = [
  'rootgraph-notes-v2',
  'rootgraph-progress-v1',
  'rootgraph-affix-library-v5',
  'rootgraph-affix-library-seed-version',
];

/** 打包全部笔记存储为可下载 JSON */
export function exportAllNotes(): NoteBackup {
  const stores: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) stores[key] = raw;
  }
  return { version: 1, exportedAt: new Date().toISOString(), stores };
}

export function downloadNotesBackup(): void {
  const backup = exportAllNotes();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rootgraph-notes-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** 导入前先把现有数据快照到自动备份 key，避免覆盖无法恢复 */
export function snapshotExistingNotes(): void {
  const stores: Record<string, string> = {};
  for (const key of BACKUP_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw != null) stores[key] = raw;
  }
  try {
    localStorage.setItem(
      `rootgraph-notes-backup-auto-${Date.now()}`,
      JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), stores }),
    );
  } catch {
    /* 配额满则跳过自动快照 */
  }
}

/** 导入备份（覆盖前自动快照现有数据） */
export function importNotesBackup(backup: NoteBackup): void {
  if (!backup || backup.version !== 1 || !backup.stores || typeof backup.stores !== 'object') {
    throw new Error('备份文件格式不正确');
  }
  snapshotExistingNotes();
  for (const key of BACKUP_KEYS) {
    if (backup.stores[key] != null) {
      localStorage.setItem(key, backup.stores[key]);
    }
  }
}

export function parseBackupFile(text: string): NoteBackup {
  const parsed = JSON.parse(text) as NoteBackup;
  if (parsed.version !== 1 || !parsed.stores || typeof parsed.stores !== 'object') {
    throw new Error('备份文件格式不正确');
  }
  return parsed;
}
