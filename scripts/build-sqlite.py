#!/usr/bin/env python3
"""Build app/public/data/rootgraph.db (SQLite analysis copy) from app/public/data/ JSON.

分析用途，非前端运行时依赖：前端仍 fetch 静态 JSON。
用法：python3 scripts/build-sqlite.py   （或经 parse-all.sh 自动调用）
"""
from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "public" / "data"
DB_PATH = ROOT / "app" / "public" / "data" / "rootgraph.db"


def load(path: Path):
    with open(path, encoding="utf-8") as f:
        return json.load(f)


def build() -> None:
    catalog = load(DATA / "catalog.json")

    if DB_PATH.exists():
        DB_PATH.unlink()

    con = sqlite3.connect(DB_PATH)
    con.executescript(
        """
        CREATE TABLE families (
          textbook TEXT NOT NULL,
          id TEXT NOT NULL,
          file TEXT NOT NULL,
          chapter TEXT,
          chapterOrder INTEGER,
          titleZh TEXT,
          semanticLabel TEXT,
          meaningEn TEXT,
          meaningZh TEXT,
          roots TEXT,          -- JSON array
          wordCount INTEGER,
          PRIMARY KEY (textbook, id)
        );

        CREATE TABLE words (
          textbook TEXT NOT NULL,
          familyId TEXT NOT NULL,
          word TEXT NOT NULL,
          phonetic TEXT,
          pos TEXT,
          definition TEXT,
          frequency INTEGER,
          mnemonic TEXT,
          collocations TEXT,   -- JSON array
          etymology TEXT,
          rootHint TEXT,
          PRIMARY KEY (textbook, familyId, word)
        );

        CREATE TABLE affixes (
          id TEXT PRIMARY KEY,
          kind TEXT NOT NULL,          -- prefix / suffix / root
          name TEXT NOT NULL,
          pos TEXT,
          meaning TEXT,
          note TEXT,
          isParent INTEGER,
          parentId TEXT,
          ord INTEGER
        );

        CREATE INDEX idx_words_word ON words(word);
        CREATE INDEX idx_words_textbook ON words(textbook);
        CREATE INDEX idx_words_roothint ON words(rootHint);
        """
    )

    dup_in_family: list[tuple[str, str, str]] = []
    dup_family_keys: list[tuple[str, str]] = []
    seen_family_keys: set[tuple[str, str]] = set()
    for entry in catalog:
        family = load(DATA / entry["textbook"] / entry["file"])
        key = (entry["textbook"], family["id"])
        if key in seen_family_keys:
            dup_family_keys.append(key)
            continue
        seen_family_keys.add(key)
        con.execute(
            "INSERT INTO families VALUES (?,?,?,?,?,?,?,?,?,?,?)",
            (
                entry["textbook"],
                family["id"],
                entry["file"],
                family.get("chapter", ""),
                family.get("chapterOrder"),
                family.get("titleZh", ""),
                family.get("semanticLabel", ""),
                family.get("meaningEn", ""),
                family.get("meaningZh", ""),
                json.dumps(family.get("roots", []), ensure_ascii=False),
                len(family.get("words", [])),
            ),
        )
        for w in family.get("words", []):
            row = (
                entry["textbook"],
                family["id"],
                w["word"],
                w.get("phonetic"),
                w.get("pos"),
                w.get("definition"),
                w.get("frequency"),
                w.get("mnemonic"),
                json.dumps(w.get("collocations", []), ensure_ascii=False),
                w.get("etymology"),
                w.get("rootHint"),
            )
            try:
                con.execute("INSERT INTO words VALUES (?,?,?,?,?,?,?,?,?,?,?)", row)
            except sqlite3.IntegrityError:
                dup_in_family.append((entry["textbook"], family["id"], w["word"]))

    affix_seed = load(DATA / "affix-library-seed.json")
    for a in affix_seed.get("items", []):
        con.execute(
            "INSERT INTO affixes VALUES (?,?,?,?,?,?,?,?,?)",
            (
                a["id"],
                a.get("kind", ""),
                a.get("name", ""),
                a.get("pos", ""),
                a.get("meaning", ""),
                a.get("note", ""),
                1 if a.get("isParent") else 0,
                a.get("parentId"),
                a.get("order"),
            ),
        )

    # FTS5 全文索引（词 + 释义 + 助记）；不支持 FTS5 的 sqlite 构建则跳过
    try:
        con.executescript(
            """
            CREATE VIRTUAL TABLE words_fts USING fts5(
              word, definition, mnemonic, content='words', content_rowid='rowid'
            );
            INSERT INTO words_fts(rowid, word, definition, mnemonic)
              SELECT rowid, word, definition, mnemonic FROM words;
            """
        )
        fts_ok = True
    except sqlite3.OperationalError:
        fts_ok = False

    con.commit()
    n_families = con.execute("SELECT COUNT(*) FROM families").fetchone()[0]
    n_words = con.execute("SELECT COUNT(*) FROM words").fetchone()[0]
    n_affixes = con.execute("SELECT COUNT(*) FROM affixes").fetchone()[0]
    con.close()
    print(
        f"rootgraph.db: {n_families} families, {n_words} words, {n_affixes} affixes"
        + (" (FTS5 ✓)" if fts_ok else " (FTS5 不可用)")
        + f" → {DB_PATH}"
    )
    if dup_family_keys:
        print(f"catalog 重复家族键 {len(dup_family_keys)} 个（已保留首个，跳过重复）:")
        for textbook, family_id in dup_family_keys:
            print(f"  {textbook}/{family_id}")
    if dup_in_family:
        print(f"同族内重复词条 {len(dup_in_family)} 个（已跳过重复行）:")
        for textbook, family_id, word in dup_in_family:
            print(f"  {textbook}/{family_id}: {word}")


if __name__ == "__main__":
    build()
