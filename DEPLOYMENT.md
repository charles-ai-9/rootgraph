# RootGraph 部署与维护指南

##  目录
- [项目概述](#项目概述)
- [快速开始](#快速开始)
- [部署流程](#部署流程)
- [数据同步](#数据同步)
- [日常维护](#日常维护)
- [故障排查](#故障排查)

---

## 项目概述

RootGraph 是一个基于词根的英语单词学习应用，采用纯前端架构（React + Vite），数据存储在 JSON 文件中，用户笔记和进度保存在浏览器 localStorage。

**技术栈**：
- 前端框架：React 19 + TypeScript
- 构建工具：Vite 8
- 部署平台：Cloudflare Pages
- 数据存储：静态 JSON 文件 + localStorage

**访问地址**：
- 生产环境：https://rootgraph.pages.dev
- 最新部署预览：查看 Cloudflare Dashboard → Deployments

---

## 快速开始

### 本地开发

```bash
cd /Users/charles/Projects/rootgraph/web
npm install
npm run dev
```

访问 http://localhost:5173

### 本地构建测试

```bash
cd /Users/charles/Projects/rootgraph/web
npm run build
# 构建产物在 web/dist/ 目录
```

---

## 部署流程

### 方式一：Git 自动部署（推荐）

每次 `git push` 到 GitHub 的 `main` 分支，Cloudflare Pages 会自动触发构建和部署。

**步骤**：
1. 修改代码或数据
2. 提交并推送：
   ```bash
   git add -A
   git commit -m "描述你的改动"
   git push origin main
   ```
3. 等待 2-5 分钟，Cloudflare 自动完成部署
4. 访问 https://rootgraph.pages.dev 验证

### 方式二：手动部署（紧急修复）

如果 Git 自动部署失败，可以使用 Wrangler CLI 手动部署：

**前置条件**：
- 已安装 Node.js 和 npm
- 已配置 Cloudflare API Token 和 Account ID

**环境变量配置**（添加到 `~/.zshrc` 或 `~/.bashrc`）：
```bash
export CLOUDFLARE_API_TOKEN="你的API_Token"
export CLOUDFLARE_ACCOUNT_ID="693524905625dd9e33fd3a0dac4be713"
```

**部署命令**：
```bash
cd /Users/charles/Projects/rootgraph/web
npm run build
npx wrangler pages deploy dist --project-name=rootgraph --branch=main
```

**获取新的部署地址**：
```bash
npx wrangler pages deployment list --project-name=rootgraph
```

---

## 数据同步

### 新增单词/词根族

#### 1. 编辑数据文件

数据文件位于 `/Users/charles/Projects/rootgraph/data/` 目录：

- **词根族文件**：`data/textbook-{N}/{id}.json`
  - 例如：`data/textbook-8/s-pend.json`（(s)pend 词根族）
  
- **目录索引**：`data/catalog.json`（所有词根族的元数据）

**示例：在 s-pend 词根族添加 stipend 单词**

编辑 `data/textbook-8/s-pend.json`，在 `words` 数组末尾添加：

```json
{
  "collocations": [
    "a stipend of $500 per month：每月 500 美元的津贴",
    "research stipend：研究津贴"
  ],
  "definition": "（定期支付的）薪水；津贴；奖学金",
  "examples": [
    "She receives a monthly stipend of $800 from the university.\n她每月从大学领取 800 美元的奖学金。"
  ],
  "etymology": "来自拉丁语 stipendium = stips（礼物）+ pendere（称重、支付）",
  "mnemonic": "stip（礼物、小额支付）+ pend（称重→花费）→ 定期支付的小额款项",
  "phonetic": "ˈstaɪpend",
  "pos": "n.",
  "rootHint": "(s)pend",
  "word": "stipend"
}
```

#### 2. 新词根族（重要：不要手改 catalog.json）

`data/catalog.json` 是 **`parse-all.sh` 自动重建的派生文件**，手动修改会被下次重导覆盖。正确做法：

- **手动创建的族**（教材外补充、如 `textbook-8/s-pend`）放到 `scripts/manual-data/` 目录，文件名 `{教材}-{族id}.json`（如 `textbook-8-s-pend.json`）——`post-fix-data.py` 会在每次重导后自动恢复该族及其 index 条目，**重导不丢**
- 修改解析出的族：直接改 `data/textbook-{N}/{id}.json` 后跑 `python3 scripts/post-fix-data.py`（如改动会被重导覆盖，请把修正逻辑加入该脚本）

```json
{
  "chapter": "1",
  "chapterOrder": 101,
  "file": "new-root.json",
  "id": "new-root",
  "meaningEn": "meaning in English",
  "meaningZh": "中文含义",
  "roots": ["root-form"],
  "semanticLabel": "语义标签",
  "source": "textbook-8",
  "titleZh": "中文标题"
}
```

#### 3. 提交并部署

```bash
cd /Users/charles/Projects/rootgraph
git add data/
git commit -m "Add new word: stipend to (s)pend root family"
git push origin main
```

等待 Cloudflare 自动部署完成后，访问 https://rootgraph.pages.dev 验证。

### 批量导入数据

如果有大量数据需要导入（如从 PDF、Excel），使用脚本：

```bash
cd /Users/charles/Projects/rootgraph
./scripts/parse-all.sh  # 批量解析所有教材
# 或
swift scripts/parse-pdf.swift [pdf路径] [输出目录] [教材ID]  # 单本解析
```

然后检查生成的 JSON 文件，修正格式错误后提交部署。

---

## 日常维护

### 1. 代码迭代

**前端代码修改**（`web/src/` 目录）：
- 组件：`web/src/components/*.tsx`
- 样式：`web/src/App.css`
- 工具函数：`web/src/utils/*.ts`
- Hooks：`web/src/hooks/*.ts`

**修改后**：
```bash
# 本地测试
cd web && npm run dev

# 确认无误后提交
cd ..
git add web/
git commit -m "feat: 优化单词卡片交互"
git push origin main
```

### 2. 数据备份

**重要**：用户笔记和进度保存在浏览器 localStorage，换设备会丢失。

**数据文件备份**（重导前后建议执行）：
```bash
./scripts/backup-data.sh   # 打包 data/ 到 backups/（保留 10 份）
```

**用户笔记备份**（localStorage，后续可添加"导出笔记"功能）：
- 打开浏览器开发者工具（F12）
- Application → Local Storage → https://rootgraph.pages.dev
- 复制以下 key 的值保存为 JSON 文件：
  - `rootgraph-notes-v2`（笔记）
  - `rootgraph-progress-v1`（学习进度）
  - `rootgraph-affix-library-v5`（词缀库）

### 3. 监控部署状态

访问 Cloudflare Dashboard：
- URL：https://dash.cloudflare.com/693524905625dd9e33fd3a0dac4be713/pages/view/rootgraph
- 查看最新部署状态、构建日志、访问统计

---

## 故障排查

### 问题1：部署后页面空白或 404

**可能原因**：
- 数据文件未正确打包到 `dist/`
- Vite 构建配置错误

**解决方案**：
1. 检查 `web/public/data/` 是否有数据文件
2. 重新构建：`cd web && npm run build`
3. 检查 `web/dist/data/` 是否存在
4. 手动部署：`npx wrangler pages deploy dist --project-name=rootgraph --branch=main`

### 问题2：搜索不到新添加的单词

**可能原因**：
- `catalog.json` 未更新
- 浏览器缓存

**解决方案**：
1. 确认 `data/catalog.json` 包含新词根族
2. 清除浏览器缓存（Ctrl+Shift+Delete）
3. 硬刷新页面（Ctrl+F5 或 Cmd+Shift+R）

### 问题3：localStorage 数据丢失

**可能原因**：
- 浏览器清除缓存
- 切换设备/浏览器

**解决方案**：
- 定期导出 localStorage 数据（见"数据备份"章节）
- 后续可添加云同步功能（需后端支持）

### 问题4：Cloudflare 自动部署失败

**可能原因**：
- Git webhook 未正确配置
- 构建命令错误

**解决方案**：
1. 检查 Cloudflare Dashboard → Settings → Builds & deployments
2. 确认配置：
   - Framework preset: None
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Root directory: `web`
3. 手动触发部署：Dashboard → Deployments → Trigger deployment

---

## 附录

### A. 关键配置文件

**web/package.json**：
```json
{
  "scripts": {
    "prebuild": "rm -rf public/data && mkdir -p public/data && rsync -a --exclude '*.db' ../data/ public/data/",
    "build": "tsc -b && vite build"
  }
}
```

**说明**：`prebuild` 脚本在构建前自动将 `../data/` 同步到 `web/public/data/`（`--exclude '*.db'` 排除 SQLite 分析库，避免打包 4.8MB 无用文件），确保数据文件被 Vite 打包到 `dist/`。

**web/vite.config.ts**：
```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
```

**说明**：使用默认 `publicDir`（即 `public/`），Vite 会自动将 `public/` 下的所有文件复制到 `dist/`。

### B. Cloudflare API 凭证管理

**获取 API Token**：
1. 访问 https://dash.cloudflare.com/profile/api-tokens
2. Create Token → Custom Token
3. Permissions：Account → Cloudflare Pages → Edit
4. 复制生成的 Token

**获取 Account ID**：
- Dashboard URL：https://dash.cloudflare.com/`ACCOUNT_ID`/...
- 或在 Members 页面查看

**安全建议**：
- 不要将 Token 提交到 Git
- 定期轮换 Token
- 限制 Token 权限（最小权限原则）

### C. 未来扩展方向

1. **PWA 支持**：添加 manifest.json 和 Service Worker，支持离线使用和"添加到主屏幕"
2. **数据云同步**：添加后端 API（Cloudflare Workers + D1/KV），实现多设备数据同步
3. **自定义域名**：绑定自己的域名（如 learn.charles.com）
4. **数据分析**：集成 Analytics，跟踪学习进度和使用习惯

---

## 联系方式

如有问题，联系：
- GitHub：https://github.com/charles-ai-9/rootgraph
- Email：641470960@qq.com

---

**最后更新**：2026-08-21  
**维护者**：Charles
