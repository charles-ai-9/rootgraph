#!/usr/bin/env python3
"""Parse textbook docx (教材3/4) into RootGraph JSON families."""
from __future__ import annotations

import json
import re
import sys
import zipfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

WNS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}

TOC_RE = re.compile(r"^词根[a-zA-Z\-,\s]+ \d+$")
TOC_COLON_RE = re.compile(r"^词根[：:]")
WORD_RE = re.compile(r"^([a-zA-Z][\w-]*(?:=[\w-]+)?)\s*\[([^\]]+)\]\s*(.*)$")
NO_PHONETIC_RE = re.compile(
    r"^([a-zA-Z][\w-]{3,})\s+([a-zA-Z./0-9]+\.\s+.*[\u4e00-\u9fff].*\s+\d{3,6})$"
)
FREQ_RE = re.compile(r"\s(\d{1,6})$")
POS_RE = re.compile(r"^[a-zA-Z./]+")
CHAPTER_NUM_RE = re.compile(r"^[一二三四五六七八九十]+、")
CHAPTER_ZH_RE = re.compile(r"^第[一二三四五六七八九十]+章")
QUOTE_CLASS = r'["\'\u201c\u201d\u2018\u2019]'
QUOTED_ROOT_RE = re.compile(rf"{QUOTE_CLASS}\s*(-?[a-zA-Z*]{{2,12}}-?){QUOTE_CLASS}")
QUOTED_ROOT_LOOSE_RE = re.compile(rf"{QUOTE_CLASS}\s*(-?[a-zA-Z*]{{2,12}}-?)")
AFFIX_ROOT_RE = re.compile(r"[-]?([a-zA-Z*]{2,12})-")


@dataclass
class WordEntry:
    word: str
    phonetic: str | None = None
    pos: str | None = None
    definition: str | None = None
    frequency: int | None = None
    mnemonic: str | None = None
    collocations: list[str] = field(default_factory=list)
    etymology: str | None = None
    examples: list[str] = field(default_factory=list)
    root_hint: str | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"word": self.word}
        # 只输出非 None 字段（避免 JSON 里显式 null，前端可安全使用）
        for key, val in (
            ("phonetic", self.phonetic),
            ("pos", self.pos),
            ("definition", self.definition),
            ("frequency", self.frequency),
            ("mnemonic", self.mnemonic),
            ("collocations", self.collocations),
            ("etymology", self.etymology),
            ("examples", self.examples),
            ("rootHint", self.root_hint),
        ):
            if val is not None:
                d[key] = val
        return d


@dataclass
class RootFamily:
    id: str
    source: str
    chapter: str
    chapter_order: int
    title_zh: str
    semantic_label: str
    meaning_en: str | None
    meaning_zh: str | None
    roots: list[str]
    words: list[WordEntry]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "source": self.source,
            "chapter": self.chapter,
            "chapterOrder": self.chapter_order,
            "titleZh": self.title_zh,
            "semanticLabel": self.semantic_label,
            "meaningEn": self.meaning_en,
            "meaningZh": self.meaning_zh,
            "roots": self.roots,
            "words": [w.to_dict() for w in self.words],
        }


def normalize_spaces(s: str) -> str:
    s = s.replace("\u00a0", " ")
    s = s.replace("词 根", "词根")
    s = s.replace("均 表 示", "均表示")
    return re.sub(r"\s+", " ", s).strip()


def normalize_docx_line(line: str) -> str:
    t = normalize_spaces(line)
    t = re.sub(r"^[ \t'‘“|]+", "", t)
    t = re.sub(r"\]([a-zA-Z./])", r"] \1", t)
    return t


def slugify(s: str) -> str:
    lowered = s.lower()
    slug = "".join(c if c.isalnum() else "-" for c in lowered)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return (slug[:60] if slug else "chapter")


