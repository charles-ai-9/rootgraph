#!/usr/bin/env python3
"""Audit parsed JSON against source PDF/docx for known loss patterns."""
from __future__ import annotations

import json
import re
import subprocess
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOWNLOADS = Path.home() / "Downloads"
DESKTOP_2W = Path.home() / "Desktop" / "2w"
WNS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

WORD_LINE_RE = re.compile(r"^(\s*)([a-zA-Z][a-zA-Z -]*)\s*\[([^\]]+)\]\s*(.*)$")
WORD_NO_BRACKET_RE = re.compile(
    r"^(\s*)([a-zA-Z][\w-]{2,})\s+((?:n\.|vt\.|vi\.|adj\.|adv\.|v\.).+)$"
)
FREQ_ONLY_RE = re.compile(r"^\s*\d{3,6}\s*$")
POS_CONT_RE = re.compile(r"^(n\.|vt\.|vi\.|adj\.|adv\.|v\.|a\.)\s")


def source_path(textbook: int) -> tuple[Path, str] | None:
    for d in (DOWNLOADS, DESKTOP_2W):
        docx = d / f"20000词汇巅峰速记营（教材{textbook}）.docx"
        if docx.is_file():
            return docx, "docx"
        pdf = d / f"20000词汇巅峰速记营（教材{textbook}）.pdf"
        if pdf.is_file():
            return pdf, "pdf"
    return None


def read_pdf_lines(path: Path) -> list[str]:
    text = subprocess.check_output(["pdftotext", "-layout", str(path), "-"], text=True)
    return [re.sub(r"\s+", " ", ln).strip() for ln in text.splitlines() if ln.strip()]


def read_docx_lines(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    lines: list[str] = []
    for p in root.findall(".//w:p", WNS):
        t = re.sub(r"\s+", " ", "".join(x.text or "" for x in p.findall(".//w:t", WNS))).strip()
        if t:
            lines.append(t)
    return lines


def load_words(textbook: str) -> dict[str, dict]:
    words: dict[str, dict] = {}
    tb_dir = ROOT / "app" / "public" / "data" / textbook
    if not tb_dir.is_dir():
        return words
    for p in tb_dir.glob("*.json"):
        if p.name == "index.json":
            continue
        fam = json.loads(p.read_text(encoding="utf-8"))
        for w in fam.get("words", []):
            words[w["word"].lower()] = w
    return words


def blob(w: dict) -> str:
    parts = [
        w.get("definition") or "",
        " ".join(w.get("collocations") or []),
        " ".join(w.get("examples") or []),
        w.get("mnemonic") or "",
    ]
    return " ".join(parts).replace("\n", " ")


def is_next_word_line(line: str) -> bool:
    return bool(WORD_LINE_RE.match(line) or WORD_NO_BRACKET_RE.match(line))


def english_after_yongfa(lines: list[str], i: int) -> str:
    text = ""
    for j in range(i + 1, min(i + 4, len(lines))):
        ln = lines[j]
        if is_next_word_line(ln):
            break
        if "释义和用法" in ln:
            text += " " + re.sub(r".*释义和用法[：:]\s*", "", ln.strip())
            for k in range(j + 1, min(j + 10, len(lines))):
                ln2 = lines[k].strip()
                if not ln2:
                    continue
                if is_next_word_line(lines[k]):
                    break
                if ln2.startswith(("助记", "搭配", "词源", "例句", "写作", "仿写")) and "释义" not in ln2:
                    break
                if ln2.startswith("释义和用法"):
                    break
                text += " " + ln2
            break
    return text.strip()


def reading_after_word(lines: list[str], i: int) -> str:
    j = i + 1
    if j < len(lines) and FREQ_ONLY_RE.match(lines[j]):
        j += 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j >= len(lines):
        return ""
    ln = lines[j].strip()
    if is_next_word_line(lines[j]):
        return ""
    if POS_CONT_RE.match(ln):
        return ""
    if ln.startswith(("助记", "搭配", "词源", "例句", "释义", "词根", "笔记")):
        return ""
    if "→" in ln and re.search(r"[\u4e00-\u9fff]", ln):
        return ""
    if re.match(r"^[a-zA-Z][\w-]*\s*\[", ln):
        return ""
    if re.match(r"^[(\[]?[a-zA-Z]", ln) and len(ln) >= 20:
        if re.search(r"[\u4e00-\u9fff]", ln) and not re.search(r"[A-Za-z]{4,}", ln):
            return ""
        if any(x in ln for x in ("from Latin", "from Greek", "word-forming", "emptio)", "Proto-Indo")):
            return ""
        return ln[:60]
    return ""


def audit_textbook(textbook: int) -> list[str]:
    src = source_path(textbook)
    if not src:
        return [f"textbook-{textbook}: 源文件缺失，跳过"]
    path, kind = src
    lines = read_docx_lines(path) if kind == "docx" else read_pdf_lines(path)
    words = load_words(f"textbook-{textbook}")
    issues: list[str] = []

    for i, line in enumerate(lines):
        m = WORD_LINE_RE.match(line)
        if not m:
            continue
        word_key = m.group(2).strip().lower()
        if word_key not in words:
            continue
        w = words[word_key]
        b = blob(w)

        yongfa = english_after_yongfa(lines, i)
        if len(yongfa) >= 25:
            em = re.search(r"([A-Za-z].{15,35})", yongfa)
            if em and em.group(1)[:25] not in b:
                issues.append(
                    f"textbook-{textbook}/{word_key}: 释义和用法未入库 — {em.group(1)[:40]}..."
                )

        reading = reading_after_word(lines, i)
        if reading and reading[:20] not in b:
            issues.append(
                f"textbook-{textbook}/{word_key}: 阅读补充未入库 — {reading[:50]}"
            )

        rest = m.group(4) or ""
        if not re.search(r"\d{3,6}\s*$", rest.strip()):
            j = i + 1
            if j < len(lines) and FREQ_ONLY_RE.match(lines[j]):
                if w.get("frequency") is None:
                    issues.append(f"textbook-{textbook}/{word_key}: 词频换行未解析")

    return issues


def main() -> int:
    all_issues: list[str] = []
    for tb in range(1, 9):
        all_issues.extend(audit_textbook(tb))

    if not all_issues:
        print("coverage audit: 全部教材通过（未发现已知丢失模式）")
        return 0

    print(f"coverage audit: 发现 {len(all_issues)} 处可能的信息丢失：")
    for item in all_issues[:50]:
        print(f"  - {item}")
    if len(all_issues) > 50:
        print(f"  ... 另有 {len(all_issues) - 50} 处")
    return 1


if __name__ == "__main__":
    sys.exit(main())
