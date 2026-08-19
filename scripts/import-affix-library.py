#!/usr/bin/env python3
"""从 词根词缀.docx 生成词缀库 seed；可选合并 xlsx 例词。"""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DOCX = Path.home() / "Downloads/词根词缀/词根词缀.docx"
DEFAULT_XLSX = Path.home() / "Downloads/词根词缀/词根词缀总结表/20000词汇常见前缀后缀总结表.xlsx"
OUT = ROOT / "web/src/data/affix-library-seed.json"
OUT_PUBLIC = ROOT / "web/public/data/affix-library-seed.json"

NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
WNS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def clean_text(s: str) -> str:
    s = re.sub(r"\xa0+", " ", s)
    s = re.sub(r"[ \t]+", " ", s)
    return s.strip()


def read_docx_paras(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    paras: list[str] = []
    for p in root.findall(".//w:p", WNS):
        texts = [t.text or "" for t in p.findall(".//w:t", WNS)]
        line = clean_text("".join(texts))
        if line:
            paras.append(line)
    return paras


def normalize_form_auto(token: str, kind: str | None = None) -> str:
    token = clean_text(token).replace("–", "-").replace("—", "-")
    if not token:
        return ""
    lead = token.startswith("-")
    trail = token.endswith("-")
    core = token.strip("-")
    if not core:
        return ""

    if kind == "prefix" or (kind is None and trail and not lead):
        return f"{core}-"
    if kind == "suffix" or (kind is None and lead and not trail):
        return f"-{core}"
    if kind == "root" or (kind is None and lead and trail):
        return f"-{core}-"
    return f"-{core}-"


def normalize_form(name: str, kind: str) -> str:
    return normalize_form_auto(name, kind)


def split_form_tokens(form_part: str, kind: str | None = None) -> list[str]:
    form_part = clean_text(form_part)
    if not form_part:
        return []

    form_part = re.sub(r"^扩展词根\s*\d+\.\s*", "", form_part)
    form_part = re.sub(r"^词根\s*\d+\s*补充：\s*", "", form_part)
    form_part = form_part.replace("，", ",").replace("、", ",").replace("；", ",").replace(";", ",")
    chunks = re.split(r"\s*=\s*|\s*,\s*|\s+(?=-)", form_part)

    out: list[str] = []
    seen: set[str] = set()
    for raw in chunks:
        token = raw.strip(" =，,")
        if not token or token in ("=", "-"):
            continue
        norm = normalize_form_auto(token, kind or "root")
        if kind == "prefix" and norm.startswith("-") and not norm.endswith("-"):
            norm = f"{norm.strip('-')}-"
        elif kind == "suffix":
            norm = normalize_form_auto(token, "suffix")
        if norm and norm not in seen:
            seen.add(norm)
            out.append(norm)
    return out


def extract_forms_meaning(line: str, kind: str) -> tuple[list[str], str, bool]:
    line = clean_text(line)
    if not line or line in ("前缀", "后缀"):
        return [], "", True
    if "词根vx" in line:
        return [], "", True
    if re.match(r"^\d+\.$", line):
        return [], "", True

    line = re.sub(r"^\d+\.\s*", "", line)

    m = re.search(r"[\u4e00-\u9fff（(\[]", line)
    if m:
        form_part = line[: m.start()].strip(" =，,")
        meaning = line[m.start() :].strip()
    else:
        form_part = line.strip(" =，,")
        meaning = ""

    if kind == "prefix" and meaning and re.search(r"后缀|词缀", meaning):
        forms = split_form_tokens(form_part, "suffix")
    elif kind == "root" and line_looks_like_prefix_forms(form_part):
        forms = split_form_tokens(form_part, "prefix")
    else:
        forms = split_form_tokens(form_part, kind)
    return forms, meaning, False


def is_meaning_only(line: str) -> bool:
    line = clean_text(line)
    if not line or re.match(r"^\d+\.$", line):
        return False
    if re.search(r"[a-zA-Z]-|[\-–—][a-zA-Z]", line):
        return False
    return bool(re.search(r"[\u4e00-\u9fff]", line))


def is_variant_note(line: str) -> bool:
    return bool(re.search(r"也作|也写成|也记作", line))


def is_prefix_shaped_form(form: str) -> bool:
    form = clean_text(form).replace("–", "-").replace("—", "-")
    return bool(re.match(r"^[a-zA-Z?()]{1,8}-$", form))


def line_looks_like_prefix_forms(form_part: str) -> bool:
    """词根区误放的 prefix 行：con- = co-（无 leading hyphen），不是 -form- 词根形。"""
    form_part = clean_text(form_part)
    if not form_part:
        return False
    form_part = re.sub(r"^扩展词根\s*\d+\.\s*", "", form_part)
    form_part = re.sub(r"^词根\s*\d+\s*补充：\s*", "", form_part)
    form_part = form_part.replace("，", ",").replace("、", ",").replace("；", ",").replace(";", ",")
    chunks = re.split(r"\s*=\s*|\s*,\s*|\s+(?=-)", form_part)
    seen = False
    for raw in chunks:
        token = raw.strip(" =，,")
        if not token or token in ("=", "-"):
            continue
        seen = True
        if token.startswith("-"):
            return False
        if not is_prefix_shaped_form(token):
            return False
    return seen


def looks_like_prefix_forms(forms: list[str]) -> bool:
    return bool(forms) and all(is_prefix_shaped_form(f) for f in forms)


def looks_like_root_forms(forms: list[str]) -> bool:
    return bool(forms) and all(f.startswith("-") and f.endswith("-") for f in forms)


def looks_like_suffix_forms(forms: list[str]) -> bool:
    return bool(forms) and all(f.startswith("-") and not f.endswith("-") for f in forms)


def normalize_forms_for_kind(forms: list[str], kind: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in forms:
        norm = normalize_form(raw, kind)
        if not norm or norm in seen:
            continue
        # 保留 o??- / i??- 独立条目；其余 ?? 变体跳过
        if kind == "prefix" and "??" in norm and norm not in ("o??-", "i??-"):
            continue
        seen.add(norm)
        out.append(norm)
    return out


def classify_form_kind(forms: list[str]) -> str:
    if not forms:
        return "root"
    if looks_like_prefix_forms(forms):
        return "prefix"
    if looks_like_suffix_forms(forms):
        return "suffix"
    if looks_like_root_forms(forms):
        return "root"
    return "root"


def parse_docx_groups(paras: list[str]) -> dict[str, list[dict]]:
    section = "root"
    groups: dict[str, list[dict]] = {"root": [], "prefix": [], "suffix": []}
    i = 0

    while i < len(paras):
        line = paras[i]
        if line == "前缀":
            section = "prefix"
            i += 1
            continue
        if line == "后缀":
            section = "suffix"
            i += 1
            continue

        parse_kind = section
        forms, meaning, skip = extract_forms_meaning(line, parse_kind)
        if skip:
            i += 1
            continue

        if not meaning and i + 1 < len(paras) and is_meaning_only(paras[i + 1]):
            meaning = clean_text(paras[i + 1])
            i += 2
        else:
            i += 1

        if not forms and meaning and is_variant_note(meaning) and groups[section]:
            groups[section][-1]["meanings"].append(meaning)
            continue

        if not forms:
            continue

        kind = section
        if section == "root":
            if looks_like_prefix_forms(forms):
                kind = "prefix"
            else:
                kind = "root"
        elif section == "prefix":
            detected = classify_form_kind(forms)
            if detected == "suffix":
                kind = "suffix"
            elif detected == "root" and looks_like_root_forms(forms):
                kind = "root"

        forms = normalize_forms_for_kind(forms, kind)
        if not forms:
            continue

        groups[kind].append({"kind": kind, "forms": forms, "meanings": [meaning] if meaning else [], "examples": []})

    return groups


def col_row(cell_ref: str) -> tuple[str, int]:
    m = re.match(r"([A-Z]+)(\d+)", cell_ref)
    return m.group(1), int(m.group(2))


def read_xlsx(path: Path) -> list[tuple[str, dict[int, dict[str, str]]]]:
    with zipfile.ZipFile(path) as z:
        ss: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            sroot = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in sroot.findall("m:si", NS):
                ss.append("".join((t.text or "") for t in si.findall(".//m:t", NS)))

        wb = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        rid_to_target = {rel.attrib["Id"]: rel.attrib["Target"] for rel in rels}
        sheets: list[tuple[str, dict[int, dict[str, str]]]] = []

        for sh in wb.findall(".//m:sheet", NS):
            name = sh.attrib["name"]
            rid = sh.attrib.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
            target = "xl/" + rid_to_target[rid].lstrip("/").replace("xl/", "")
            sroot = ET.fromstring(z.read(target))
            rows: dict[int, dict[str, str]] = {}
            for row in sroot.findall(".//m:sheetData/m:row", NS):
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


def xlsx_split_forms(text: str, kind: str) -> list[str]:
    text = text.replace("，", ",").replace("、", ",").replace("/", ",")
    parts = [p.strip() for p in re.split(r"[,;；]", text) if p.strip()]
    out: list[str] = []
    for raw in parts:
        norm = normalize_form(re.sub(r"\s+", "", raw), kind)
        if norm:
            out.append(norm)
    return out


def parse_xlsx_groups(path: Path) -> dict[str, list[dict]]:
    groups: dict[str, list[dict]] = {"prefix": [], "suffix": []}
    if not path.exists():
        return groups

    for name, rows in read_xlsx(path):
        kind = "prefix" if "前缀" in name else "suffix"
        current: dict | None = None

        for r in sorted(rows):
            if r <= 2:
                continue
            row = rows[r]
            seq = row.get("B", "").strip()
            form = row.get("C", "").strip()
            meaning = clean_text(row.get("D", ""))
            examples = clean_text(" ".join(filter(None, [row.get("E", ""), row.get("F", ""), row.get("G", "")])).replace("\t", " "))

            if not form and not meaning and not examples:
                continue

            if seq or (form and not current):
                if current:
                    groups[kind].append(current)
                current = {
                    "kind": kind,
                    "forms": xlsx_split_forms(form, kind) if form else [],
                    "meanings": [meaning] if meaning else [],
                    "examples": [examples] if examples else [],
                }
            elif current:
                if meaning:
                    current["meanings"].append(meaning)
                if examples:
                    current["examples"].append(examples)

        if current:
            groups[kind].append(current)

    return groups


def form_key(forms: list[str]) -> frozenset[str]:
    return frozenset(normalize_form(f, "prefix" if f.endswith("-") and not f.startswith("-") else "suffix") for f in forms)


def merge_xlsx_examples(docx_groups: dict[str, list[dict]], xlsx_groups: dict[str, list[dict]]) -> None:
    """仅合并 xlsx 例词；词缀分组以 docx 为准，避免 xlsx 误合并。"""
    for kind in ("prefix", "suffix"):
        example_by_forms: dict[frozenset[str], str] = {}
        for g in xlsx_groups.get(kind, []):
            forms = g.get("forms") or []
            if not forms:
                continue
            note = "\n\n".join(clean_text(x) for x in g.get("examples") or [] if clean_text(x))
            if note:
                example_by_forms[form_key(forms)] = note

        for g in docx_groups.get(kind, []):
            forms = g.get("forms") or []
            if not forms:
                continue
            key = form_key(forms)
            if key in example_by_forms and not g.get("examples"):
                g["examples"] = [example_by_forms[key]]


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


def clean_meaning_line(s: str) -> str:
    s = clean_text(s)
    while True:
        n = re.sub(r"^\d+[.．、]\s*", "", s)
        if n == s:
            break
        s = n.strip()
    return s


def format_meanings(parts: list[str]) -> str:
    parts = [clean_meaning_line(p) for p in parts if clean_meaning_line(p)]
    if not parts:
        return ""
    if len(parts) == 1:
        return parts[0]
    return "\n".join(f"{i}. {p}" for i, p in enumerate(parts, 1))


def groups_to_items(groups: list[dict], id_prefix: str) -> list[dict]:
    items: list[dict] = []
    seq = 0

    for g in groups:
        forms: list[str] = g.get("forms") or []
        if not forms:
            continue
        seq += 1
        kind = g["kind"]
        meaning = format_meanings(g.get("meanings") or [])
        note = "\n\n".join(clean_text(x) for x in g.get("examples") or [] if clean_text(x))
        pos = infer_pos(meaning)
        is_multi = len(forms) > 1
        parent_id = f"{id_prefix}{seq:03d}"

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
                    "id": f"{parent_id}c{idx}",
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
    docx = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_DOCX
    xlsx = Path(sys.argv[2]) if len(sys.argv) > 2 else DEFAULT_XLSX

    if not docx.exists():
        print(f"File not found: {docx}", file=sys.stderr)
        sys.exit(1)

    paras = read_docx_paras(docx)
    docx_groups = parse_docx_groups(paras)
    xlsx_groups = parse_xlsx_groups(xlsx)
    merge_xlsx_examples(docx_groups, xlsx_groups)

    all_items: list[dict] = []
    all_items.extend(groups_to_items(docx_groups["root"], "r"))
    all_items.extend(groups_to_items(docx_groups["prefix"], "p"))
    all_items.extend(groups_to_items(docx_groups["suffix"], "s"))

    meta = {
        "source": docx.name,
        "rootGroups": len(docx_groups["root"]),
        "prefixGroups": len(docx_groups["prefix"]),
        "suffixGroups": len(docx_groups["suffix"]),
        "xlsxExamplesMerged": xlsx.exists(),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    payload = {"meta": meta, "items": all_items}
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    OUT.write_text(text, encoding="utf-8")
    OUT_PUBLIC.write_text(text, encoding="utf-8")
    print(
        f"Wrote {len(all_items)} items "
        f"({meta['rootGroups']} roots + {meta['prefixGroups']} prefixes + {meta['suffixGroups']} suffixes) -> {OUT}"
    )


if __name__ == "__main__":
    main()
