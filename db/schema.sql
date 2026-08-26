-- RootGraph D1 Schema
-- 全量同步表：存储完整 NotesStore JSON（替代 KV，支持 SQL 查询排查）
CREATE TABLE IF NOT EXISTS app_data (
  id INTEGER PRIMARY KEY DEFAULT 1,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  device_id TEXT
);

-- 版本历史（防数据丢失，保留最近 50 条快照）
CREATE TABLE IF NOT EXISTS data_versions (
  ts INTEGER PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT 0,
  device_id TEXT
);

-- 细粒度表：词根族笔记（可直接 SQL 查询某个词根的笔记内容）
CREATE TABLE IF NOT EXISTS families (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- 细粒度表：单词个人笔记
CREATE TABLE IF NOT EXISTS words (
  key TEXT PRIMARY KEY,
  content TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- 细粒度表：单词字段覆盖（助记、词根、例句、词源、音标、释义、词性、多词性释义）
CREATE TABLE IF NOT EXISTS word_fields (
  key TEXT PRIMARY KEY,
  mnemonic TEXT,
  collocations TEXT,
  examples TEXT,
  etymology TEXT,
  phonetic TEXT,
  definition TEXT,
  pos TEXT,
  senses TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- 细粒度表：词根族元数据覆盖（词根变体、语义、含义）
CREATE TABLE IF NOT EXISTS family_meta (
  key TEXT PRIMARY KEY,
  roots TEXT,
  semantic TEXT,
  meaning_en TEXT,
  meaning_zh TEXT,
  updated_at INTEGER NOT NULL DEFAULT 0
);

-- 细粒度表：用户自建词根族
CREATE TABLE IF NOT EXISTS user_families (
  id TEXT PRIMARY KEY,
  roots TEXT NOT NULL,
  meaning_zh TEXT NOT NULL DEFAULT '',
  meaning_en TEXT NOT NULL DEFAULT '',
  textbook TEXT,
  created_at INTEGER NOT NULL DEFAULT 0
);

-- 细粒度表：用户词根族下的单词
CREATE TABLE IF NOT EXISTS user_family_words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  family_id TEXT NOT NULL,
  word_data TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (family_id) REFERENCES user_families(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_ufw_family ON user_family_words(family_id);

-- 细粒度表：编辑时间戳（同步冲突解决用）
CREATE TABLE IF NOT EXISTS touch_map (
  key TEXT PRIMARY KEY,
  ts INTEGER NOT NULL
);
