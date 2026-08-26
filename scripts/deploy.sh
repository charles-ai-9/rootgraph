#!/bin/bash
# 一键部署：构建 → Cloudflare Pages 部署 → 自动清理旧部署快照（只保留最新一个）
# 用法：CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx ./scripts/deploy.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT/app"

if [[ -z "${CLOUDFLARE_API_TOKEN:-}" || -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]]; then
  echo "需要环境变量 CLOUDFLARE_API_TOKEN 和 CLOUDFLARE_ACCOUNT_ID"
  exit 1
fi
export CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

echo "== 1/3 构建 =="
npm run build

echo "== 2/3 部署（主域名 rootgraph.pages.dev）=="
npx wrangler pages deploy dist --project-name=rootgraph

echo "== 3/3 清理旧部署快照（保留最新）=="
# 列出部署（JSON 输出），wrangler 返回顺序为最新在前，删除其余（aliased 部署需 force）
npx wrangler pages deployment list --project-name=rootgraph --json > /tmp/rootgraph-deployments.json 2>/dev/null || {
  echo "警告：无法列出部署（可能 wrangler 版本不支持 --json），跳过清理"
  exit 0
}
python3 << 'PY'
import json, os, subprocess
account = os.environ['CLOUDFLARE_ACCOUNT_ID']
token = os.environ['CLOUDFLARE_API_TOKEN']
deps = json.load(open('/tmp/rootgraph-deployments.json'))
if not deps:
    print("无部署记录，跳过清理")
    raise SystemExit(0)
keep = deps[0]['Id']
removed = 0
for d in deps[1:]:
    url = f"https://api.cloudflare.com/client/v4/accounts/{account}/pages/projects/rootgraph/deployments/{d['Id']}"
    r = subprocess.run(['curl', '-s', '-X', 'DELETE', url + '?force=true',
                        '-H', f'Authorization: Bearer {token}'], capture_output=True, text=True)
    ok = '"success": true' in r.stdout or '"success":true' in r.stdout
    print(f"  删除 {d['Id'][:8]}: {'✓' if ok else '✗ ' + r.stdout[:120]}")
    if ok:
        removed += 1
print(f"清理完成：保留 {keep[:8]}，删除 {removed} 个旧快照")
PY
echo "✅ 部署完成：https://rootgraph.pages.dev"
