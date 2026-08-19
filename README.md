# RootGraph · 词根图谱

个人用的 Web 词根学习工具：从 PDF 教材提取词根族，用交互图谱探索单词之间的逻辑关系。

## 快速开始

```bash
# 1. 解析 PDF（教材放在 ~/Downloads/）
./scripts/parse-all.sh

# 2. 启动 Web
cd web && npm install && npm run dev
```

浏览器打开 http://localhost:5173

## 功能

- **知识库首页**：按教材、语义主题分类浏览
- **词根笔记页**：Notion 式长文滚动，词根族摘要 + 单词卡片
- **推理链**：助记拆解为 step-by-step 推理
- **个人笔记**：词根族级 + 单词级，纯文字，localStorage 保存
- **迷你关系图**：可折叠，点击单词跳转
- **复习标记**：未学 / 已理解 / 需复习

## 数据

PDF 路径默认为：

```
~/Downloads/20000词汇巅峰速记营（教材1-8）.pdf
```

解析结果在 `data/textbook-N/` 下，汇总索引为 `data/catalog.json`。

当前已解析约 **6500+** 词（8 本教材，部分 PDF 格式仍在优化 parser）。

## 项目结构

```
rootgraph/
├── scripts/
│   ├── parse-pdf.swift   # PDF → JSON
│   └── parse-all.sh      # 批量解析 8 本教材
├── data/                 # 词根 JSON 数据
└── web/                  # React + Vite + React Flow
```

## 重新解析单本

```bash
swift scripts/parse-pdf.swift \
  ~/Downloads/20000词汇巅峰速记营（教材1）.pdf \
  data/textbook-1 textbook-1
```
