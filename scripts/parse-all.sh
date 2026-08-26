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
  out="$ROOT/app/public/data/textbook-$i"
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

python3 "$ROOT/scripts/post-fix-data.py"

python3 "$ROOT/scripts/dedupe-words.py"

python3 << 'PY'
import json, glob, os
root = os.environ.get('ROOT', '.')
# 旧 catalog 映射：(textbook, chapter, roots) → id；重导后 id 分配变化时记录 legacyId 供前端笔记迁移
old_map = {}
try:
    with open(os.path.join(root, 'app/public/data/catalog.json'), encoding='utf-8') as f:
        for e in json.load(f):
            old_map[(e.get('textbook'), e.get('chapter'),
                     json.dumps(e.get('roots', []), ensure_ascii=False, sort_keys=True))] = e.get('id')
except (OSError, ValueError):
    pass
families = []
for idx_path in sorted(glob.glob(os.path.join(root, 'app/public/data/textbook-*/index.json'))):
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
            key = (item['textbook'], item.get('chapter'),
                   json.dumps(item.get('roots', []), ensure_ascii=False, sort_keys=True))
            old_id = old_map.get(key)
            if old_id and old_id != item['id']:
                item['legacyId'] = old_id
            families.append(item)
out = os.path.join(root, 'app/public/data/catalog.json')
with open(out, 'w', encoding='utf-8') as f:
    json.dump(families, f, ensure_ascii=False, indent=2)
words = sum(x.get('wordCount', 0) for x in families)
print(f'Catalog: {len(families)} families, {words} words → {out}')
PY

python3 "$ROOT/scripts/validate-data.py"

python3 "$ROOT/scripts/build-sqlite.py"