def extract_roots(header: str) -> list[str]:
    idx = header.find("词根")
    if idx < 0:
        return []
    tail = header[idx + 2 :]
    tail = tail.replace("“", "").replace("”", "")
    if "=" in tail:
        tail = tail[: tail.index("=")]
    for marker in ("全部表示", "均表示"):
        if marker in tail:
            tail = tail[: tail.index(marker)]
            break
    else:
        m = re.search(r"(?<![\u4e00-\u9fff])表示", tail)
        if m:
            tail = tail[: m.start()]
    parts: list[str] = []
    for part in re.split(r"[，,、]", tail):
        part = normalize_spaces(part.replace("-", ""))
        m = re.match(r'^["\'\u201c\u201d\u2018\u2019]*([a-zA-Z*]+)', part)
        if m:
            part = m.group(1)
        else:
            part = part.strip(' "\'\u201c\u201d\u2018\u2019')
        if not part or len(part) < 2 or len(part) > 12:
            continue
        if part.lower().replace("0", "o") == "zoo" or part.lower() == "z00":
            part = "zoo"
        if not re.match(r"^[a-zA-Z*(0-9]", part):
            continue
        if any(x in part.lower() for x in ("全部都", "除了", "可以", "也是", "也是表")):
            continue
        parts.append(part)
    return parts


def extract_quoted_roots(header: str) -> list[str]:
    head = header
    for marker in (
        "也来自词根",
        "也来自",
        "来源于",
        "来自词根",
        "的变体",
        "是与单词",
        "是和单词",
        "同源",
    ):
        if marker in head:
            head = head[: head.index(marker)]
    if " 为" in head:
        head = head[: head.index(" 为")]
    roots: list[str] = []
    for m in QUOTED_ROOT_RE.finditer(head):
        root = m.group(1).replace("-", "").replace("0", "o").lstrip("-")
        if root.lower() == "z00":
            root = "zoo"
        if len(root) >= 2 and root not in roots:
            roots.append(root)
    if roots:
        return roots
    for m in QUOTED_ROOT_LOOSE_RE.finditer(head):
        root = m.group(1).replace("-", "").replace("0", "o").lstrip("-")
        if root.lower() == "z00":
            root = "zoo"
        if len(root) >= 2 and root not in roots:
            roots.append(root)
    if roots:
        return roots
    idx = head.find("词根")
    if idx >= 0:
        tail = head[idx + 2 :]
        for m in AFFIX_ROOT_RE.finditer(tail):
            root = m.group(1).replace("-", "").lstrip("-")
            if len(root) >= 2 and root not in roots:
                roots.append(root)
    return roots


def trim_label(s: str) -> str:
    t = normalize_spaces(s)
    stops = [
        "例如",
        "除了",
        "还可以",
        "也可以",
        "是源于",
        "词汇如下",
        "由此引",
        "因此",
        "其变体",
        "····",
        "含义为",
        "是压缩自",
        "是来源于",
        "是来自",
        "是源于单词",
        "与单词",
        "相关词汇",
    ]
    for stop in stops:
        if stop in t:
            t = t[: t.index(stop)]
    t = t.replace("\u201c", "").replace("\u201d", "").replace('"', "")
    return normalize_spaces(t.strip("，,；;：:\"\"''/"))


def extract_semantic_label(header: str, en: str | None, zh: str | None) -> str:
    if zh:
        cleaned = trim_label(zh)
        if re.search(r"[\u4e00-\u9fff]", cleaned) and 2 <= len(cleaned) <= 36:
            return cleaned
    if en:
        cleaned = trim_label(en)
        if 2 <= len(cleaned) <= 48:
            return cleaned
    h = normalize_spaces(header)
    sep = h.find("均表示")
    if sep < 0:
        sep = h.find("表示")
    if sep >= 0:
        tail = h[sep + len("均表示" if "均表示" in h[sep : sep + 3] else "表示") :]
        for colon in ("：", ":"):
            if colon in tail:
                right = trim_label(tail[tail.index(colon) + 1 :])
                if len(right) >= 2:
                    return right[:36]
        cleaned = trim_label(tail)
        if len(cleaned) >= 2:
            return cleaned[:36]
    if "=" in h:
        after = h[h.index("=") + 1 :]
        for colon in ("：", ":"):
            if colon in after:
                right = trim_label(after[after.index(colon) + 1 :])
                if re.search(r"[\u4e00-\u9fff]", right):
                    return right[:36]
        m = re.search(r"[\u4e00-\u9fff]", after)
        if m:
            return trim_label(after[m.start() :])[:36]
        return trim_label(after)[:36]
    roots = extract_roots(header)
    return trim_label("/".join(roots[:3]))


