# RootGraph 项目交接文档

> **读者**：Hermes、Qorder 等后续接手的 AI Agent / 开发者  
> **目的**：在不依赖口头上下文的情况下，快速理解项目全貌、架构、约定与待办  
> **最后更新**：2026-08-20（教材 3/4 docx 导入、OCR 流水线已删除）  
> **仓库路径**：`/Users/charles/Projects/rootgraph`

---

## 0. 30 秒速览

| 项目 | 说明 |
|------|------|
| **是什么** | 个人用的 Web 词根学习工具，从「20000词汇巅峰速记营」PDF 教材提取词根族，以 Notion 式笔记 + 词根变体导航学习 |
| **技术栈** | React 19 + TypeScript + Vite 8 + 纯 CSS；无后端；数据为静态 JSON；持久化靠 localStorage |
| **数据源** | 8 本教材：1/2/5–8 用 PDF 文字层（Swift）；**3/4 用 docx**（Python）→ `data/` JSON → 前端 `fetch('/data/...')` |
| **当前规模** | **161** 个词根族（全部唯一）、**8384** 词（去重后；**8 本教材均已导入**） |
| **核心用户** | 项目所有者 Charles，个人学习用，非 SaaS |

**启动：**

```bash
cd /Users/charles/Projects/rootgraph/web
npm install && npm run dev
# → http://localhost:5173
```

**全量重导教材：**

```bash
/Users/charles/Projects/rootgraph/scripts/parse-all.sh
# 优先 docx：~/Downloads/20000词汇巅峰速记营（教材N）.docx
# 否则 PDF：~/Downloads/20000词汇巅峰速记营（教材N）.pdf
```

**启动开发前必读：** 本文档 §0、§4、§6、§11

---

## 1. 产品定位与用户意图

### 1.1 要解决什么问题

用户学的是 **词根逻辑**，不是孤立背单词。理想路径：

```
语义场（如 separate / 区分·分别·单独）
  → 词根变体（cern / crim / cert / cris / crit / cree / cret）
    → 具体单词（discriminate, concern, crisis…）
      → 推理链 / 搭配 / 个人笔记
```

### 1.2 设计原则（历史对话中已确认）

- **图谱逻辑 + 笔记体验**：结构是网的，界面是浅色 Notion 式长文滚动，不是力导向技术大图谱
- **不做刷题 App**：核心是「看关系 → 理解 → 记笔记 → 复习」
- **个人笔记优先**：PDF 内容是种子，用户可在 localStorage 覆盖助记、搭配、词缀理解
- **最小改动**：迭代时保持 diff 小、匹配现有风格，避免过度抽象

### 1.3 三个主界面

| 界面 | 组件 | 作用 |
|------|------|------|
| 知识库首页 | `HomePage.tsx` | 按教材 / 章节 / 搜索浏览词根族卡片 |
| 词根族详情 | `FamilyNotePage.tsx` | 摘要、变体 Tab、单词卡、关系图、笔记 |
| 词缀库 | `AffixLibraryPage.tsx` | 前缀 / 后缀 / 词根条目 CRUD |

路由 **无 react-router**，在 `App.tsx` 用 `useState<AppView>` + **URL hash**（`appRoute.ts`）切换。支持 `#/family/textbook-1/cern?word=discriminate` 深链。

---

## 2. 目录结构

```
rootgraph/
├── HANDOFF.md              ← 本文档（架构 / 约定 / 待办）
├── .gitignore
│
├── data/                   ← 解析后的 canonical 数据（source of truth）
│   ├── catalog.json        ← 全库索引（160 条 CatalogEntry）
│   ├── rootgraph.db        ← SQLite 分析库（build-sqlite.py 生成，gitignore，不进 public）
│   ├── affix-library-seed.json
│   ├── textbook-1/ … textbook-8/
│   │   ├── index.json      ← 该教材词根族列表
│   │   └── {id}.json       ← 单个 RootFamily（一章一词根族）
│
├── scripts/
│   ├── parse-docx.py       ← docx → JSON（教材 3、4）
│   ├── parse-pdf.swift     ← PDF 文字层 → JSON（教材 1、2、5–8）
│   ├── parse-all.sh        ← 批量 8 本 + dedupe + catalog(legacyId) + validate + rsync + rootgraph.db
│   ├── build-sqlite.py     ← data/ JSON → data/rootgraph.db（SQLite 分析库，前端不依赖）
│   ├── dedupe-words.py     ← 同族内词条去重（同 word 保留信息量最大条目）+ 同步 index wordCount
│   ├── validate-data.py    ← catalog/index/家族文件一致性校验（重导后自动运行，失败中止）
│   ├── backup-data.sh      ← data 打包备份（backups/，保留 10 份）
│   └── import-affix-library.py ← docx → 词缀库 seed
│
└── web/
    ├── package.json
    ├── vite.config.ts
    ├── public/
    │   └── data/           ← rsync 自 ../data（Vite 静态服务）
    └── src/
        ├── App.tsx         ← 路由 / 全局状态注入
        ├── appRoute.ts     ← hash 路由解析与深链
        ├── App.css         ← 几乎全部样式（~3800 行）
        ├── types.ts        ← 核心类型 + 工具函数
        ├── catalog.ts      ← 教材标签、章节筛选
        ├── components/     ← 17 个 TSX 组件
        ├── hooks/          ← 4 个 hook
        ├── utils/          ← 工具模块
        └── data/
            ├── affixSeed.ts
            └── affix-library-seed.json
```

---

## 3. 技术栈与依赖

| 层 | 技术 |
|----|------|
| UI | React 19.2, TypeScript 6, Vite 8 |
| 样式 | 单文件 `App.css`，无 Tailwind / UI 库 |
| Lint | oxlint |
| 解析 | Swift + PDFKit |
| 脚本 | Bash, Python 3（stdlib） |
| 持久化 | localStorage + Cloudflare D1 (SQLite)；云端同步 via Pages Functions |

**注意**：关系图是手写 CSS 组件 `MiniRelationGraph.tsx`，不是 React Flow。

---

## 4. 数据流水线

```mermaid
flowchart LR
  DOCX["docx 教材 3/4<br/>~/Downloads/"]
  PDF["PDF 教材 1/2/5–8<br/>~/Downloads/"]
  PY["parse-docx.py"]
  SWIFT["parse-pdf.swift"]
  DATA["data/textbook-N/*.json"]
  CAT["data/catalog.json"]
  PUB["web/public/data"]
  WEB["React fetch /data/"]

  DOCX --> PY --> DATA
  PDF --> SWIFT --> DATA
  DATA --> CAT
  DATA --> PUB
  CAT --> WEB
  PUB --> WEB
```

### 4.1 解析单本

**docx（教材 3、4）：**

