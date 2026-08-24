#!/usr/bin/env python3
"""合并所有 chunk 输出 → 校验 → scripts/manual-data/phonetic-american.json"""
import json, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TMP = ROOT / ".tmp-phonetic"

IPA_CHARS = set("iɪeɛæɑʌɔoʊuəɚɝaɪaʊɔɪeɪoʊpbtdkɡfvθðszʃʒtʃdʒmnŋlɹjwhˈˌ.")

# 1. 读词表
wordlist = json.load(open("/tmp/wordlist.json"))
expected = {w["word"]: w for w in wordlist}
print(f"期望词数: {len(expected)}")

# 2. 读所有输出
merged = {}
missing_files = []
for i in range(28):
    p = TMP / f"out-{i:03d}.json"
    if not p.exists():
        missing_files.append(p.name)
        continue
    try:
        arr = json.load(open(p))
    except Exception as e:
        print(f"  ✗ {p.name} JSON 解析失败: {e}")
        continue
    for e in arr:
        w = e.get("word", "").strip()
        ipa = e.get("ipa", "").strip()
        if not w or not ipa:
            print(f"  ✗ {p.name} 空条目: {e}")
            continue
        if w in merged:
            print(f"  ✗ {p.name} 重复词: {w}")
        merged[w] = ipa

print(f"已合并: {len(merged)} 词, 缺失文件: {missing_files or '无'}")

# 3. 校验
missing = [w for w in expected if w not in merged]
extra = [w for w in merged if w not in expected]
bad_chars = [w for w, ipa in merged.items() if any(c not in IPA_CHARS for c in ipa)]
no_stress = [w for w, ipa in merged.items() if len(ipa) > 4 and "ˈ" not in ipa and "ˌ" not in ipa]
print(f"词表有但未生成: {len(missing)} {missing[:10]}")
print(f"生成了词表外的: {len(extra)} {extra[:10]}")
print(f"非法字符: {len(bad_chars)} {[(w, merged[w]) for w in bad_chars[:5]]}")
print(f"多音节无重音: {len(no_stress)} {no_stress[:10]}")

# 4. 写入 manual-data（词 → 音标 映射）
out = {}
for w in expected:
    if w in merged:
        out[w] = merged[w]
out_path = ROOT / "scripts" / "manual-data" / "phonetic-american.json"
out_path.write_text(json.dumps(out, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
print(f"写入 {out_path}: {len(out)} 词")

# 5. 打印抽样供人工检查
import random
random.seed(7)
sample = random.sample(sorted(out.items()), 25)
for w, ipa in sample:
    print(f"  {w}: {ipa}")
