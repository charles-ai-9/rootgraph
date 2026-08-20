#!/bin/bash
# 数据备份：打包 data/ 与 web/src/data/（JSON 数据资产），保留最近 10 份。
# 用法：scripts/backup-data.sh   （可 cron 或重导前手动跑）
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
KEEP=10

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/rootgraph-data-$STAMP.tar.gz"

tar -czf "$ARCHIVE" \
  -C "$ROOT" \
  data/catalog.json \
  data/affix-library-seed.json \
  data/textbook-1 data/textbook-2 data/textbook-3 data/textbook-4 \
  data/textbook-5 data/textbook-6 data/textbook-7 data/textbook-8 \
  web/src/data/affix-library-seed.json web/src/data/affixSeed.ts

ls -1t "$BACKUP_DIR"/rootgraph-data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "备份完成 → $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))，保留最近 $KEEP 份"
