# Smart Money Monitor — 项目结构 & 本地启动指南

> NY Fed Treasury + 13F 智能监控面板。线上部署在 Vercel（项目名 `smart-money-monitor`）。
> 本文档更新日期：**2026-06-01**。

---

## 1. 这个仓库里有什么(重要:有三套代码)

仓库经历过一次重构,目前包含 **三个独立的代码目录**,但**当前线上 / 主力开发的是 `web/`**:

| 目录 | 技术栈 | 状态 | 说明 |
|------|--------|------|------|
| **`web/`** | **Next.js 16 + React 19 + TS + Tailwind v4** | ✅ **当前主力 / 线上部署** | 全栈(SSR + API Route),数据源直连 NY Fed / Treasury,13F 数据存 Supabase |
| `frontend/` | Vite 6 + React 19 (JSX) | ⚠️ 旧版(遗留) | 老的纯前端 SPA,配合下面的 `backend/` 使用 |
| `backend/` | FastAPI + Python 3.11–3.14 | ⚠️ 旧版(遗留) | 老的 Python 后端 API |

> **给同事的话:日常开发只需要进 `web/` 目录。** `frontend/` 和 `backend/` 是重构前的旧实现,保留作参考,可不启动。

---

## 2. 目录结构

```text
nyfed_treasury_web_agent/
├── web/                      ★ 当前主力项目(Next.js 全栈)
│   ├── src/
│   │   ├── app/
│   │   │   ├── [lang]/                # 多语言路由 /zh /en
│   │   │   │   ├── page.tsx           # 首页(总览)
│   │   │   │   ├── [section]/page.tsx # 各数据板块详情页
│   │   │   │   └── managers/          # 13F 机构持仓 列表 + 详情([cik])
│   │   │   ├── api/data/route.ts      # GET /api/data — 聚合所有板块数据
│   │   │   ├── actions.ts             # Server Actions
│   │   │   ├── layout.tsx / page.tsx / globals.css
│   │   ├── components/
│   │   │   ├── dashboard/             # 面板业务组件
│   │   │   └── ui/                    # shadcn/ui 基础组件
│   │   ├── lib/
│   │   │   ├── build.ts               # buildAllSections() 聚合各板块
│   │   │   ├── sources/               # 数据源:nyfed.ts / treasury.ts
│   │   │   ├── analyzers/             # 各板块分析逻辑(soma/auction/pd/...)
│   │   │   ├── sections/              # 板块组装(dataFreshness 等)
│   │   │   ├── managers/              # 13F:supabase / db / source / types
│   │   │   ├── charts.ts / dashboard.ts / i18n.ts / types.ts / format.ts
│   │   │   └── __tests__/             # vitest 测试 + fixtures
│   │   └── data/                      # 打包内置的回退数据(13f / sme)
│   ├── scripts/
│   │   ├── ingest-13f.ts              # 13F 数据写入 Supabase 的脚本
│   │   └── lib/supabaseUpsert.ts
│   ├── supabase/
│   │   ├── schema.sql                 # 数据库表结构
│   │   └── README.md                  # Supabase 接入说明
│   ├── .env.local                     # 本地环境变量(不提交)
│   ├── .nvmrc                         # Node 版本 = 20
│   ├── package.json / next.config.ts / tsconfig.json / vitest.config.ts
│
├── backend/                  ⚠️ 旧版 FastAPI(可选)
│   ├── app/main.py           # FastAPI 入口
│   ├── app/services/         # nyfed_client / treasury_client 等
│   ├── app/analyzers/        # Python 版各板块分析
│   ├── requirements.txt / Procfile
│
├── frontend/                 ⚠️ 旧版 Vite SPA(可选,配合 backend)
│   ├── src/                  # App.jsx + components/ + lib/
│   ├── package.json / vite 配置
│
├── data/                     # 共享数据目录(cache/raw/processed/manual/reports)
├── config.yaml               # 旧版后端配置(端口、数据源 URL、SME 文件路径)
├── README.md / CHANGELOG.md
└── .vercel/                  # Vercel 项目关联信息
```

