#!/usr/bin/env python3
"""重导后的数据修正层：解析器无法产出的手动修正，每次重导后自动重放（幂等）。

修正项：
1. cern 族 26 个 -ics 学科词 → textbook-1/ics.json 专题族（roots: ics）
2. 错标词清理：voc/critical、cern/policy、fin/battery、van/ancestor 删除错误归属
3. 解析噪声词改名：intact2→intact、age-0ld→age-old、c0-opt→co-opt
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

ICS_ROOT_HINT = "ics"

# (教材, 族id, 词) → 删除该词条（错误归属）
MISCLASSIFIED: list[tuple[str, str, str]] = [
    ("textbook-5", "voc", "critical"),
    ("textbook-1", "cern", "policy"),
    ("textbook-1", "fin", "battery"),
    ("textbook-1", "van", "ancestor"),
]

# (教材, 族id, 旧词形, 新词形)
NOISE_WORDS: list[tuple[str, str, str, str]] = [
    ("textbook-2", "tact", "intact2", "intact"),
    ("textbook-4", "ev", "age-0ld", "age-old"),
    ("textbook-4", "opt", "c0-opt", "co-opt"),
]


def load(p: Path) -> dict:
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def save(p: Path, obj: dict) -> None:
    with open(p, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, indent=2)


def family_path(tb: str, fid: str) -> Path:
    return ROOT / "data" / tb / f"{fid}.json"


def ensure_ics_family() -> None:
    """cern 族 -ics 词移入 textbook-1/ics.json（幂等：每次合并 cern 中新增的 -ics 词）"""
    cern_path = family_path("textbook-1", "cern")
    if not cern_path.exists():
        return
    cern = load(cern_path)
    from_cern = [w for w in cern["words"] if w["word"].endswith("ics")]
    if from_cern:
        cern["words"] = [w for w in cern["words"] if not w["word"].endswith("ics")]
        save(cern_path, cern)

    ics_path = family_path("textbook-1", "ics")
    if ics_path.exists():
        ics = load(ics_path)
    else:
        ics = {
            "id": "ics",
            "source": "textbook-1",
            "chapter": "附录",
            "chapterOrder": 99,
            "titleZh": "-ics 学科词",
            "semanticLabel": "学科、学问（-ics 后缀）",
            "meaningEn": "",
            "meaningZh": "",
            "roots": ["ics"],
            "words": [],
        }

    existing = {w["word"] for w in ics["words"]}
    added = 0
    for w in from_cern:
        if w["word"] not in existing:
            w["rootHint"] = ICS_ROOT_HINT
            ics["words"].append(w)
            existing.add(w["word"])
            added += 1

    if from_cern or not ics_path.exists():
        ics["words"].sort(key=lambda w: w["word"].lower())
        save(ics_path, ics)

        idx_path = ROOT / "data" / "textbook-1" / "index.json"
        idx = load(idx_path)
        entry = next((e for e in idx if e.get("id") == "ics"), None)
        wc = len(ics["words"])
        if entry:
            entry["wordCount"] = wc
        else:
            idx.append({
                "id": "ics",
                "file": "ics.json",
                "chapter": "附录",
                "chapterOrder": 99,
                "titleZh": "-ics 学科词",
                "semanticLabel": "学科、学问（-ics 后缀）",
                "meaningEn": "",
                "meaningZh": "",
                "roots": ["ics"],
                "wordCount": wc,
                "source": "textbook-1",
            })
        save(idx_path, idx)
        if added:
            print(f"  post-fix: +{added} 个 -ics 词并入 textbook-1/ics.json（共 {wc}）")


def remove_misclassified() -> None:
    for tb, fid, word in MISCLASSIFIED:
        p = family_path(tb, fid)
        if not p.exists():
            continue
        fam = load(p)
        before = len(fam["words"])
        fam["words"] = [w for w in fam["words"] if w["word"] != word]
        if len(fam["words"]) != before:
            save(p, fam)
            print(f"  post-fix: 删除 {tb}/{fid}/{word}")


def rename_noise_words() -> None:
    for tb, fid, old, new in NOISE_WORDS:
        p = family_path(tb, fid)
        if not p.exists():
            continue
        fam = load(p)
        changed = False
        for w in fam["words"]:
            if w["word"] == old:
                w["word"] = new
                changed = True
        if changed:
            save(p, fam)
            print(f"  post-fix: {tb}/{fid}/{old} → {new}")


def main() -> None:
    ensure_ics_family()
    remove_misclassified()
    rename_noise_words()
    print("post-fix 完成")


if __name__ == "__main__":
    main()
