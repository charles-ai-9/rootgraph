#!/usr/bin/env python3
"""同族内词条去重：同一 (textbook, familyId, word) 合并为一条，避免信息丢失。

解析器（PDF / docx）可能把同一拼写（不同词性/音标，如 attribute vt/n）解析两次。
旧逻辑只保留信息量较大的一条，会丢掉另一条的释义、搭配等。现改为字段合并。
用法：python3 scripts/dedupe-words.py
"""
from __future__ import annotations

import glob
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def _sense_definition(w: dict) -> str:
    pos = (w.get("pos") or "").strip()
    definition = (w.get("definition") or "").strip()
    if not definition:
        return ""
    if pos and not definition.startswith(pos):
        return f"{pos} {definition}"
    return definition


def merge_word_entries(a: dict, b: dict) -> dict:
    """合并同拼写两条词条，保留全部释义/搭配/例句等。"""
    out = dict(a)
    other = b

    for field in ("collocations", "examples"):
        seen: set[str] = set()
        merged: list[str] = []
        for item in (out.get(field) or []) + (other.get(field) or []):
            if item and item not in seen:
                seen.add(item)
                merged.append(item)
        out[field] = merged

    for field in ("mnemonic", "etymology"):
        av = (out.get(field) or "").strip()
        bv = (other.get(field) or "").strip()
        if bv and bv not in av:
            out[field] = f"{av}\n{bv}".strip() if av else bv

    defs: list[str] = []
    for w in (a, b):
        s = _sense_definition(w)
        if s and s not in defs:
            defs.append(s)
    if defs:
        out["definition"] = " / ".join(defs)

    phonetics: list[str] = []
    for w in (a, b):
        p = (w.get("phonetic") or "").strip()
        if p and p not in phonetics:
            phonetics.append(p)
    if phonetics:
        out["phonetic"] = " / ".join(phonetics)

    poses: list[str] = []
    for w in (a, b):
        p = (w.get("pos") or "").strip()
        if p and p not in poses:
            poses.append(p)
    if len(poses) == 1:
        out["pos"] = poses[0]
    elif len(poses) > 1:
        out["pos"] = " / ".join(poses)

    freqs = [w.get("frequency") for w in (a, b) if w.get("frequency") is not None]
    if freqs:
        out["frequency"] = max(freqs)

    if not out.get("rootHint") and other.get("rootHint"):
        out["rootHint"] = other["rootHint"]

    return out


def sync_index_wordcount(textbook_dir: Path) -> None:
    idx_path = textbook_dir / "index.json"
    try:
        with open(idx_path, encoding="utf-8") as f:
            idx = json.load(f)
    except (OSError, ValueError):
        return
    changed = False
    for e in idx:
        fam_path = textbook_dir / e["file"]
        try:
            with open(fam_path, encoding="utf-8") as f:
                n = len(json.load(f).get("words", []))
        except (OSError, ValueError):
            continue
        if e.get("wordCount") != n:
            e["wordCount"] = n
            changed = True
    if changed:
        with open(idx_path, "w", encoding="utf-8") as f:
            json.dump(idx, f, ensure_ascii=False, indent=2)


def dedupe() -> None:
    total_merged = 0
    for path in sorted(glob.glob(str(ROOT / "app" / "public" / "data" / "textbook-*" / "*.json"))):
        if os.path.basename(path) == "index.json":
            continue
        with open(path, encoding="utf-8") as f:
            fam = json.load(f)
        words = fam.get("words", [])
        by_word: dict[str, int] = {}
        out: list[dict] = []
        merged = 0
        for w in words:
            key = w.get("word", "")
            if not key:
                out.append(w)
                continue
            if key in by_word:
                idx = by_word[key]
                out[idx] = merge_word_entries(out[idx], w)
                merged += 1
            else:
                by_word[key] = len(out)
                out.append(w)
        if merged:
            fam["words"] = out
            with open(path, "w", encoding="utf-8") as f:
                json.dump(fam, f, ensure_ascii=False, indent=2)
            total_merged += merged
            print(f"  {path}: 合并 {merged} 条重复词条")
    for tb_dir in sorted((ROOT / "app" / "public" / "data").glob("textbook-*")):
        sync_index_wordcount(tb_dir)
    print(f"dedupe 完成，共合并 {total_merged} 条重复词条")


if __name__ == "__main__":
    dedupe()
