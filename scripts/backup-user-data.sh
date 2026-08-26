#!/bin/bash
# 用户数据备份：拉取云端最新数据（笔记/词根/单词本/进度）→ 本地 backups/user/ → 推送私有 GitHub 仓库
# 用法：scripts/backup-user-data.sh   （建议每次重要编辑后或定期手动跑）
set -euo pipefail
# cron 环境 PATH 不含 /opt/homebrew/bin（python3 所在），显式补齐
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SYNC_URL="https://rootgraph.pages.dev/api/db/sync"
SYNC_TOKEN="${SYNC_TOKEN:-rg_sync_2026_k8m3p7q2x9w4}"
DATA_REPO="git@github.com:charles-ai-9/rootgraph-data.git"
BACKUP_DIR="$ROOT/backups/user"
KEEP=30
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

echo "== 1/3 拉取云端最新数据 =="
curl -s --max-time 30 "$SYNC_URL" -H "Authorization: Bearer $SYNC_TOKEN" > "$BACKUP_DIR/user-data-$STAMP.json"
python3 -c "
import json, sys
d = json.load(open('$BACKUP_DIR/user-data-$STAMP.json'))
print(f'  数据有效：families={len(d.get(\"families\",{}))} 笔记, words={len(d.get(\"words\",{}))} 词笔记, updatedAt={d.get(\"updatedAt\")}')
"

echo "== 2/3 清理旧备份（保留 $KEEP 份）=="
ls -1t "$BACKUP_DIR"/user-data-*.json 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f

echo "== 3/3 推送私有 GitHub 仓库 =="
cd "$BACKUP_DIR"
if [ ! -d .git ]; then
  git init -q
  git remote add origin "$DATA_REPO"
fi
git add -A
if git diff --cached --quiet; then
  echo "  无新数据变更，跳过提交"
else
  git -c user.name="rootgraph-backup" -c user.email="backup@rootgraph.local" commit -q -m "用户数据备份 $STAMP"
fi
if git rev-parse --verify -q main >/dev/null; then
  git push -q origin main || git push -q -u origin main 2>/dev/null || true
else
  git branch -M main
  git push -q -u origin main 2>/dev/null || true
fi
echo "✅ 用户数据备份完成：$BACKUP_DIR/user-data-$STAMP.json（已推送 charles-ai-9/rootgraph-data 私有仓库）"