```bash
python3 /Users/charles/Projects/rootgraph/scripts/parse-docx.py \
  ~/Downloads/20000词汇巅峰速记营（教材3）.docx \
  /Users/charles/Projects/rootgraph/data/textbook-3 \
  textbook-3
```

**PDF 文字层（教材 1、2、5–8）：**

```bash
swift /Users/charles/Projects/rootgraph/scripts/parse-pdf.swift \
  ~/Downloads/20000词汇巅峰速记营（教材1）.pdf \
  /Users/charles/Projects/rootgraph/data/textbook-1 \
  textbook-1
```

> **注意**：教材 3、4 的 PDF 是扫描版，**无可靠文字层**。已弃用 OCR 流水线；请始终使用 docx。教材 1、2、5–8 **不需要** Word 版。

### 4.2 批量解析

```bash
/Users/charles/Projects/rootgraph/scripts/parse-all.sh
```

会做六件事：

1. 循环教材 1–8：**有 docx 用 docx**，否则用 PDF（`~/Downloads` 优先、`~/Desktop/2w/` 兜底）；解析结果为 0 族时**中止**（解析器内部 guard + 脚本双重保护）
2. `dedupe-words.py` 去重同族重复词条 + 同步 index wordCount
3. Python 内联脚本合并各 `textbook-N/index.json` → `data/catalog.json`（wordCount 以家族文件实际词数为准；id 分配变化时记录 `legacyId` 供前端笔记迁移）
4. `validate-data.py` 一致性校验（index↔文件↔catalog、无重复键/词条、orphan 警告），失败中止
5. `rsync -a --delete data/ → web/public/data/`（`--exclude '*.db'` + 显式 `rm -f rootgraph.db`）
6. `scripts/build-sqlite.py` → `data/rootgraph.db`（SQLite 分析库：families/words/affixes + FTS5）

> **解析安全**：PDF/docx 解析器均为「先写新文件、全部成功后再清理旧文件」，中途失败旧数据保留；单本直接跑 swift/python 也会在 0 族时报错退出。

> **rootgraph.db 是分析用途**（`sqlite3 data/rootgraph.db "SELECT ..."`），前端仍 fetch 静态 JSON，不依赖 db。构建时报告 catalog 重复家族键与同族重复词条。

### 4.3 词缀库 seed 导入

```bash
python3 /Users/charles/Projects/rootgraph/scripts/import-affix-library.py
# 默认读 ~/Downloads/词根词缀/词根词缀.docx
# 输出 web/src/data/affix-library-seed.json + data/affix-library-seed.json
# npm run import:affix 等价
```

Seed 版本号：`AFFIX_SEED_VERSION = 'docx-v14'`（`web/src/data/affixSeed.ts`）。版本变化会触发与用户 localStorage 的 merge / 迁移。v14：删除噪声条目 `o??-`（p013，前缀）；merge 逻辑在 seed 变化时保留用户编辑与新增条目（仅过滤 `??` 噪声）。

### 4.4 数据现状（2026-08-20）

| 指标 | 数值 |
|------|------|
| catalog 词根族 | **161**（全部唯一键，无重复） |
| 总词数 | **8384**（去重 + -ics 专题族重组 + 错标词清理后） |
| 已解析教材 | **1–8 全部** |

| 教材 | 来源 | 家族数 | 词数 |
|------|------|--------|------|
| textbook-1 | PDF | **12**（含 -ics 专题族） | 1005 |
| textbook-2 | PDF | 10 | 911 |
| **textbook-3** | **docx** | 14 | 454 |
| **textbook-4** | **docx** | 19 | 1453 |
| textbook-5 | PDF | 41 | 1551 |
| textbook-6 | PDF | 37 | 1540 |
| textbook-7 | PDF | 20 | 734 |
| textbook-8 | PDF | 8 | 740 |

> **注意**：textbook-5/6 各含 slug 撞车产生的 `-2`/`-3` 后缀族（如 plus + plus-2、reg + reg-2 + reg-3），是不同章节独立词根族，非重复。

**教材 3/4 说明：**

- docx 路径：`~/Desktop/2w/20000词汇巅峰速记营（教材3）.docx` / `（教材4）.docx`（parse-all.sh 双路径查找，Downloads 也有教材 4 副本）
- TB3：14 章（maj, min, itude, dict, em, spect, scopy, cal, claim, duct, viv, bio, zoo, quick）
- TB4：19 章、1487 词（docx 内部分章节合并为一个大族，如 forward 开篇族；quire 有两段 `quire` / `quire-2`）
- zoo 族仅 1 词（`zoo` 本身），其余 zoo 相关词在 bio 章

**仍存在的噪声：**

- 部分章节 `titleZh` / `semanticLabel` 来自 docx 原文，可后续用 xlsx 元数据优化
- `-ics` 学科词误标 `rootHint: cern`（economics 等）待清理

---

## 5. 数据模型

### 5.1 TypeScript 类型（`web/src/types.ts`）

```typescript
// 单词（PDF 解析产物 + 用户可覆盖字段）
interface WordEntry {
  word: string;
  phonetic?: string;
  pos?: string;
  definition?: string;
  frequency?: number;
  mnemonic?: string;        // 助记 / 推理链种子
  collocations: string[];
  etymology?: string;
  examples: string[];
  rootHint?: string;        // 所属词根变体，如 "crim"
}

// 词根族（一个 JSON 文件 = 一章）
interface RootFamily {
  id: string;               // 如 "cern"
  source: string;           // "textbook-1"
  chapter: string;          // "五"
  chapterOrder?: number;
  titleZh: string;
  semanticLabel?: string;   // 如 "separate"
  meaningEn?: string;
  meaningZh?: string;
  roots: string[];          // ["cern","crim","cert",...]
  words: WordEntry[];
}

// 目录索引条目
interface CatalogEntry {
  id: string;
  file: string;             // "cern.json"
  textbook: string;
  roots: string[];
  wordCount: number;
  // ...
}
```

### 5.2 Key 命名约定

```typescript
familyStorageKey(textbook, familyId)  // "textbook-1/cern"
wordKey(textbook, familyId, word)   // "textbook-1/cern/discriminate"
catalogEntryKey(entry)              // "textbook-1/cern"
```

所有 localStorage 笔记、词缀、字段覆盖都用 `wordKey` / `familyStorageKey`。

### 5.3 示例：separate 词根族

- 文件：`data/textbook-1/cern.json`
- 语义：`separate`（区分·分别·单独）
- 变体：`cern, crim, cert, cris, crit, cree, cret`
- 词数：169（分组后 cern 约 138，crim 5，cert 5…）
- **已知数据问题**：大量 `-ics` 学科词（如 `economics`）被误标 `rootHint: "cern"`，与 separate 词根无关；JSON 内 `economics` 重复出现 2 次

