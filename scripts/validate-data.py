#!/usr/bin/env python3
"""数据一致性校验：重导后断言 catalog / index / 家族文件三者一致。

错误（退出码 1）会中止 parse-all.sh；仅 orphan 为警告不失败。
用法：python3 scripts/validate-data.py [data-dir]
"""
from __future__ import annotations

import json
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "data"

errors: list[str] = []
warnings: list[str] = []


def check(cond: bool, msg: str) -> None:
    if not cond:
        errors.append(msg)


def load(p: Path):
    try:
        with open(p, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as e:
        errors.append(f"无法读取 {p}: {e}")
        return None


def validate() -> None:
    catalog_path = DATA / "catalog.json"
    catalog = load(catalog_path)
    if catalog is None:
        print("校验中止：catalog.json 缺失或损坏")
        sys.exit(1)

    keys = [(e.get("textbook"), e.get("id")) for e in catalog]
    dups = {k: v for k, v in Counter(keys).items() if v > 1}
    check(not dups, f"catalog 重复键 {len(dups)} 个: {sorted(dups)[:5]}")

    catalog_by_key = {(e.get("textbook"), e.get("id")): e for e in catalog}
    seen_files: set[tuple[str, str]] = set()
    total_words = 0

    for textbook in sorted(p for p in (DATA / "catalog.json").parent.iterdir() if p.is_dir() and p.name.startswith("textbook-")):
        tb = textbook.name
        idx_path = textbook / "index.json"
        idx = load(idx_path)
        if idx is None:
            continue
        idx_ids = [e.get("id") for e in idx]
        check(len(idx_ids) == len(set(idx_ids)), f"{tb}/index.json 重复 id {len(idx_ids) - len(set(idx_ids))} 个")

        idx_files = {e.get("file") for e in idx}
        for e in idx:
            fid, file = e.get("id"), e.get("file")
            fam_path = textbook / file
            fam = load(fam_path)
            if fam is None:
                continue
            check(fam.get("id") == fid, f"{tb}/{file} 内 id={fam.get('id')} 与 index 的 {fid} 不一致")
            check(file == f"{fid}.json", f"{tb}/{file} 文件名与 id 不一致")
            check((tb, file) not in seen_files, f"{tb}/{file} 被多个 index 条目引用")
            seen_files.add((tb, file))
            words = fam.get("words", [])
            check(len(words) == e.get("wordCount", -1), f"{tb}/{file} 实际词数 {len(words)} ≠ index wordCount {e.get('wordCount')}")
            check(len(words) == catalog_by_key.get((tb, fid), {}).get("wordCount", -1),
                  f"{tb}/{fid} catalog wordCount ≠ 实际词数 {len(words)}")
            wnames = [w.get("word", "") for w in words]
            wdups = {w for w, c in Counter(wnames).items() if c > 1}
            check(not wdups, f"{tb}/{file} 同族重复词条 {len(wdups)} 个: {sorted(wdups)[:5]}")
            for w in words:
                check(bool(w.get("word")), f"{tb}/{file} 存在空 word 词条")
            total_words += len(words)

            if fam.get("roots"):
                check(bool(fam["roots"][0]), f"{tb}/{file} roots 含空项")

        # orphan 检测（警告，不失败）
        disk_files = {p.name for p in textbook.glob("*.json") if p.name != "index.json"}
        orphans = sorted(disk_files - idx_files)
        if orphans:
            warnings.append(f"{tb}: {len(orphans)} 个孤儿文件未在 index 中: {orphans[:5]}")

    catalog_count = len(catalog)
    print(f"校验通过：{catalog_count} 族 / {total_words} 词（catalog wordCount 合计 {sum(e.get('wordCount', 0) for e in catalog)}）")
    for w in warnings:
        print(f"  警告: {w}")
    if errors:
        print(f"\n校验失败：{len(errors)} 个错误（前 10 个）:")
        for e in errors[:10]:
            print(f"  ✗ {e}")
        sys.exit(1)
    print("  无错误 ✓")


if __name__ == "__main__":
    validate()
