#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export ROOT
DOWNLOADS="$HOME/Downloads"
DESKTOP_2W="$HOME/Desktop/2w"

for i in 1 2 3 4 5 6 7 8; do
  pdf="$DOWNLOADS/20000词汇巅峰速记营（教材${i}）.pdf"
  docx="$DOWNLOADS/20000词汇巅峰速记营（教材${i}）.docx"
  # 源文件可能在 ~/Desktop/2w/（用户常用目录），Downloads 优先、2w 兜底
  [[ ! -f "$docx" ]] && docx="$DESKTOP_2W/20000词汇巅峰速记营（教材${i}）.docx"
  [[ ! -f "$pdf" ]] && pdf="$DESKTOP_2W/20000词汇巅峰速记营（教材${i}）.pdf"
  out="$ROOT/data/textbook-$i"
  if [[ -f "$docx" ]]; then
    echo "Parsing textbook $i from docx..."
    python3 "$ROOT/scripts/parse-docx.py" "$docx" "$out" "textbook-$i"
  elif [[ -f "$pdf" ]]; then
    echo "Parsing textbook $i from pdf..."
    ROOTGRAPH_ROOT="$ROOT" swift "$ROOT/scripts/parse-pdf.swift" "$pdf" "$out" "textbook-$i"
  else
    echo "Skip missing: $docx / $pdf"
  fi

  # 保护：解析结果为 0 族立即中止，避免扫描版 PDF / 解析失败静默清空旧数据
  if [[ ! -f "$out/index.json" ]]; then
    echo "ERROR: textbook-$i 解析后无 index.json，中止"
    exit 1
  fi
  n=$(python3 -c "import json,sys; print(len(json.load(open(sys.argv[1]))))" "$out/index.json")
  if [[ "$n" == "0" ]]; then
    echo "ERROR: textbook-$i 解析出 0 个词根族（源文件可能无文字层），中止以避免清空旧数据"
    exit 1
  fi
done

python3 "$ROOT/scripts/dedupe-words.py"

python3 << 'PY'
import json, glob, os
root = os.environ.get('ROOT', '.')
families = []
for idx_path in sorted(glob.glob(os.path.join(root, 'data/textbook-*/index.json'))):
    with open(idx_path) as f:
        for item in json.load(f):
            item['textbook'] = os.path.basename(os.path.dirname(idx_path))
            # wordCount 以家族文件实际词数为准（dedupe 后 index 值可能过期）
            fam_path = os.path.join(os.path.dirname(idx_path), item['file'])
            try:
                with open(fam_path) as f2:
                    item['wordCount'] = len(json.load(f2).get('words', []))
            except (OSError, ValueError):
                item['wordCount'] = 0
            families.append(item)
out = os.path.join(root, 'data/catalog.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(families, f, ensure_ascii=False, indent=2)
words = sum(x.get('wordCount', 0) for x in families)
print(f'Catalog: {len(families)} families, {words} words → {out}')
PY

public="$ROOT/web/public/data"
mkdir -p "$public"
rsync -a --delete --exclude '*.db' "$ROOT/data/" "$public/"
rm -f "$public/rootgraph.db"   # --exclude 会同时阻止 --delete 清理历史残留，显式删除
echo "Synced → $public"

python3 "$ROOT/scripts/build-sqlite.py"