---

## 6. 前端架构

### 6.1 路由状态（`App.tsx` + `appRoute.ts`）

```typescript
type AppView =
  | { kind: 'home' }
  | { kind: 'family'; entry: CatalogEntry; focusWord?: string }
  | { kind: 'affix-library' };
```

- Hash 路由：`#/` 首页，`#/affix-library` 词缀库，`#/family/textbook-1/cern?word=discriminate` 词根族深链
- `HomePage` → 点击卡片 → `applyView({ kind: 'family', entry })`
- 单词搜索 → 带 `focusWord` 跳转并滚动定位
- 浏览器前进/后退通过 `hashchange` 同步

Hooks 在 `App` 顶层实例化，通过 props 下发：

- `useNotes()` — 家族/单词/词缀/字段覆盖
- `useAffixLibrary()` — 词缀库 CRUD + seed merge

### 6.2 组件地图

```
App.tsx
├── HomePage
│   ├── 教材 / 章节 / 文本筛选
│   └── WordSearchResults（全局单词搜索）
├── FamilyNotePage
│   ├── FamilyVariantNav（变体 Tab：概览 + cern/crim/…）
│   ├── VariantMap（拼写变体对照）
│   ├── MiniRelationGraph（可折叠关系图）
│   ├── NoteEditor（家族级笔记）
│   ├── WordCard × N（列表内折叠卡）
│   │   ├── RootText（词根高亮）
│   │   ├── NoteEditor（我的笔记 / 推理链 / 搭配）
│   │   └── AffixModal × 2（前缀 / 后缀）
│   ├── WordCardModal（复习弹窗，接 useProgress）
│   └── AffixLibraryOverlay（词缀库浮层，Home/Family/AffixModal 共用）
└── AffixLibraryPage
    ├── 分页表格 + 搜索
    └── AffixItemModal
```

**已删除的未接入组件：** WordBreakdown.tsx、AffixRelatedWords.tsx（已清理）

### 6.3 核心 Hooks

| Hook | 文件 | 职责 |
|------|------|------|
| `useNotes` | `hooks/useNotes.ts` | 家族笔记、单词笔记、词缀笔记、mnemonic/collocations 覆盖 |
| `useAffixLibrary` | `hooks/useAffixLibrary.ts` | 723 条 seed + 用户编辑 merge；防 localStorage 污染 |
| `useWordIndex` | `hooks/useWordIndex.ts` | 懒加载全库单词索引（搜索用） |
| `useProgress` | `hooks/useProgress.ts` | 复习状态 new/understood/review — **已通过 WordCardModal 部分接入** |

### 6.4 核心 Utils

| 文件 | 职责 |
|------|------|
| `utils/family.ts` | `groupWordsByRoot()` 按变体分组；`familySummary()` |
| `utils/rootHighlight.ts` | 词根匹配、变体簇、高亮 |
| `utils/affixLibrary.ts` | 词缀库搜索、分组 CRUD、libraryRef 解析 |
| `utils/affixNote.ts` | 从助记推断词缀、seed 词缀笔记 |
| `utils/markdown.tsx` | 轻量 Markdown 渲染（NoteEditor 预览） |

### 6.5 词根变体分组逻辑（重要）

`groupWordsByRoot(words, roots)` in `utils/family.ts`：

1. `cleanRoots(roots)` 清洗词根列表
2. 对每个单词：
   - **优先** `rootHint` 精确匹配
   - 其次 `rootHint` 包含词根（按词根长度降序，避免 `crit` 误匹配 `cris`）
   - 再次 `word` 包含词根（同样最长优先）
   - 否则落入第一个词根（fallback）

`FamilyNotePage` 用分组结果驱动变体 Tab；仅当 `variantTabs.length > 1` 时显示变体导航。

---

## 7. 功能清单（已实现）

### 7.1 首页（HomePage）

- 教材下拉、章节 chip 筛选
- 文本搜索（匹配词根、语义、章节）
- 词根族卡片：显示词根链、语义、词数
- 入口：词缀库

### 7.2 词根族页（FamilyNotePage）

- **概览 Tab**：摘要、变体对照、家族笔记、关系图
- **视频编号**：顶部徽标显示/编辑词根族对应的视频课程编号（localStorage，首页卡片同步显示 🎬）
- **词根编辑（✎ 词根）**：按教程手动修正词根变体（保留教材写法如 `(s)pend`）与语义标签，localStorage 持久化（重导不丢），首页卡片同步
- **变体 Tab**（如 cern / crim / cert）：仅显示该变体下的单词卡
- 底部 `VariantStepper` 切换变体
- 从搜索进入时 `focusWord` 自动切 Tab 并滚动定位

### 7.3 单词卡（WordCard）

- 词根高亮标题、音标、词性、释义、词频
- 变体标签（canonical → form）
- **我的笔记**（Markdown 可编辑）
- **更多** 展开：推理链、搭配、例句、词源
  - 推理链 / 搭配可编辑，覆盖 PDF 种子，存 localStorage
  - 「更多」有内容时蓝色，无内容灰色；无内容也可点开录入
- 前缀 / 后缀按钮 → `AffixModal`
- 点击单词复制

### 7.4 词缀库（AffixLibraryPage + useAffixLibrary）

- 三类 Tab：词根 / 前缀 / 后缀
- 723 条 seed（docx 导入，`docx-v14`）
- 父子组结构（`isParent`, `parentId`）
- 单词词缀弹窗可「保存到词缀库」、关联 `libraryRef`
- 弹窗点「完成」自动保存（无单独「保存词缀库」按钮）
- 标题前缀高亮（`highlightWordAffix`）
- 防 corrupted localStorage 释义（如前缀条目被写成「名词后缀」）

### 7.5 搜索

- 目录级：HomePage 文本 filter
- 单词级：`WordSearchResults` + `useWordIndex`（word/phonetic/definition/mnemonic）
- 词缀弹窗内：按词缀形式搜关联词（本章 / 本教材 / 全库）

---

## 8. localStorage 持久化

| Key | Hook | 内容 |
|-----|------|------|
| `rootgraph-notes-v2` | useNotes | `{ families, words, affixNotes, wordFields, videoMap, familyMeta }`（videoMap: 族→视频编号；familyMeta: 族→手动修正的 roots/semantic） |
| `rootgraph-notes-v1` | useNotes | 只读 legacy，部分迁移 |
| `rootgraph-affix-library-v5` | useAffixLibrary | `AffixItem[]` |
| `rootgraph-affix-library-seed-version` | useAffixLibrary | 如 `'docx-v12'` |
| `rootgraph-progress-v1` | useProgress | `{ [wordKey]: status }` — WordCardModal 已用 |

### wordFields 结构

