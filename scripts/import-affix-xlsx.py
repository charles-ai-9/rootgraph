#!/usr/bin/env python3
"""从 20000词汇常见前缀后缀总结表.xlsx 生成词缀库 seed JSON。"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
ROOT = Path(__file__).resolve().parents[1]
DEFAULT_XLSX = Path.home() / "Downloads/词根词缀/词根词缀总结表/20000词汇常见前缀后缀总结表.xlsx"
OUT = ROOT / "web/src/data/affix-library-seed.json"
OUT_PUBLIC = ROOT / "web/public/data/affix-library-seed.json"


def col_row(cell_ref: str) -> tuple[str, int]:
    m = re.match(r"([A-Z]+)(\d+)", cell_ref)
    return m.group(1), int(m.group(2))


def read_xlsx(path: Path) -> list[tuple[str, dict[int, dict[str, str]]]]:
    with zipfile.ZipFile(path) as z:
        ss: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                ss.append("".join((t.text or "") for t in si.findall(".//m:t", NS)))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheets: list[tuple[str, dict[int, dict[str, str]]]] = []

        for sh in wb.findall(".//m:sheet", NS):
            name = sh.attrib["name"]
            rid = sh.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = "xl/" + rid_to_target[rid].lstrip("/").replace("xl/", "")
            root = ET.fromstring(z.read(target))
            rows: dict[int, dict[str, str]] = {}
            for row in root.findall(".//m:sheetData/m:row", NS):
                for c in row.findall("m:c", NS):
                    ref = c.attrib.get("r", "")
                    col, rn = col_row(ref)
                    v = c.find("m:v", NS)
                    if v is None:
                        val = ""
                    elif c.attrib.get("t") == "s":
                        val = ss[int(v.text)]
                    else:
                        val = v.text or ""
                    rows.setdefault(rn, {})[col] = val.strip()
            sheets.append((name, rows))
        return sheets


def split_forms(text: str) -> list[str]:
    text = text.replace("，", ",").replace("、", ",").replace("/", ",")
    parts = [p.strip() for p in re.split(r"[,;；]", text) if p.strip()]
    out: list[str] = []
    for raw in parts:
        p = re.sub(r"\s+", "", raw)
        if not p:
            continue
        if p.startswith("-"):
            out.append(p if p.startswith("-") else f"-{p}")
        elif re.match(r"^[a-zA-Z]", p):
            out.append(p if p.endswith("-") else f"{p}-")
        else:
            out.append(p)
    return out


def clean_text(s: str) -> str:
    s = re.sub(r"\xa0+", " ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def infer_pos(meaning: str) -> str:
    tags: list[str] = []
    if re.search(r"名词|n\.|表人|表物", meaning):
        tags.append("n.")
    if re.search(r"形容词|adj\.|…的", meaning):
        tags.append("adj.")
    if re.search(r"动词|v\.", meaning):
        tags.append("v.")
    if re.search(r"副词|adv\.", meaning):
        tags.append("adv.")
    return " / ".join(tags)


def format_meanings(parts: list[str]) -> str:
    parts = [clean_text(p) for p in parts if clean_text(p)]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return "\n".join(f"{i}. {p}" for i, p in enumerate(parts, 1))


def format_examples(parts: list[str]) -> str:
    parts = [clean_text(p.replace("\t", " ")) for p in parts if clean_text(p)]
    return "\n\n".join(parts)


def parse_sheet(rows: dict[int, dict[str, str]], kind: str) -> list[dict]:
    groups: list[dict] = []
    current: dict | None = None

    for r in sorted(rows):
        if r <= 2:
            continue
        row = rows[r]
        seq = row.get("B", "").strip()
        form = row.get("C", "").strip()
        meaning = clean_text(row.get("D", ""))
        examples = " ".join(filter(None, [row.get("E", ""), row.get("F", ""), row.get("G", "")]))
        examples = clean_text(examples.replace("\t", " "))

        if not form and not meaning and not examples:
            continue

        if seq or (form and not current):
            if current:
                groups.append(current)
            current = {
                "kind": kind,
                "forms": split_forms(form) if form else [],
                "meanings": [meaning] if meaning else [],
                "examples": [examples] if examples else [],
            }
        elif current:
            if meaning:
                current["meanings"].append(meaning)
            if examples:
                current["examples"].append(examples)

    if current:
        groups.append(current)
    return groups


def groups_to_items(groups: list[dict]) -> list[dict]:
    items: list[dict] = []
    seq = 0

    for g in groups:
        forms: list[str] = g.get("forms") or []
        if not forms:
            continue
        seq += 1
        meaning = format_meanings(g.get("meanings") or [])
        note = format_examples(g.get("examples") or [])
        pos = infer_pos(meaning)
        kind = g["kind"]
        is_multi = len(forms) > 1
        parent_id = f"p{seq:03d}"

        items.append(
            {
                "id": parent_id,
                "kind": kind,
                "name": forms[0],
                "pos": pos,
                "meaning": meaning,
                "note": note,
                "isParent": is_multi,
                "parentId": None,
                "order": seq,
            }
        )

        for idx, form in enumerate(forms[1:], start=1):
            items.append(
                {
                    "id": f"p{seq:03d}c{idx}",
                    "kind": kind,
                    "name": form,
                    "pos": pos,
                    "meaning": meaning,
                    "note": "",
                    "isParent": False,
                    "parentId": parent_id if is_multi else None,
                    "order": seq,
                }
            )

    return items


def main() -> None:
    xlsx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_XLSX
    if not xlsx.exists():
        print(f"File not found: {xlsx}", file=sys.stderr)
        sys.exit(1)

    all_items: list[dict] = []
    meta = {"source": xlsx.name, "prefixGroups": 0, "suffixGroups": 0}

    for name, rows in read_xlsx(xlsx):
        kind = "prefix" if "前缀" in name else "suffix"
        groups = parse_sheet(rows, kind)
        if kind == "prefix":
            meta["prefixGroups"] = len(groups)
        else:
            meta["suffixGroups"] = len(groups)
        all_items.extend(groups_to_items(groups))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    payload = {"meta": meta, "items": all_items}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT.write_text(text, encoding="utf-8")
    OUT_PUBLIC.write_text(text, encoding="utf-8")
    print(f"Wrote {len(all_items)} items -> {OUT}")


if __name__ == "__main__":
    main()
