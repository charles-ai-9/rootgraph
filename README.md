# RootGraph

词根英语单词学习工具。从「20000词汇巅峰速记营」教材提取词根族，以 Notion 式笔记 + 词根变体导航辅助学习。

## 项目结构

```
rootgraph/
├── app/                    # 前端应用（React + Vite + Cloudflare Pages Functions）
│   ├── functions/          #   后端 API（D1 同步接口）
│   ├── public/data/        #   教材数据（唯一数据源，解析器直接写入）
│   ├── src/                #   前端源码
│   └── wrangler.toml       #   Cloudflare 部署配置
├── db/
│   └── schema.sql          # D1 数据库表结构
├── scripts/                # 数据流水线 & 运维脚本
│   ├── parse-all.sh        #   主编排（解析 → 修正 → 去重 → 校验 → 构建分析库）
│   ├── parse-docx.py       #   DOCX 解析器（教材 3、4）
│   └── parse-pdf.swift     #   PDF 解析器（教材 1、2、5–8）
├── HANDOFF.md              # 详细技术文档（架构 / 约定 / 红线 / 待办）
└── backups/                # 备份产物（gitignored）
```

## 快速开始

```bash
# 安装依赖
cd app && npm install

# 本地开发（http://localhost:5173）
npm run dev

# 构建
npm run build
```

## 数据流水线

教材源文件（PDF/docx）→ 解析 → 修正 → 去重 → 校验 → `app/public/data/`

```bash
# 全量重导 8 本教材
scripts/parse-all.sh
```

前端通过 `fetch('/data/catalog.json')` 和 `fetch('/data/textbook-N/{id}.json')` 读取数据。

## 部署

```bash
CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=xxx scripts/deploy.sh
```

部署前需升 `app/public/sw.js` 中的 CACHE 版本号，否则用户浏览器缓存旧版。

## 技术栈

- **前端**：React 19 + TypeScript + Vite 8
- **后端**：Cloudflare Pages Functions（serverless）
- **数据库**：Cloudflare D1（SQLite）
- **部署**：Cloudflare Pages（rootgraph.pages.dev）