```typescript
wordFields[wordKey] = {
  mnemonic?: string;      // 覆盖 PDF 助记
  collocations?: string;  // 覆盖 PDF 搭配（换行分隔）
}
```

### 开发注意

- **不要**在代码里硬编码真实 API Key / 密码
- 修改 seed 版本或结构时，考虑用户 localStorage 迁移
- 词缀库 merge 逻辑复杂，改 `useAffixLibrary.ts` 前先读 `isCorruptedMeaningOverride` 等守卫

---

## 9. 开发命令

```bash
# Web
cd web
npm install
npm run dev          # http://localhost:5173
npm run build        # tsc -b && vite build → dist/
npm run preview
npm run lint         # oxlint
npm run import:affix # 重新导入词缀 docx

# 数据
./scripts/parse-all.sh
python3 scripts/parse-docx.py <docx> <outdir> <label>   # 教材 3/4
swift scripts/parse-pdf.swift <pdf> <outdir> <label>    # 教材 1/2/5–8
python3 scripts/import-affix-library.py
python3 scripts/build-sqlite.py                          # 单独重建 SQLite 分析库
```

### 验证改动

1. `npm run build` 必须通过（strict TS：`noUnusedLocals`, `noUnusedParameters`）
2. 浏览器手测：Home → 教材1 → cern（separate）→ 切换 crim/cert Tab
3. 若改 parser：重跑 `parse-all.sh`，检查 `critical` 等词助记/搭配是否完整

---

## 10. Git 状态

### 已提交（2 commits）

| Hash | 说明 |
|------|------|
| `70ba8d3` | Initial commit：全量 PDF 重导；修复 parse-pdf 多行释义/助记/搭配 |
| `4a79697` | .gitignore 忽略 `__pycache__` |

### 未提交改动（2026-08-20，本地 working tree）

**尚未 commit 的大量本地改动**，包括但不限于：

**数据 / 脚本：**
- `scripts/parse-docx.py`（新）— docx 解析器
- `scripts/parse-all.sh` — docx 优先逻辑
- `data/catalog.json`、`data/textbook-3/*`、`data/textbook-4/*` — 全量重导
- 已删除：`ocr-pdf-paddle.py`、`ocr-pdf-to-text.sh`、`diagnose-pdf.swift`、`dump-pdf-snippet.swift`

**前端：**
- `web/src/appRoute.ts`（新）— hash 深链
- `web/src/components/WordCardModal.tsx`、`AffixLibraryOverlay.tsx`（新）
- `FamilyNotePage.tsx` — 变体 Tab、复习弹窗
- `WordCard.tsx` — 可编辑推理链/搭配
- `useNotes.ts` — wordFields 持久化
- `utils/family.ts` — groupWordsByRoot 改进
- 词缀库相关（`AffixModal`、`affixSeed.ts` docx-v13 等）

**接手的 Agent 必须先 `git status` / `git diff --stat`，不要假设 HEAD 即最新功能。**

---

## 11. 已知问题与近期修复

### 11.1 已修复

| 问题 | 修复 |
|------|------|
| PDF 单词缺助记/搭配/释义尾 | `parse-pdf.swift` 多行解析 + 重导 |
| 词缀库 localStorage 污染（dis- 显示「名词后缀」） | seed 过滤 + `saveGroup` 保留 id |
| 前缀弹窗编辑后不保存 | 点「完成」自动写入 |
| separate 词根族切换 crim/cert Tab 仍显示 economics | `FamilyNotePage` useEffect 不再反复重置 Tab |
| 首页「携带·运输」误收录 plat 词根族 | catalog 分类改精确词根匹配 |
| **教材 3、4 为空 / OCR 质量差** | 改用 docx + `parse-docx.py`；OCR 流水线已删除 |
| TB3 仅 8 族 365 词（OCR） | docx 导入 → 14 族 461 词 |
| TB4 OCR 1282 词 | docx 导入 → 19 族 1487 词 |
| 词缀库 `o??-` 噪声条目误推断（如 optics → o-） | 删除 seed 条目（docx-v14）；`inferAffixFromLibrary` 跳过单字母 form（o-/e-/s-/a- 首字母匹配误报，optics 不再推断 o-、outline 不被 o- 截胡）；词缀库/助记匹配的实义词缀恢复自动绑定+释义（如 diagnosis → dia-）；纯拼写推断只填形（`inferred` 标记）；`AffixModal` 统一「解除引用 / 无此词缀」入口：清空 + `suppressed` 防回填 + 撤销 |
| catalog 9 个重复家族键（slug 撞车） | `parse-pdf.swift` 无 id 冲突处理，后章覆盖前章文件 → 丢 176 词（textbook-5: plus/pos/cap，textbook-6: mis/solv/reg/rog/dec）。已加 `usedIds` 后缀（-2/-3）+ 写前清理旧 JSON，全量重导找回全部词 |
| 同族重复词条 55 个 | 新增 `scripts/dedupe-words.py`（同 word 保留信息量最大条目），`parse-all.sh` 解析后自动执行 |
| **教材 4 docx 源文件丢失** | 重导时扫描 PDF 解析 0 族并清空目录；已从 `web/dist` 旧构建副本恢复 19 族 1453 词；`parse-all.sh` 加 0 族保护（解析结果为 0 时中止，不再清空）；解析器改为「先写后删」 |
| 健壮性加固（2026-09） | `validate-data.py` 一致性校验、`backup-data.sh` 数据备份、ErrorBoundary + fetch 错误态/重试、localStorage 写入 try/catch（safeSetItem）、`legacyId` 笔记迁移机制；catalog 已提交 git 基线（450536a） |
| docx 释义混入「词频 助记/词源/搭配」文本（TB3/4 共 72 处） | `parse-docx.py` 释义解析加行内标签截断（数字可选）+ 词频提取，重导 TB3/4 后清零；顺带修复 intact2→intact、age-0ld→age-old、c0-opt→co-opt 三个解析噪声词 |
| 教材变体 `(s)` 写法丢失（-(s)pend 只提取到 pens） | `parse-pdf.swift`/`parse-docx.py` 词根提取允许 `(` 开头并保留原写法；前端展示忠于教材（`pens · (s)pend · (s)pon`），匹配层归一化（`normalizeRootForm`）；另提供 ✎ 词根手动编辑（familyMeta）兜底 |
| cern 族 26 个 `-ics` 学科词误归 | 移出 cern → 新建 `textbook-1/ics.json`「-ics 学科词」专题族（roots: ics，26 词不丢）；错标词清理：voc/critical、cern/policy、fin/battery、van/ancestor 删除错误归属（保留合理归属：cern/critical、dict/policy、dox/battery、ceed/ancestor）；被删词条备份于 `/tmp/removed-words.json`；修正由 `post-fix-data.py` 重导后自动重放 |

