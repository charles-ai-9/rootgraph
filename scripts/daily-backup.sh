#!/bin/bash
# 每日备份任务：用户数据（→本地 + GitHub 私有仓库）+ 官方数据（→本地）
# 由 crontab 每天 18:40 调用（见 scripts/install-cron.sh）
# cron 环境 PATH 不含 /opt/homebrew/bin（python3 所在），显式补齐
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LOG="$ROOT/backups/daily-backup.log"
mkdir -p "$ROOT/backups"

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 每日备份开始 =====" >> "$LOG"

"$ROOT/scripts/backup-user-data.sh" >> "$LOG" 2>&1

"$ROOT/scripts/backup-data.sh" >> "$LOG" 2>&1

echo "===== $(date '+%Y-%m-%d %H:%M:%S') 每日备份完成 =====" >> "$LOG"
