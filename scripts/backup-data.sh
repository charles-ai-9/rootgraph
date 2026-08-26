#!/bin/bash
# 数据备份：打包 app/public/data/ 与 app/src/data/（JSON 数据资产），保留最近 10 份。
# 用法：scripts/backup-data.sh   （可 cron 或重导前手动跑）
set -euo pipefail
# cron 环境 PATH 不含 /opt/homebrew/bin（python3 所在），显式补齐
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKUP_DIR="$ROOT/backups"
KEEP=10

mkdir -p "$BACKUP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
ARCHIVE="$BACKUP_DIR/rootgraph-data-$STAMP.tar.gz"

tar -czf "$ARCHIVE" \
  -C "$ROOT" \
  app/public/data/catalog.json \
  app/public/data/affix-library-seed.json \
  app/public/data/textbook-1 app/public/data/textbook-2 app/public/data/textbook-3 app/public/data/textbook-4 \
  app/public/data/textbook-5 app/public/data/textbook-6 app/public/data/textbook-7 app/public/data/textbook-8 \
  app/src/data/affix-library-seed.json app/src/data/affixSeed.ts

ls -1t "$BACKUP_DIR"/rootgraph-data-*.tar.gz 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "备份完成 → $ARCHIVE ($(du -h "$ARCHIVE" | cut -f1))，保留最近 $KEEP 份"