### 11.2 未解决 / 数据层

| 问题 | 说明 |
|------|------|
| ~~`-ics` 词误归 cern~~ | 已修复：26 词移入 textbook-1/ics.json 专题族 |
| 章节 title 粗糙 | 尤其 docx 导入的 TB3/4，可用 xlsx 元数据优化 |
| TB4 章节合并 | docx 内多 TOC 条目合并为 19 族（非 51 族），但词数完整 |
| 孤儿文件备份 | 60 个旧 orphan JSON（含 gnor.json 等有数据文件）备份在 `/tmp/rootgraph-orphan-backup/`，如需恢复可手动并入 |
| ~~README 过时~~ | 已删除（以本文为准） |

### 11.3 代码层待接

| 项 | 位置 | 说明 |
|----|------|------|
| 复习标记 UI | `useProgress.ts` + `WordCardModal` | 弹窗已接，列表/首页统计可继续完善 |
| 推理链 step 渲染 | `parseMnemonicChain()` | 函数在 family.ts，UI 用纯文本 NoteEditor |
| ~~死代码组件~~ | ~~WordBreakdown, AffixRelatedWords~~ | 已删除 |
| public/data symlink | 绝对路径 | 换机器可能失效；靠 parse-all.sh rsync |

---

## 11.5 笔记安全规则（红线，务必遵守）

**用户编辑的内容是唯一不可再生的资产**（写了几百条笔记后丢失=巨大损失）。所有支持编辑的入口，任何改动不得覆盖、删除用户已编辑的内容：

**编辑入口清单（10 类，全部存 localStorage）：**

| 入口 | 存储位置（rootgraph-notes-v2 内） | 触发 |
|---|---|---|
| 家族笔记 | `families[key]` | 族页「我的词根理解」 |
| 单词笔记 | `words[key]` | 词卡「我的笔记」 |
| 推理链覆盖 | `wordFields[key].mnemonic` | 词卡「推理链」 |
| 搭配覆盖 | `wordFields[key].collocations` | 词卡「搭配」 |
| 例句编辑 | `wordFields[key].examples` | 词卡「例句」 |
| 词缀笔记 | `affixNotes[key]` | 词缀弹窗 |
| 词缀库 CRUD | `rootgraph-affix-library-v5` | 词缀库页/弹窗保存 |
| 视频编号 | `videoMap[key]` | 🎬 徽标 |
| 词根/语义编辑 | `familyMeta[key]` | ✎ 词根 |
| 复习进度 | `rootgraph-progress-v1` | 复习弹窗标记 |

**铁律：**

1. **任何代码改动不得删除、清空或覆盖上述任一字段**；数据结构变更必须向后兼容（新字段 `?? 默认值` 兜底）；`setStore` 一律用 spread 不可变更新，禁止整体替换
2. **迁移前必须快照**：`migrateKeys` 等重排 key 的逻辑，执行前先把整个 store 写入 `rootgraph-notes-backup-auto-*`
3. **seed / storage 版本变更前必须征求用户同意**（如词缀库 docx 版本、notes-v2 → v3）；merge 逻辑必须保留用户编辑与新增条目（`upsertItemFromNote` 已有条目时返回 existing 不覆盖，`applyStoredOverridesById` 保留用户覆盖）
4. 数据重导 / 部署 / 解析脚本只动 `data/` JSON，不触碰 localStorage；`legacyId` 机制只在 catalog 含 legacyId 条目时迁移（当前为 0）
5. 用户可随时「导出笔记 / 导入笔记」（首页 hero 区按钮，utils/backup.ts）——导入前自动快照现有数据
6. **改动任何编辑入口相关代码前**：先读本清单，确认新逻辑在「用户已有内容」场景下的行为，并补逻辑测试（参考 useNotes/useAffixLibrary 的既有防御模式）

---

## 12. 编码约定（后续 Agent 请遵守）

1. **最小 diff**：只改任务相关文件，不顺手重构
2. **不加无关注释**：代码自解释为主
3. **匹配现有风格**：纯 CSS、props 下发 hooks、fetch 静态 JSON
4. **不引入新 UI 库 / 状态库**，除非用户明确要求
5. **不提交 .env / 密钥**；credentials 用环境变量
6. **改 parser 后必须重导并 spot-check** 典型词（critical, discriminate, economics）
7. **改 localStorage schema 必须写迁移**，并 bump 版本 key
8. **commit 只在用户明确要求时创建**（用户规则）

### 样式

- 几乎全部在 `App.css`
- 浅色 Notion 风：`--surface`, `--border`, `--accent` 等 CSS 变量
- 词根高亮：`.root-mark`, `.root-mark-variant`
- 变体导航：`.family-variant-nav`, `.family-variant-tab`

### 测试

- 无自动化测试套件
- 依赖 `npm run build` + 手动浏览器验证

---

## 13. 常见任务指南

### 13.1 新增 UI 功能

1. 读 `App.tsx` 看 view 状态是否需扩展
2. 类型放 `types.ts`
3. 需持久化 → 扩展 `useNotes` 或 `useAffixLibrary`， bump storage key
4. 样式追加 `App.css`（不要新建 scattered CSS 除非有必要）

### 13.2 修复 docx / PDF 解析

**docx（教材 3、4）：**
1. 改 `scripts/parse-docx.py`（章节头检测、词条 regex、Unicode 引号等）
2. `python3 scripts/parse-docx.py <docx> data/textbook-N textbook-N`
3. 或跑 `parse-all.sh`

**PDF 文字层（教材 1、2、5–8）：**
1. 改 `scripts/parse-pdf.swift`
2. 跑单本 swift 或 `parse-all.sh`
3. 检查 `data/textbook-N/{id}.json` 字段

两者完成后 `web/public/data` 会通过 rsync 同步。

### 13.3 词缀库更新

1. 更新 docx 源文件
2. `npm run import:affix`
3. bump `AFFIX_SEED_VERSION` in `affixSeed.ts`
4. 验证 `useAffixLibrary` merge 不覆盖用户有效编辑

### 13.4 修复变体 Tab / 单词分组

- 分组逻辑：`web/src/utils/family.ts` → `groupWordsByRoot`
- UI 逻辑：`web/src/components/FamilyNotePage.tsx`
- 导航组件：`web/src/components/FamilyVariantNav.tsx`
- 测试族：`data/textbook-1/cern.json`（separate，7 个变体）

---

## 14. 产品 Backlog（用户可能继续提）

按历史对话优先级排列：

