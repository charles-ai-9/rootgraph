# 给新 Agent 的首条提示词

复制下面整段，作为新 Cursor Agent 会话的**第一条消息**：

---

你是 RootGraph 项目的接手 Agent。请先完整阅读仓库里的交接文档，再开始任何改动。

**必读：**
1. `/Users/charles/Projects/rootgraph/HANDOFF.md` — 项目全貌、架构、数据、约定、待办
2. 运行 `cd /Users/charles/Projects/rootgraph && git status && git diff --stat` — 大量功能已在本地改过，**未 commit**，不要假设 HEAD 是最新代码

**项目是什么：**
- 个人用词根学习 Web 应用（React + Vite + 静态 JSON，无后端）
- 从「20000词汇巅峰速记营」8 本教材导入词根族；用户笔记存 localStorage
- Owner：**Charles**，请用**中文**沟通；期望你**自己跑命令、改代码**，不要只给操作建议

**当前数据（2026-08-20）：**
- 全库 **160 词根族 / 8444 词**，8 本教材均已导入
- 教材 **3、4** 来自 **docx**（扫描 PDF 已弃用 OCR）
- 教材 **1、2、5、6、7、8** 来自 **PDF 文字层**（不需要 Word 版）

**启动开发：**
```bash
cd /Users/charles/Projects/rootgraph/web && npm install && npm run dev
# → http://localhost:5173
```

**重导全部教材数据：**
```bash
/Users/charles/Projects/rootgraph/scripts/parse-all.sh
# docx 优先：~/Downloads/20000词汇巅峰速记营（教材N）.docx
# 否则 PDF：~/Downloads/20000词汇巅峰速记营（教材N）.pdf
```

**硬性规则：**
- 最小 diff，匹配现有风格（纯 CSS、无 UI 库、props 下发 hooks）
- **不要**擅自 `git commit` / `git push`，除非 Charles 明确要求
- **不要**硬编码密钥；改 localStorage schema 要 bump 版本并写迁移
- 改 parser 后跑 `parse-all.sh` 并 spot-check 典型词
- 完工前跑 `npm run build`（strict TS）

**优先了解的关键文件：**
- `web/src/App.tsx` + `web/src/appRoute.ts` — hash 路由
- `web/src/components/FamilyNotePage.tsx` — 词根族页 + 变体 Tab + 复习弹窗
- `web/src/utils/family.ts` — `groupWordsByRoot()` 分组逻辑
- `scripts/parse-docx.py` — 教材 3/4 的 docx 解析
- `scripts/parse-pdf.swift` — 教材 1/2/5–8 的 PDF 文字层解析
- `data/catalog.json` — 全库索引

**已知待办（详见 HANDOFF §14）：**
- 清理 cern 等族中 `-ics` 学科词误分类
- PDF/docx 重复词条、orphan JSON、章节 title 优化
- 复习标记 UI 已部分接入（WordCardModal），可继续完善
- README 与 HANDOFF 同步

读完 HANDOFF 后，用 3–5 句话复述你理解的项目现状，并问 Charles 本次任务目标（若他尚未说明）。

---
