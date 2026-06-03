# Smart Money Monitor — 项目结构 & 本地启动指南

> NY Fed Treasury + 13F 智能监控面板。线上部署在 Vercel（项目名 `ny-fed-monitor`）。
> 本文档更新日期：**2026-06-03**。

---

## 1. 仓库结构

仓库只有一个应用目录 **`web/`**，其他为周边工具：

| 目录 | 说明 |
|------|------|
| **`web/`** | Next.js 16 + React 19 + TS + Tailwind v4 全栈应用（SSR + API Route） |
| `MCP/` | MCP server（周边工具，不参与线上部署） |
| `scripts/mysql_sync/` | Supabase → MySQL 同步脚本（周边工具） |
| `data/manual/` | 手动数据文件（SME 调查等） |
| `docs/` | 设计文档 / 计划存档 |

---

## 2. 目录结构

```text
ny-fed-monitor/
├── web/                      ★ 唯一线上项目（Next.js 全栈）
│   ├── src/
│   │   ├── app/
│   │   │   ├── [lang]/                # 多语言路由 /zh /en
│   │   │   │   ├── page.tsx           # 首页（总览）
│   │   │   │   ├── [section]/page.tsx # 各数据板块详情页
│   │   │   │   └── managers/          # 13F 机构持仓 列表 + 详情（[cik]）
│   │   │   ├── api/data/route.ts      # GET /api/data — 聚合所有板块数据
│   │   │   ├── api/market/            # 各类市场数据 API + ingestion 路由
│   │   │   ├── api/cron/              # 定时任务（Vercel Cron）
│   │   │   ├── actions.ts             # Server Actions
│   │   │   ├── layout.tsx / page.tsx / globals.css
│   │   ├── components/
│   │   │   ├── dashboard/             # 面板业务组件
│   │   │   └── ui/                    # shadcn/ui 基础组件
│   │   ├── lib/
│   │   │   ├── build.ts               # buildAllSections() 聚合各板块
│   │   │   ├── sources/               # 数据源：nyfed.ts / treasury.ts
│   │   │   ├── analyzers/             # 各板块分析逻辑（soma/auction/pd/...）
│   │   │   ├── ingestion/             # 数据写入逻辑（各市场数据源 → Supabase）
│   │   │   ├── sections/              # 板块组装（dataFreshness 等）
│   │   │   ├── managers/              # 13F：supabase / db / source / types
│   │   │   ├── db/                    # 数据库读取层（market / freshness）
│   │   │   ├── charts.ts / dashboard.ts / i18n.ts / types.ts / format.ts
│   │   └── data/                      # 打包内置的回退数据（13f / sme）
│   ├── scripts/
│   │   ├── ingest-13f.ts              # 13F 数据写入 Supabase 的脚本
│   │   └── lib/supabaseUpsert.ts
│   ├── supabase/
│   │   ├── schema.sql                 # 数据库表结构
│   │   └── README.md                  # Supabase 接入说明
│   ├── .nvmrc                         # Node 版本 = 20
│   ├── package.json / next.config.ts / tsconfig.json
│
├── MCP/                      🔧 MCP server（周边工具）
├── scripts/mysql_sync/       🔧 Supabase → MySQL 同步
├── data/manual/              📄 手动数据文件
├── docs/                     📄 设计文档存档
├── config.yaml               旧版配置（仅 MCP/mysql_sync 可能引用）
├── README.md / CHANGELOG.md / PROJECT_GUIDE.md
└── .vercel/                  Vercel 项目关联信息（不提交）
```

---

## 3. 本地启动

### 前置要求
- **Node `20`**（仓库带 `.nvmrc`，建议用 nvm）
- npm（随 Node 一起）
- （可选）Supabase 项目 —— 不配也能跑，会自动回退到打包内置的 JSON 数据

### 步骤

```bash
cd web

# 1. 切到正确的 Node 版本（读取 .nvmrc → Node 20）
nvm use            # 没装就先 `nvm install 20`

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

打开浏览器访问：**http://localhost:3000**
默认进入多语言路由，可访问：
- `http://localhost:3000/zh` — 中文总览
- `http://localhost:3000/en` — 英文总览
- `http://localhost:3000/zh/managers` — 13F 机构持仓
- `http://localhost:3000/api/data` — 聚合数据 API（JSON）

### 环境变量（可选 —— 13F 走 Supabase 时才需要）

在 `web/.env.local` 中配置（**该文件已 gitignore，不要提交**）：

```bash
SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # 仅服务端用，勿暴露到客户端
INGEST_SECRET=<自定义密钥>                      # 保护 ingestion API 路由
```

- **不配置时**：13F 自动回退到 `web/src/data/13f` 内置 JSON，前端正常显示。
- **配置后**：数据走 Supabase。需先在 Supabase SQL Editor 执行 `web/supabase/schema.sql` 建表。

### 常用命令（`web/` 目录下）

```bash
npm run dev      # 开发服务器（热更新），http://localhost:3000
npm run build    # 生产构建
npm run start    # 运行生产构建
npm run lint     # ESLint 检查
npm run ingest   # 把 13F 数据写入 Supabase（需先配好 .env.local）
```

---

## 4. 数据来源说明 ⚠️

本项目直连实时公开数据，**无数据库做行情存储**（13F 用 Supabase 仅做持仓快照）：

- **Reference Rates**（SOFR/EFFR/OBFR/TGCR/BGCR）、**SOMA**：NY Fed Markets API
- **Treasury Auction**：美国财政部 API
- **13F 机构持仓**：SEC 13F 文件（经 `scripts/ingest-13f.ts` 入 Supabase）
- **Policy Expectations**：手动下载的 NY Fed SME 调查文件（`data/manual/sme_latest.xlsx`）

`web` 的 `/api/data` 设为 `force-dynamic`（每次请求实时拉取），fetch 层带 `revalidate: 600` 做 10 分钟增量缓存。
**使用 / 展示数据时请确认数据为最新，并标注来源与日期。**

---

## 5. 部署

- 平台：**Vercel**，项目名 `ny-fed-monitor`，Root Directory = `web`
- 推送到 `db-foundation` 分支即触发部署
- Vercel Cron：工作日 10:00 UTC 自动执行 `/api/cron/market-ingest`
- 线上环境变量在 Vercel 项目 Settings → Environment Variables 中配置（同 `.env.local` 的键）
- Node 版本：**20**（与 `.nvmrc` 一致）

---

## 速查：最快上手三条命令

```bash
cd web && nvm use && npm install && npm run dev
# → http://localhost:3000/zh
```