1. **完善复习标记 UI**（WordCardModal 已有，可接列表标记、首页统计）
2. **清理 cern 组误分类词**（-ics 学科词移出或改 rootHint）
3. **PDF/docx 去重**（economics 等重复 entry）
4. **清理 orphan JSON / 改进 slugify**
5. **用 xlsx 优化 TB3/4 章节 title**（`~/Downloads/20000词汇词根总结表.xlsx` 讲义3/4 仅 metadata）
6. **推理链 step-by-step 展示**（用 parseMnemonicChain + 已有 CSS）
7. ~~**更新 README**~~ 已删除，以本文为准
8. **推理 quiz 模式**（曾讨论，未做）

---

## 15. 关键文件速查

| 目的 | 路径 |
|------|------|
| 入口 | `web/src/main.tsx` |
| 路由 | `web/src/App.tsx` + `web/src/appRoute.ts` |
| 类型 | `web/src/types.ts` |
| 全库索引 | `data/catalog.json` |
| docx 解析 | `scripts/parse-docx.py` |
| PDF 解析 | `scripts/parse-pdf.swift` |
| 批量脚本 | `scripts/parse-all.sh` |
| 词根族页 | `web/src/components/FamilyNotePage.tsx` |
| 复习弹窗 | `web/src/components/WordCardModal.tsx` |
| 单词卡 | `web/src/components/WordCard.tsx` |
| 词缀库页 | `web/src/components/AffixLibraryPage.tsx` |
| 笔记持久化 | `web/src/hooks/useNotes.ts` |
| 词缀库持久化 | `web/src/hooks/useAffixLibrary.ts` |
| 词根分组 | `web/src/utils/family.ts` |
| 样式 | `web/src/App.css` |
| 示例词根族 | `data/textbook-1/cern.json` |

---

## 16. 给 AI Agent 的启动清单

接手新任务时，按顺序执行：

- [ ] 读本文档 §0、§4、§6、§11
- [ ] `cd /Users/charles/Projects/rootgraph && git status && git diff --stat`
- [ ] 若动 UI：`npm run dev`，浏览器打开教材1 → cern
- [ ] 若动数据：`parse-all.sh` 或单本 swift
- [ ] 完工：`npm run build`
- [ ] 不要擅自 `git commit` / `git push`，除非用户明确要求

---

## 17. 联系上下文（无法从代码读出的信息）

- 项目Owner 为 **Charles**，中文沟通，期望 Agent **自己跑命令、查代码**，不要只给建议
- 产品名 **RootGraph · 词根笔记**；原型的「图谱」已弱化为迷你关系图 + 变体 Tab，不是 React Flow 大图
- **教材源文件：**
  - **主目录 `~/Desktop/2w/`**：8 本教材 PDF 全量 + 教材 3/4 的 docx 都在此
  - `parse-all.sh` 查找顺序：`~/Downloads` 优先，`~/Desktop/2w/` 兜底（docx 与 PDF 各自独立查找）
  - 词缀 docx：`~/Downloads/词根词缀/词根词缀.docx`
  - 词根总结 xlsx（仅章节 metadata）：`~/Downloads/20000词汇词根总结表.xlsx`
- Previous Agent 会话中做过：词缀库三期 Tab、变体导航、docx 导入 TB3/4、删除 OCR 流水线、hash 深链、复习弹窗 WordCardModal、推理链/搭配可编辑

---

*文档维护：每次重大架构变更、数据重导、storage schema 变更后，请更新本文档对应章节。*


---

## 18. 数据安全与防丢失体系（2026-08-25 重建 —— 最高优先级）

> 背景：曾发生多次用户数据丢失（多标签页覆盖、云端 last-write-wins 整体覆盖）。
> 以下机制为**防止再次发生**而建，任何改动不得削弱。改数据层前必读本节。

### 18.1 五层保护总览

| 层 | 机制 | 实现 |
|---|---|---|
| ① 实时落盘 | 每次编辑立即写 localStorage（含合并持久化、关页/切后台 flush） | `useNotes.ts` |
| ② 双写 last-good | 每次写入同时备份到 `rootgraph-notes-last-good`（始终最近成功数据） | `useNotes.ts` |
| ③ 本地快照 | 每 10 分钟一份 `rootgraph-notes-snap-*`，保留 20 份（本地可回滚） | `useNotes.ts` `takeLocalSnapshot` |
| ④ 云端同步 | 手动「☁️ 同步」+ 每天 18:40 自动 + 启动拉取合并 | `sync.ts` / `useNotes.ts` |
| ⑤ GitHub+本地备份 | 每天 18:45 cron：用户数据→私有仓库，官方数据→本地 tar | `scripts/daily-backup.sh` |

### 18.2 加载自愈（load() 恢复链）

主 key 损坏 → `readLocalWithRecovery()` 依次尝试：
1. `rootgraph-notes-v2`（主）
2. `rootgraph-notes-last-good`（双写备份）
3. `rootgraph-notes-snap-*`（最近快照）

恢复后主 key 自动重建。wordbook/progress 同款（各自 last-good）。

### 18.3 合并持久化（核心，防覆盖）

`useNotes.ts` 持久化 effect：读 localStorage 现有值 `current`，与内存 `store` **逐字段合并**：
`{ ...current[key], ...store[key] }` —— **本页最新（store）优先 + 其他页数据（current）补充**。
覆盖全部字段：families / words / affixNotes / wordFields / videoMap / familyMeta / userFamilies / userFamilyWords / familyOrder / wordOrder。

**删除操作必须同步清理 localStorage**（否则合并会"复活"）：
- `removeUserFamily` / `removeWordFromUserFamily`：同步 delete localStorage 对应条目
- `setFamilyMeta(fKey, {})`（恢复默认）：同步 delete localStorage 的 familyMeta key
- `useWordbook.removeWord` / `useAffixLibrary.removeItem`：同步删

### 18.4 多标签页

- `storage` 事件深合并（外部 Agent 已实现，`useNotes.ts`）
- 持久化合并兜底（storage 时序不可靠时仍不丢）
- 建议：提醒用户尽量单标签页

### 18.5 云端下载合并（不覆盖）

`mergeRemote()`：远端 updatedAt > 本地时才合并，且**本地优先**（`{...remote[key], ...prev[key]}`）。
覆盖前自动备份本地到 `rootgraph-notes-backup-pre-sync-*`。

---

## 19. 云端同步与备份

### 19.1 同步 API（Pages Functions + D1，版本化）

- 入口：`https://rootgraph.pages.dev/api/db/sync`（同域，D1 SQLite 存储）
- 实现：`web/functions/api/db/[[path]].ts`；D1 绑定 `DB`（`web/wrangler.toml`）
- 认证：`Authorization: Bearer rg_sync_2026_k8m3p7q2x9w4`
- 接口：
  - `GET /api/db/sync` → 最新整块数据 `{ updatedAt, families, ... }`
  - `PUT /api/db/sync` → 上传（写 app_data + data_versions + 细粒度表同步）
  - `POST /api/db/sync` → sendBeacon 上传入口（等价 PUT）
  - `GET /api/db/versions` → 版本列表
  - `POST /api/db/restore` → 恢复历史版本 `{ ts }`
  - `GET /api/db/inspect/word-fields/:key` → 查某个单词的字段覆盖（SQL 排查用）
  - `GET /api/db/inspect/family-meta/:key` → 查某个词根族的元数据
  - `GET /api/db/inspect/user-families` → 查所有用户自建词根族
