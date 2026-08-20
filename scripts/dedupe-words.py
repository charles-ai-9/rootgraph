#!/usr/bin/env python3
"""同族内词条去重：同一 (textbook, familyId, word) 保留信息量最大的条目。

解析器（PDF / docx）会把同一词解析两次（字段互有缺失），
前端会渲染出两张重复卡。此脚本在 parse-all.sh 中解析后运行。
用法：python3 scripts/dedupe-words.py
"""
from __future__ import annotations

import glob
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

SCORED_FIELDS = [
    "phonetic",
    "pos",
    "definition",
    "frequency",
    "mnemonic",
    "collocations",
    "etymology",
    "examples",
    "rootHint",
]


def info_score(w: dict) -> int:
    return sum(1 for f in SCORED_FIELDS if w.get(f) not in (None, "", [], {}))


def dedupe() -> None:
    total_removed = 0
    for path in sorted(glob.glob(str(ROOT / "data" / "textbook-*" / "*.json"))):
        if os.path.basename(path) == "index.json":
            continue
        with open(path, encoding="utf-8") as f:
            fam = json.load(f)
        words = fam.get("words", [])
        by_word: dict[str, int] = {}
        out: list[dict] = []
        removed = 0
        for w in words:
            key = w.get("word", "")
            if not key:
                out.append(w)
                continue
            if key in by_word:
                idx = by_word[key]
                if info_score(w) > info_score(out[idx]):
                    out[idx] = w
                removed += 1
            else:
                by_word[key] = len(out)
                out.append(w)
        if removed:
            fam["words"] = out
            with open(path, "w", encoding="utf-8") as f:
                json.dump(fam, f, ensure_ascii=False, indent=2)
            total_removed += removed
            print(f"  {path}: 去重 {removed} 条")
    print(f"dedupe 完成，共移除 {total_removed} 条重复词条")


if __name__ == "__main__":
    dedupe()