def chinese_chapter_order(chapter: str) -> int:
    if chapter.startswith("十一"):
        return 11
    if chapter.startswith("十"):
        return 10
    mapping = {"一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9}
    if chapter and chapter[0] in mapping:
        return mapping[chapter[0]]
    if chapter.isdigit():
        return int(chapter) + 100
    return 999


def is_supplementary_header(t: str) -> bool:
    bad = [
        "除了",
        "还可以",
        "例如",
        "词汇如下",
        "变体有",
        "是源于单词",
        "是来源于",
        "是压缩自",
        "因此包括",
        "相关词汇",
        "引申义为",
        "派生出",
        "作动词表示",
        "作名词",
        "还可以表示",
        "还可以进一步",
        "还可以进一步引申",
        '均表示"to',
        "……",
    ]
    if any(x in t for x in bad):
        return True
    # Avoid matching 也是 inside 的含义
    if "也是表" in t or "也是表示" in t or "也是源于" in t:
        return True
    if "····" in t:
        return True
    if t.startswith('词根"') and "=" not in t and "表示" not in t and "含义" not in t:
        return True
    return False


def is_overview_header(t: str) -> bool:
    """Skip multi-root preview lines (viv+bio+zoo+quick in one paragraph)."""
    lower = t.lower()
    hits = sum(1 for k in ("viv", "bio", "zoo", "quick") if k in lower)
    return hits >= 3 and "词根" in t


def extract_meanings(header: str) -> tuple[str | None, str | None]:
    en: str | None = None
    zh: str | None = None
    cleaned = re.sub(r"^[一二三四五六七八九十]+、\s*", "", header)
    cleaned = re.sub(r"^第[一二三四五六七八九十]+章\s*", "", cleaned)
    cleaned = re.sub(r"^词根\s*", "", cleaned)

    if "=" in cleaned:
        after = cleaned[cleaned.index("=") + 1 :]
        for colon in ("：", ":"):
            if colon in after:
                en = normalize_spaces(after[: after.index(colon)])
                zh_part = after[after.index(colon) + 1 :]
                zh_part = zh_part.replace("“", "").replace("”", "")
                for stop in ("全部", "均"):
                    if stop in zh_part:
                        zh_part = zh_part[: zh_part.index(stop)]
                zh = normalize_spaces(zh_part)
                break
        else:
            en = normalize_spaces(after)
    else:
        sep = cleaned.find("均表示")
        if sep < 0:
            sep = cleaned.find("表示")
        if sep >= 0:
            marker = "均表示" if cleaned[sep :].startswith("均表示") else "表示"
            zh_part = cleaned[sep + len(marker) :]
            zh_part = zh_part.replace("\u201c", "").replace("\u201d", "").replace('"', "")
            for colon in ("：", ":"):
                if colon in zh_part:
                    left = normalize_spaces(zh_part[: zh_part.index(colon)])
                    right = normalize_spaces(zh_part[zh_part.index(colon) + 1 :])
                    en = left.replace("/", " / ")
                    zh = trim_label(right)
                    break
            else:
                zh = trim_label(zh_part)
    return en, zh


def parse_word_line(line: str) -> tuple[str, str | None, str] | None:
    line = normalize_docx_line(line)
    m = WORD_RE.match(line)
    if m:
        word = m.group(1)
        if "=" in word:
            word = word.split("=")[0]
        word = word.replace("z00", "zoo").replace("Z00", "zoo")
        return word, m.group(2), m.group(3)
    m = NO_PHONETIC_RE.match(line)
    if m and len(m.group(1)) >= 3:
        return m.group(1), None, m.group(2)
    return None


def parse_definition_rest(rest: str) -> tuple[str | None, str | None, int | None]:
    text = normalize_spaces(rest)
    freq: int | None = None
    # docx 原文把「词频 助记/词源/搭配」挤在释义行尾（如「…大量146 助记：much…」、
    # 「…中和 搭配：counteract…」）：数字可选，提取词频并截断标签内容
    m = re.search(
        r"(?<!\d)(\d{2,6})?\s*(?:助记|词源|搭配|阅读难点|笔记区|笔 记 区)[：:]?\s*",
        text,
    )
    if m:
        if m.group(1):
            freq = int(m.group(1))
        text = normalize_spaces(text[: m.start()])
    if freq is None:
        m = re.search(r"(?<=[\u4e00-\u9fff])(\d{2,6})$", text)
        if m:
            freq = int(m.group(1))
            text = normalize_spaces(text[: m.start()])
    if freq is None:
        m = FREQ_RE.search(text)
        if m:
            freq = int(m.group(1))
            text = normalize_spaces(text[: m.start()])
    pos: str | None = None
    pm = POS_RE.match(text)
    if pm:
        pos = pm.group(0)
        text = normalize_spaces(text[pm.end() :])
    return pos, (text or None), freq


INLINE_TAG_RE = re.compile(r"(助记|词源|搭配|阅读难点)[：:]")


def split_inline_annotations(rest: str) -> tuple[str, list[str], str | None, str | None]:
    """从词条同一行拆出 inline 搭配/助记/词源（docx 常见「265 搭配：…」）"""
    text = normalize_spaces(rest)
    collocations: list[str] = []
    mnemonic: str | None = None
    etymology: str | None = None
    m = INLINE_TAG_RE.search(text)
    if not m:
        return text, collocations, mnemonic, etymology
    def_text = normalize_spaces(text[: m.start()])
    remainder = text[m.start() :]
    while remainder:
        tm = INLINE_TAG_RE.match(remainder)
        if not tm:
            break
        tag = tm.group(1)
        remainder = remainder[tm.end() :]
        nm = INLINE_TAG_RE.search(remainder)
        chunk = normalize_spaces(remainder[: nm.start()] if nm else remainder)
        if tag == "搭配" and chunk:
            collocations.append(chunk)
        elif tag == "助记" and chunk:
            mnemonic = f"{mnemonic}\n{chunk}".strip() if mnemonic else chunk
        elif tag == "词源" and chunk:
            etymology = f"{etymology} {chunk}".strip() if etymology else chunk
        remainder = remainder[nm.start() :] if nm else ""
    return def_text, collocations, mnemonic, etymology


def is_toc_line(t: str) -> bool:
    if TOC_RE.match(t):
        return True
    if TOC_COLON_RE.match(t) and re.search(r"\d{1,3}$", t):
        if not any(x in t for x in ("表示", "含义", "=")):
            return True
    return False


def is_chapter_header(line: str) -> bool:
    t = normalize_docx_line(line)
    if t.startswith(("助记", "搭配", "词源")):
        return False
    if is_overview_header(t):
        return False
    if is_toc_line(t):
        return False
    if len(t) > 180:
        return False
    if "助记：" in t or "助记:" in t:
        return False
    if t.startswith("昨") and ("单词" in t[:8] or "单 词" in t[:10]):
        return False

    if CHAPTER_NUM_RE.match(t) and "词根" in t:
        return True
    if CHAPTER_ZH_RE.match(t) and "词根" in t:
        return True
    if re.match(r"^词根", t) and any(x in t for x in ("=", "表示", "含义")):
        return True
    if "有的单词" in t and "表示" in t:
        return True
    if t.startswith("昨"):
        if "含义表示" in t:
            return True
        if "词根" in t and (
            "表示" in t or "含义" in t or "来源于" in t or "也可以表示" in t or "也有" in t
        ):
            return True
        if re.search(rf"{QUOTE_CLASS}\s*[a-zA-Z*-]{{2,}}", t) and (
            "表示" in t or "含义" in t or "来源于" in t
        ):
            return True
    if "含义表示" in t and re.search(r"[a-zA-Z]{2,}-", t):
        return True
    if re.search(r"[Zz][o0]{2}-|zoo-|zo-", t) and "词根" in t and t.startswith(("眶", "昨", "词根")):
        return True
    return False


def is_noise_line(line: str) -> bool:
    t = normalize_spaces(line)
    if not t:
        return True
    noise = ["20000", "词汇巅峰", "速记", "笔记区", "·", "目", "录", "班"]
    if t in noise or any(t.startswith(x) and len(t) < 8 for x in noise):
        return True
    if re.match(r"^·\s*\d+\s*·$", t):
        return True
    if TOC_RE.match(t) or is_toc_line(t):
        return True
    if t in ("20000 词汇", "峰速记班", "趣谋多", "—— QuKeDuo —"):
        return True
    return False


def infer_root_hint(word: str, roots: list[str]) -> str | None:
    w = word.lower()
    for root in roots:
        r = root.lower().replace("-", "")
        if len(r) >= 3 and r in w:
            return root
    return roots[0] if roots else None


def read_docx_paras(path: Path) -> list[str]:
    with zipfile.ZipFile(path) as z:
        root = ET.fromstring(z.read("word/document.xml"))
    paras: list[str] = []
    for p in root.findall(".//w:p", WNS):
        texts = [t.text or "" for t in p.findall(".//w:t", WNS)]
        line = normalize_spaces("".join(texts))
        if line:
            paras.append(line)
    return paras


def parse_docx(path: Path, source_label: str) -> list[RootFamily]:
    raw_lines = read_docx_paras(path)
    lines = [normalize_docx_line(l) for l in raw_lines if not is_noise_line(normalize_docx_line(l))]

    families: list[RootFamily] = []
    current_header: str | None = None
    current_chapter = ""
    chapter_counter = 0
    current_roots: list[str] = []
    current_words: list[WordEntry] = []
    current_word_idx: int | None = None
    pending_etymology: list[str] = []
    collecting_etymology = False
    collecting_example = False
    collecting_definition = False
    collecting_mnemonic = False
    collecting_collocation = False
    collecting_frequency = False
    collecting_inline_example = False
    inline_example_buffer = ""

    def reset_word_collectors() -> None:
        nonlocal collecting_definition, collecting_mnemonic, collecting_collocation
        nonlocal collecting_example, collecting_etymology, pending_etymology
        nonlocal collecting_frequency, collecting_inline_example, inline_example_buffer
        collecting_definition = False
        collecting_mnemonic = False
        collecting_collocation = False
        collecting_example = False
        collecting_etymology = False
        collecting_frequency = False
        collecting_inline_example = False
        inline_example_buffer = ""
        pending_etymology = []

    def is_frequency_only_line(line: str) -> bool:
        return bool(re.match(r"^\d{3,6}$", normalize_spaces(line)))

    def is_inline_example_start(line: str) -> bool:
        t = normalize_spaces(line)
        if parse_word_line(line):
            return False
        if t.startswith(("助记", "搭配", "词源", "释义和用法")):
            return False
        if is_example_start(line) or is_chapter_header(line):
            return False
        if t.startswith(("笔记", "20000")):
            return False
        if t.startswith(("例如：", "例如:")):
            return True
        if t.startswith(("(chemistry)", "(化)")):
            return True
        if t.startswith("(N-COUNT)") or "N-COUNT)" in t:
            return True
        if "→" in t and re.search(r"[\u4e00-\u9fff]", t):
            return False
        if re.match(r"^[(\[]?[a-zA-Z][A-Za-z0-9 ,'\"();:\[\]-]{11,}", t):
            return True
        if re.match(r"^[a-zA-Z][a-zA-Z -]{2,}[\u4e00-\u9fff]", t):
            return True
        return False

    def is_inline_example_continuation(line: str) -> bool:
        t = normalize_spaces(line)
        if not t:
            return True
        if parse_word_line(line):
            return False
        if is_example_start(line) or is_chapter_header(line):
            return False
        if t.startswith(("助记", "搭配", "词源", "释义和用法")):
            return False
        if is_inline_example_start(line):
            return False
        if re.match(r"^[a-zA-Z ,'\"();:\[\]-]{8,}", t):
            return True
        if re.search(r"[\u4e00-\u9fff]", t):
            return True
        return False

    def flush_inline_example(idx: int) -> None:
        nonlocal inline_example_buffer
        if inline_example_buffer.strip():
            current_words[idx].collocations.append(inline_example_buffer)
        inline_example_buffer = ""

    def append_inline_example_line(line: str) -> None:
        nonlocal inline_example_buffer
        chunk = normalize_spaces(line)
        if not chunk:
            return
        inline_example_buffer = (
            chunk if not inline_example_buffer else inline_example_buffer + "\n" + chunk
        )

    def is_unlabeled_mnemonic_start(line: str) -> bool:
        t = normalize_spaces(line)
        if parse_word_line(line):
            return False
        if t.startswith(("助记", "搭配", "词源", "释义和用法")):
            return False
        if is_example_start(line) or is_chapter_header(line):
            return False
        if t.startswith("+") or ("→" in t and re.search(r"[\u4e00-\u9fff]", t)):
            return True
        return False

    def is_definition_continuation(line: str) -> bool:
        if parse_word_line(line):
            return False
        if line.startswith(("助记", "搭配", "词源")):
            return False
        if is_example_start(line) or is_chapter_header(line):
            return False
        if line.startswith(("阅读", "释义")):
            return False
        if re.match(r"^[a-zA-Z]+\s*\[", line):
            return False
        if re.match(r"^[^：:]+[:：].*[\u4e00-\u9fff]", line):
            return False
        return bool(re.search(r"[\u4e00-\u9fff]", line))

    def parse_definition_continuation(line: str) -> tuple[str, int | None]:
        text = normalize_spaces(line)
        freq: int | None = None
        m = re.search(
            r"(?<!\d)(\d{2,6})?\s*(?:助记|词源|搭配|阅读难点|笔记区|笔 记 区)[：:]?\s*",
            text,
        )
        if m:
            if m.group(1):
                freq = int(m.group(1))
            text = normalize_spaces(text[: m.start()])
        if freq is None:
            m = re.search(r"(?<=[\u4e00-\u9fff])(\d{2,6})$", text)
            if m:
                freq = int(m.group(1))
                text = normalize_spaces(text[: m.start()])
        if freq is None:
            m = FREQ_RE.search(text)
            if m:
                freq = int(m.group(1))
                text = normalize_spaces(text[: m.start()])
        return text, freq

    def is_mnemonic_continuation(line: str) -> bool:
        if parse_word_line(line):
            return False
        if line.startswith(("搭配", "词源", "助记")):
            return False
        if is_example_start(line) or is_chapter_header(line):
            return False
        if line.startswith(("阅读", "释义", "搭配")):
            return False
        return line.startswith("+") or "→" in line or bool(re.match(r"^[a-zA-Z(\[]", line))

    def is_collocation_continuation(line: str) -> bool:
        if parse_word_line(line):
            return False
        if line.startswith(("助记", "词源", "搭配")):
            return False
        if is_example_start(line) or is_chapter_header(line):
            return False
        if line.startswith("释义"):
            return False
        if "(考)" in line:
            return True
        if re.match(r"^[a-zA-Z].*[：:].*[\u4e00-\u9fff]", line):
            return True
        if re.match(r"^[(\[]?[a-zA-Z][A-Za-z0-9 ,'\"();:\[\]-]{11,}", line):
            return True
        if line.startswith(("例如：", "例如:")):
            return True
        if re.match(r"^[^：:]+[:：].*[\u4e00-\u9fff]", line):
            return True
        return False

    def append_mnemonic(line: str, idx: int) -> None:
        chunk = normalize_spaces(line)
        if not chunk:
            return
        existing = current_words[idx].mnemonic
        current_words[idx].mnemonic = f"{existing}\n{chunk}" if existing else chunk

    def strip_example_label(line: str) -> str:
        for label in ("写作例句：", "写作例句:", "仿写例句：", "仿写例句:", "例句：", "例句:"):
            if line.startswith(label):
                return normalize_spaces(line[len(label) :])
        return normalize_spaces(line)

    def is_example_start(line: str) -> bool:
        return line.startswith(("写作例句", "仿写例句", "例句"))

    def is_example_continuation_end(line: str) -> bool:
        if parse_word_line(line) or is_chapter_header(line):
            return True
        if line.startswith(("助记", "搭配", "词源", "阅读", "解析")):
            return True
        if is_example_start(line):
            return True
        if re.match(r"^·\s*\d+\s*·$", line):
            return True
        return line.startswith("20000") or line in ("笔 记 区", "笔记区")

    def flush_family() -> None:
        nonlocal current_words, current_header, current_roots, current_chapter
        nonlocal collecting_inline_example, inline_example_buffer, current_word_idx
        if current_word_idx is not None and inline_example_buffer.strip():
            flush_inline_example(current_word_idx)
            collecting_inline_example = False
        if not current_header or not current_words:
            return
        en, zh = extract_meanings(current_header)
        if re.match(r"^词根", current_header) or re.match(r"^昨\s*词根", current_header) or (
            "词根" in current_header and re.search(r"[Zz][o0]{2}", current_header)
        ):
            roots = extract_roots(current_header)
            if not roots:
                roots = extract_quoted_roots(current_header)
        else:
            roots = extract_quoted_roots(current_header)
            if not roots:
                roots = extract_roots(current_header)
        roots = [("zoo" if r.lower().replace("0", "o") == "zoo" else r) for r in roots]
        if not roots and re.search(r"[Zz][o0]{2}", current_header):
            roots = ["zoo"]
        semantic = extract_semantic_label(current_header, en, zh)
        order = chinese_chapter_order(current_chapter)
        family_id = slugify(roots[0].lower() if roots else current_chapter)
        family = RootFamily(
            id=family_id,
            source=source_label,
            chapter=current_chapter,
            chapter_order=order,
            title_zh=semantic,
            semantic_label=semantic,
            meaning_en=en,
            meaning_zh=zh,
            roots=roots,
            words=list(current_words),
        )
        for w in family.words:
            if w.root_hint is None:
                w.root_hint = infer_root_hint(w.word, roots)
        families.append(family)

    i = 0
    while i < len(lines):
        line = lines[i]

        if is_chapter_header(line):
            flush_family()
            current_header = line
            m = CHAPTER_NUM_RE.match(line)
            if m:
                current_chapter = line[: m.end() - 1]
            else:
                chapter_counter += 1
                current_chapter = str(chapter_counter)
            if re.match(r"^词根", line) or re.match(r"^昨\s*词根", line):
                current_roots = extract_roots(line)
                if not current_roots:
                    current_roots = extract_quoted_roots(line)
            else:
                current_roots = extract_quoted_roots(line)
                if not current_roots:
                    current_roots = extract_roots(line)
            current_words = []
            current_word_idx = None
            reset_word_collectors()
            i += 1
            continue

        if collecting_definition and current_word_idx is not None:
            if is_definition_continuation(line):
                part_text, part_freq = parse_definition_continuation(line)
                if part_text:
                    base = current_words[current_word_idx].definition or ""
                    current_words[current_word_idx].definition = (
                        part_text if not base else base + part_text
                    )
                if part_freq is not None:
                    current_words[current_word_idx].frequency = part_freq
                    collecting_definition = False
                i += 1
                continue
            collecting_definition = False

        if collecting_frequency and current_word_idx is not None:
            if is_frequency_only_line(line):
                current_words[current_word_idx].frequency = int(normalize_spaces(line))
                collecting_frequency = False
                i += 1
                continue
            collecting_frequency = False

        if collecting_inline_example and current_word_idx is not None:
            if is_inline_example_continuation(line):
                append_inline_example_line(line)
                i += 1
                continue
            flush_inline_example(current_word_idx)
            collecting_inline_example = False

        if current_word_idx is not None and not collecting_mnemonic and is_unlabeled_mnemonic_start(line):
            append_mnemonic(line, current_word_idx)
            collecting_mnemonic = True
            i += 1
            continue

        if current_word_idx is not None and not collecting_inline_example and is_inline_example_start(line):
            collecting_inline_example = True
            inline_example_buffer = ""
            append_inline_example_line(line)
            i += 1
            continue

        if collecting_mnemonic and current_word_idx is not None:
            if is_mnemonic_continuation(line):
                append_mnemonic(line, current_word_idx)
                i += 1
                continue
            collecting_mnemonic = False

        if collecting_collocation and current_word_idx is not None:
            if is_collocation_continuation(line):
                current_words[current_word_idx].collocations.append(normalize_spaces(line))
                i += 1
                continue
            collecting_collocation = False

        if collecting_example:
            if is_example_continuation_end(line):
                collecting_example = False
                continue
            if current_word_idx is not None and line:
                last = len(current_words[current_word_idx].examples) - 1
                if last >= 0:
                    current_words[current_word_idx].examples[last] += "\n" + line
            i += 1
            continue

        if is_example_start(line):
            if current_word_idx is not None:
                ex = strip_example_label(line)
                if ex:
                    current_words[current_word_idx].examples.append(ex)
                    collecting_example = True
            i += 1
            continue

        if line.startswith("词源") or line.startswith("词源：") or line.startswith("词源:"):
            collecting_etymology = True
            pending_etymology = []
            rest = line.replace("词源：", "").replace("词源:", "").replace("词源", "")
            if rest.strip():
                pending_etymology.append(normalize_spaces(rest))
            i += 1
            continue

        if collecting_etymology:
            if (
                line.startswith(("助记", "搭配"))
                or parse_word_line(line)
                or is_chapter_header(line)
                or is_example_start(line)
            ):
                if current_word_idx is not None and pending_etymology:
                    current_words[current_word_idx].etymology = " ".join(pending_etymology)
                collecting_etymology = False
                pending_etymology = []
                continue
            pending_etymology.append(line)
            i += 1
            continue

        if line.startswith(("阅读难点", "阅读难点：", "阅读难点:")):
            if current_word_idx is not None:
                current_words[current_word_idx].collocations.append(normalize_spaces(line))
            collecting_collocation = False
            i += 1
            continue

        if line.startswith(("释义和用法", "释义和用法：", "释义和用法:")):
            if current_word_idx is not None:
                if collecting_inline_example:
                    flush_inline_example(current_word_idx)
                rest = line
                for prefix in ("释义和用法：", "释义和用法:", "释义和用法"):
                    if rest.startswith(prefix):
                        rest = rest[len(prefix) :]
                        break
                collecting_inline_example = True
                inline_example_buffer = ""
                chunk = normalize_spaces(rest)
                if chunk:
                    append_inline_example_line(chunk)
            collecting_mnemonic = False
            collecting_collocation = False
            i += 1
            continue

        if line.startswith(("助记：", "助记:")):
            memo = line.replace("助记：", "").replace("助记:", "")
            if current_word_idx is not None:
                append_mnemonic(memo, current_word_idx)
                collecting_mnemonic = True
            collecting_collocation = False
            i += 1
            continue

        if line.startswith(("搭配：", "搭配:")):
            col = line.replace("搭配：", "").replace("搭配:", "")
            if current_word_idx is not None:
                current_words[current_word_idx].collocations.append(normalize_spaces(col))
                collecting_collocation = True
            collecting_mnemonic = False
            i += 1
            continue

        parsed = parse_word_line(line)
        if parsed:
            if current_header is None:
                current_header = line if is_chapter_header(line) else "有的单词如 fore, pro, forth 表示 forward, in front of, forth"
                if not is_chapter_header(line):
                    current_chapter = "0"
                    current_roots = extract_quoted_roots(current_header) or extract_roots(current_header)
                    if not current_roots:
                        current_roots = ["fore"]
            reset_word_collectors()
            if current_word_idx is not None and pending_etymology:
                current_words[current_word_idx].etymology = " ".join(pending_etymology)
                pending_etymology = []
            word, phonetic, rest = parsed
            def_text, inline_cols, inline_memo, inline_etym = split_inline_annotations(rest)
            pos, definition, freq = parse_definition_rest(def_text)
            entry = WordEntry(
                word=word,
                phonetic=phonetic,
                pos=pos,
                definition=definition,
                frequency=freq,
            )
            if inline_cols:
                entry.collocations.extend(inline_cols)
                collecting_collocation = True
            if inline_memo:
                entry.mnemonic = inline_memo
                collecting_mnemonic = True
            if inline_etym:
                entry.etymology = inline_etym
            current_words.append(entry)
            current_word_idx = len(current_words) - 1
            if freq is None:
                collecting_definition = True
                collecting_frequency = True
            i += 1
            continue

        i += 1

    flush_family()
    return families


def write_families(families: list[RootFamily], output_dir: Path, source_label: str) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    if not families:
        raise SystemExit(
            "ERROR: parsed 0 families (docx may be corrupted) — aborting without touching existing data"
        )

    index: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    written: set[str] = set()
    for family in families:
        family_id = family.id
        if family_id in used_ids:
            n = 2
            while f"{family.id}-{n}" in used_ids:
                n += 1
            family_id = f"{family.id}-{n}"
        used_ids.add(family_id)
        family.id = family_id
        file_name = f"{family_id}.json"
        written.add(file_name)
        file_path = output_dir / file_name
        payload = family.to_dict()
        file_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        index.append(
            {
                "id": family.id,
                "file": file_name,
                "chapter": family.chapter,
                "chapterOrder": family.chapter_order,
                "titleZh": family.title_zh,
                "semanticLabel": family.semantic_label,
                "meaningEn": family.meaning_en or "",
                "meaningZh": family.meaning_zh or "",
                "roots": family.roots,
                "wordCount": len(family.words),
                "source": source_label,
            }
        )

    index_path = output_dir / "index.json"
    index_path.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")
    written.add("index.json")

    # 全部写成功后才清理旧文件（先写后删：中途失败时旧数据仍在）
    for old in output_dir.glob("*.json"):
        if old.name not in written:
            old.unlink()


def main() -> None:
    if len(sys.argv) < 3:
        print(
            "Usage: python3 parse-docx.py <docx-path> <output-dir> [source-label]\n"
            "Example: python3 parse-docx.py ~/Downloads/20000词汇巅峰速记营（教材3）.docx ./app/public/data/textbook-3 textbook-3"
        )
        sys.exit(1)

    docx_path = Path(sys.argv[1]).expanduser()
    output_dir = Path(sys.argv[2]).expanduser()
    source_label = sys.argv[3] if len(sys.argv) > 3 else docx_path.stem

    if not docx_path.is_file():
        print(f"Cannot open docx: {docx_path}", file=sys.stderr)
        sys.exit(1)

    families = parse_docx(docx_path, source_label)
    write_families(families, output_dir, source_label)
    total_words = sum(len(f.words) for f in families)
    print(f"Parsed {len(families)} root families, {total_words} words → {output_dir}")


if __name__ == "__main__":
    main()