- D1 数据库：`rootgraph`（id: `134f9b4d-374c-4db8-827c-3b34f9fa302a`）
- 表结构：`app_data`（主存储）、`data_versions`（版本历史）、`families`/`words`/`word_fields`/`family_meta`/`user_families`/`user_family_words`/`touch_map`（细粒度表，PUT 时同步写入，供 SQL 查询排查）
- Schema 文件：`web/sql/schema.sql`
- 前端 `web/src/utils/sync.ts`：`scheduleUpload`、`downloadRemote`、`getDeviceId`、`flushUpload`

### 19.2 同步触发时机（本地为主，低频）

| 时机 | 行为 |
|---|---|
| 编辑时 | 只存本地（**不自动上传**） |
| 手动 | 首页「☁️ 同步」按钮 → `syncNow()`：上传本地（含 wordbook）+ 下载合并 |
| 每天 18:40 | 浏览器开着时自动同步一次（`rootgraph-sync-date` 去重）；打开时若已过 18:40 且未同步则补一次 |
| 启动时 | 拉取远端合并（本地优先，防本地丢失的恢复手段） |

### 19.3 备份

- `scripts/backup-user-data.sh`：curl 云端 → `backups/user/user-data-<date>.json`（保留 30 份）→ 推送 **GitHub 私有仓库 `charles-ai-9/rootgraph-data`**
- `scripts/backup-data.sh`：官方数据 → `backups/rootgraph-data-<date>.tar.gz`（保留 10 份）
- `scripts/daily-backup.sh`：组合两者，crontab **每天 18:45** 执行（PATH 已兼容 cron 受限环境）
- crontab 现有任务勿删（git_push/review_reminder 等是用户的）

---

## 20. 用户词根与词根管理功能

### 20.1 创建/编辑词根（可选目标教材）

- 入口：首页「＋ 新建词根」/ 我的词根行 ✎ / 详情页批量挂载弹窗
- `UserFamily` 含 `textbook?` 字段：设了教材 → 显示在该教材底部（"补充词根"）；未设 → "我的词根"区
- 创建/编辑弹窗均有教材下拉（`HomePage.tsx`）
- 输入框带 `spellCheck={false} autoCorrect="off"`（防输入法把词根名"纠正"成别的词，如 jus→just）

### 20.2 批量挂载与移回

- 详情页「☑ 批量」→ 勾选 → 底部操作条「挂载到词根」→ `BatchMoveModal`（搜索即创建）
- 我的词根页：词卡「移回原族」按钮（`removeWordFromUserFamily`）
- 挂载词存 `userFamilyWords`（快照 + `_from` 原归属），原族 `movedWords` 隐藏

### 20.3 合并到教材页（user → textbook 统一）

- 搜索点击/深链 user 词根：roots 匹配官方族时**重定向官方教材页**（`FamilyNotePage.tsx` + `WordSearchResults.tsx`）
- 官方页与 user 页都**合并显示**官方词 + 本地挂载词（roots 完全一致匹配）
- 用户基本接触不到 `#/family/user/xxx`（自动重定向）

### 20.4 新建单词（详情页「＋ 新建单词」）

- `handleAddWord`：词存 `userFamilyWords`（经用户词根中转），显示在当前官方页（合并）
- `addWordToUserFamily(familyId, word)`

### 20.5 单词本（wordbook）

- 页面 `#/wordbook`，hook `useWordbook.ts`，独立 key `rootgraph-wordbook-v1`
- 增删/排序；随同步上传（payload 带 `wordbook` 字段）+ 下载写回
- 合并保存（防多标签页覆盖）、删除同步清理

### 20.6 拖动排序

- 首页词根行 `≡` 拖把手 → `familyOrder[textbook]`（localStorage，按教材存 id 顺序）
- 详情页单词排序 → `wordOrder`（`FamilyNotePage.tsx`）

---

## 21. 数据修复与手工补录机制

| 文件 | 作用 |
|---|---|
| `scripts/manual-data/missing-words.json` | 幂等补录解析漏检词条（结构：教材 → 族id → 词条数组）。补词只加这里 + 跑 `post-fix-data.py` |
| `scripts/manual-data/phonetic-american.json` | 全库美式 IPA 音标表（8282 词，AI 生成），post-fix 幂等套用 |
| `scripts/manual-data/textbook-3-jud.json` | 手动族（jus·jud），重导后恢复 |
| `scripts/post-fix-data.py` | 数据修正层：ics 族、错词清理、noise 改名、手动族恢复、trib 拆分、族元数据、null 清洗、missing-words 补录、judge 归 jud、音标套用 |

重导数据：`./scripts/parse-all.sh`（parse → post-fix → dedupe → catalog → validate → rsync → build-sqlite）。
**重导后 post-fix 自动重放所有手工修正**（幂等），用户 localStorage 笔记不受影响（key 按 textbook/familyId/word）。

---

## 22. 发布与 SW 版本约定

- 部署：`CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... ./scripts/deploy.sh`
  （build → `wrangler pages deploy dist --project-name=rootgraph` → 清理旧部署）
- **每次发布必须升 `web/public/sw.js` 的 `CACHE` 版本号**（当前 v28 → 下一个 v29）。
  否则用户浏览器 Service Worker 缓存旧 bundle/旧数据，出现"部署了但看不到新功能"。
- Pages Functions 随部署自动发布（`web/functions/api/sync.ts` 改动需部署生效）

---

## 23. 数据红线（绝对不可违反）

1. **绝不删除/覆盖用户的 localStorage 笔记数据**（families/words/affixNotes/wordFields/familyMeta/userFamilies/userFamilyWords）
2. **不擅自改动合并持久化、自愈、快照机制**（改了必须回归测试多标签页场景）
3. **不把用户数据推送到公开仓库**（主仓库 `rootgraph` 是 PUBLIC；用户数据只进私有仓库 `rootgraph-data`）
4. **删词根/删词必须同步清理 localStorage**（否则合并持久化会"复活"）
5. 移动/新建词根时注意 `textbook` 语义：选了教材 = 显示在教材底部（官方页合并显示）
6. 数据 schema 变更（新增 localStorage key/字段）需在本文档 §18 同步说明

---

## 24. 已知问题与经验

