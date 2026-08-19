#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ROOT
DOWNLOADS="$HOME/Downloads"

for i in 1 2 3 4 5 6 7 8; do
  pdf="$DOWNLOADS/20000词汇巅峰速记营（教材${i}）.pdf"
  out="$ROOT/data/textbook-$i"
  if [[ -f "$pdf" ]]; then
    echo "Parsing textbook $i..."
    swift "$ROOT/scripts/parse-pdf.swift" "$pdf" "$out" "textbook-$i"
  else
    echo "Skip missing: $pdf"
  fi
done

python3 << 'PY'
import json, glob, os
root = os.environ.get('ROOT', '.')
families = []
for idx_path in sorted(glob.glob(os.path.join(root, 'data/textbook-*/index.json'))):
    with open(idx_path) as f:
        for item in json.load(f):
            item['textbook'] = os.path.basename(os.path.dirname(idx_path))
            families.append(item)
out = os.path.join(root, 'data/catalog.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(families, f, ensure_ascii=False, indent=2)
words = sum(x.get('wordCount', 0) for x in families)
print(f'Catalog: {len(families)} families, {words} words → {out}')
PY

public="$ROOT/web/public/data"
mkdir -p "$public"
rsync -a --delete "$ROOT/data/" "$public/"
echo "Synced → $public"