---

## 3. 本地启动 —— 主力项目 `web/`(推荐)

### 前置要求
- **Node `20`**(仓库带 `.nvmrc`,建议用 nvm)
- npm(随 Node 一起)
- (可选)Supabase 项目 —— 不配也能跑,会自动回退到打包内置的 JSON 数据

### 步骤

```bash
cd web

# 1. 切到正确的 Node 版本(读取 .nvmrc → Node 20)
nvm use            # 没装就先 `nvm install 20`

# 2. 安装依赖
npm install

# 3. 启动开发服务器
npm run dev
```

打开浏览器访问:**http://localhost:3000**
默认进入多语言路由,可访问:
- `http://localhost:3000/zh` — 中文总览
- `http://localhost:3000/en` — 英文总览
- `http://localhost:3000/zh/managers` — 13F 机构持仓
- `http://localhost:3000/api/data` — 聚合数据 API(JSON)

### 环境变量(可选 —— 13F 走 Supabase 时才需要)

在 `web/.env.local` 中配置(**该文件已 gitignore,不要提交**):

```bash
SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>   # 仅服务端用,勿暴露到客户端
POSTGRES_URL_NON_POOLING=<postgres 直连串>
```

- **不配置时**:13F 自动回退到 `web/src/data/13f` 内置 JSON,前端正常显示。
- **配置后**:数据走 Supabase。需先在 Supabase SQL Editor 执行 `web/supabase/schema.sql` 建表。

### 常用命令(`web/` 目录下)

```bash
npm run dev      # 开发服务器(热更新),http://localhost:3000
npm run build    # 生产构建
npm run start    # 运行生产构建
npm run lint     # ESLint 检查
npm run test     # 跑 vitest 单测
npm run ingest   # 把 13F 数据写入 Supabase(需先配好 .env.local)
```

写库示例(需 env):

```bash
cd web
export $(grep -v '^#' .env.local | xargs)
npm run ingest   # 每位机构应打印 "upserted to Supabase"
```

---

## 4. (可选)启动旧版 `backend/` + `frontend/`

> 仅在需要参考 / 调试旧实现时启动。新功能请在 `web/` 中开发。

### 旧版后端(FastAPI,端口 `8010`)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install --only-binary=:all: -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8010
```

> 首次启动会构建 matplotlib 字体缓存(约 20 秒),属正常现象。

主要接口:`GET /api/health`、`GET /api/summary`、`GET /api/sections/{name}`、`POST /api/refresh/all`

### 旧版前端(Vite,端口 `5174`)

```bash
cd frontend
nvm use          # Node 20
npm install
npm run dev      # http://127.0.0.1:5174 ,路由 /zh /en
```

---

## 5. 数据来源说明 ⚠️

本项目直连实时公开数据,**无数据库做行情存储**(13F 用 Supabase 仅做持仓快照):

- **Reference Rates**(SOFR/EFFR/OBFR/TGCR/BGCR)、**SOMA**:NY Fed Markets API
- **Treasury Auction**:美国财政部 API
- **13F 机构持仓**:SEC 13F 文件(经 `scripts/ingest-13f.ts` 入 Supabase)
- **Policy Expectations**:手动下载的 NY Fed SME 调查文件(`data/manual/sme_latest.xlsx`)

`web` 的 `/api/data` 设为 `force-dynamic`(每次请求实时拉取),fetch 层带 `revalidate: 600` 做 10 分钟增量缓存。
**使用 / 展示数据时请确认数据为最新,并标注来源与日期。**

---

## 6. 部署

- 平台:**Vercel**,项目名 `smart-money-monitor`,Root Directory = `web`
- 推送到 `main` 分支即触发部署
- 线上环境变量在 Vercel 项目 Settings → Environment Variables 中配置(同 `.env.local` 的键)

---

## 速查:最快上手三条命令

```bash
cd web && nvm use && npm install && npm run dev
# → http://localhost:3000/zh
```