- **多标签页是历史数据丢失主因**：storage 事件 + 合并持久化已兜底，但建议单标签页
- **输入法纠错**会改词根名（jus→just）：输入框已加 spellCheck/autoCorrect 关闭；如再出现检查是否新输入框漏了属性
- **worker token 权限**：`cfut_` token 只有 Pages 权限，无法创建 D1/Worker（想上 D1 需要更高权限 token）
- **D1 候选**：若未来需要真正 SQLite，用 Cloudflare D1（Pages Functions 支持），迁移 KV→D1 的表结构见对话记录
- **云端版本历史可回滚**：`GET /api/sync?history=1` + `POST /api/sync/restore`（前端回滚 UI 未做，API 已就绪）
- **教材3 claim 族 roots** = `['claim','clam','cla']`（词根匹配用排序后完全一致判断，注意 user 词根 roots 需与官方一致才能合并显示）

---

*本文档由 2026-08-25 会话更新：数据安全体系（§18）、同步备份（§19）、词根管理（§20）、补录机制（§21）、发布约定（§22）、红线（§23）、经验（§24）。*


---

## 25. 2026-08-26 最新状态（接管必读，覆盖 §18-24 中过时内容）

> 本节记录 v29-v44 的变更与当前工作区状态。**新旧章节冲突时以本节为准。**

### 25.1 定时任务（确认在运行）

| 时间 | 任务 | 说明 |
|---|---|---|
| **每天 18:40** | 浏览器内自动同步（`useNotes.ts`，`rootgraph-sync-date` 去重） | 页面开着时执行；打开时若已过 18:40 且未同步则补一次 |
| **每天 18:45** | cron：`scripts/daily-backup.sh`（已配置 `crontab`） | 用户数据 → 本地 `backups/user/` + GitHub 私有仓库 `charles-ai-9/rootgraph-data`；官方数据 → 本地 tar（保留 10 份） |
| 启动时 | 每天最多拉取 1 次云端（`rootgraph-last-pull-date` 去重） | 减少网络交互；本地数据缺失时从 IndexedDB 快照恢复 |

### 25.2 同步与合并（v29-v38 演进）

- **v29 touchMap（key 级时间戳）**：每条笔记/词笔记记录编辑时间（`touchMap`，key 前缀 `f:`/`w:`/`wf:`/`a:`/`v:`/`m:`），跨设备同步逐条取最新——A 设备改的条目 B 设备刷新可见
- **v32 快照移 IndexedDB**：本地快照（30 分钟间隔，保留 30 份）存 `IndexedDB`（`web/src/utils/snapshotDb.ts`），不再占 localStorage 配额；`load()` 自愈链 = 主 key → last-good → IndexedDB 快照（异步）
- **v33 同步状态显示**：悬浮按钮上方显示「上次同步 HH:MM」（`rootgraph-last-sync-time`，`rootgraph-synced` 事件刷新）
- **v38 保守合并**：`mergeByTouch` 仅当**本地也有时间戳且远端更新**时才用远端；本地无时间戳（旧数据）一律保留本地——防旧云端覆盖本地数据（如视频号丢失）
- **v39 视频号输入即保存**：`setVideoId` 在 onChange 实时调用，不依赖 Enter/失焦/Esc

### 25.3 编辑单词模式（v34-v36）

- 详情页 ⚙ 工具栏 →「✏️ 编辑单词」开关
- 词卡显示 **✏️**（编辑面板：多词性-释义行 + 音标）和 **🗑**（删除=本地隐藏 `wordHidden`，数据保留可导出恢复）
- **多词性释义（senses）**：词典风格，每个词性对应各自解释（如 tie：vt. 系… / n. 领带…），词卡分行展示，词性标签合并（`vt./n.`）；存 `wordFields.senses`
- 编辑面板背景关闭用位移检测（轻点才关，拖拽/resize 不误触）

### 25.4 悬浮同步按钮（v30）

- 全局右下角 ☁️ 按钮（所有页面可见），点击 = 上传本地（含 wordbook）+ 下载合并（key 级取新）
- 上方显示「上次同步 HH:MM」
- 首页 hero 的同步按钮已移除（统一悬浮）

### 25.5 D1 数据库迁移（✅ 已完成 2026-08-26）

- **后端**：`web/functions/api/db/[[path]].ts` 替代原 KV 版 `web/functions/api/sync.ts`
- **前端**：`web/src/utils/sync.ts` 的 `SYNC_URL` = `/api/db/sync`；`useNotes.ts` 的 `syncNow()` 也指向 `/api/db/sync`
- **D1 数据库**：`rootgraph`（id: `134f9b4d-374c-4db8-827c-3b34f9fa302a`，区域 APAC）
- **KV 数据已迁移**：原 KV 中的 NotesStore 已 PUT 到 D1（`updatedAt: 1787715436741`）
- **细粒度表**：PUT 时自动同步写入 `families`/`words`/`word_fields`/`family_meta`/`user_families`/`touch_map`，可通过 `/api/db/inspect/*` 查询
- **旧 KV 版 `/api/sync`**：仍保留（向后兼容），但前端不再使用
- **wrangler.toml**：同时绑定 KV `NOTES` 和 D1 `DB`（production 环境均已配置）

### 25.6 SW 版本约定（更新）

- **以 `web/public/sw.js` 的 `CACHE` 实际值为准**（当前工作区 v45，已提交版本 v39）
- 每次发布必须升版本号（v44 → v45 …），否则用户浏览器缓存旧版

### 25.7 数据鲁棒性当前全貌（五层 + 三个新增）

```
① 本地实时落盘（合并持久化，全字段：本页最新优先+其他页补充）
② 双写 last-good（rootgraph-notes-last-good，主 key 损坏自动恢复）
③ IndexedDB 快照（30 份，30 分钟间隔，异步恢复）
④ 云端同步（手动 ☁️ / 每天 18:40 / 启动每天1次；touchMap key 级合并；保守合并防覆盖）
⑤ 备份（cron 18:45 → 本地 backups + GitHub 私有仓库）
+ wordbook/progress 双写 last-good
+ 启动拉取降频（rootgraph-last-pull-date）
+ 编辑即保存（视频号等输入框 onChange 实时保存）
```

### 25.8 交接提醒

- **外部 Agent 并行开发中**：git 工作区有未提交改动，接管前先与并行 Agent 对齐或确认提交状态
- 数据红线（§23）不变：绝不删用户笔记、删除同步清 localStorage、用户数据只进私有仓库
- 已知坑：编辑弹窗背景误关（v37/v38 已修）、Esc 取消导致不保存（v39 改输入即保存）、多标签页覆盖（合并持久化 + storage 事件已兜底，建议单标签页）

---

*§25 由 2026-08-26 会话追加：覆盖 v29-v44 全部变更、定时任务确认、D1 迁移状态、交接提醒。*
