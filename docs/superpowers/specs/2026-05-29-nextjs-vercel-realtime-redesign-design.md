# NY Fed Treasury 仪表盘 — Next.js + Vercel 全 TypeScript 实时化重构设计

- 日期: 2026-05-29
- 状态: 已与用户确认（全 TS serverless 版），待 review
- 目标读者: 后续实现计划（writing-plans）

## 1. 背景与动机

现有系统：
- 后端 FastAPI + analyzers（NY Fed Primary Dealer / Reference Rates / SOMA / Market Share / Facility Usage，U.S. Treasury 拍卖），JSON 文件缓存，无数据库，不出交易建议。
- 前端 Vite + React 19 SPA，中英双语 `/zh` `/en`。
- 已完成的改进：P0（HTTP 重试退避、`mode` 语义修复、环境锁定）、P1（内存缓存+TTL、刷新异步化）、P2 部分（设计 token + 暗色 + recharts 交互图）。

本次重构目标（用户确认）：
1. 数据采集+分析层做到**自动实时刷新（允许分钟级延迟）**。
2. **整体重写为单一 TypeScript 技术栈**：Next.js（最新）+ React 19，符合金融类 web app 的现代化实现。
3. **部署到 Vercel**。
4. **零费用**（学生身份，仅用 Vercel Hobby 免费档 + 免费公开数据源）。

## 2. 关键决策与约束

- **全 TypeScript serverless**：放弃在 Vercel 上混用 Python + Next.js（两套工具链、本地开发需 `vercel dev`/flask 垫片、部署配置易踩坑）。数据抓取与分析改为 Next.js 内的 TS（Route Handler / server 函数）。
- **现有 Python 后端保留为“参照实现”**：不上线，仅用于离线生成数值快照，校验 TS 移植无偏差。
- **Vercel Hobby Cron 只能每天一次** → 不用 Cron 做高频刷新。来源: https://vercel.com/docs/cron-jobs/usage-and-pricing 、https://vercel.com/docs/plans/hobby
- **“实时但允许延迟”用 Next.js 数据缓存实现**：对每个上游 API 的 `fetch` 设 `next: { revalidate: 600, tags: [...] }`，Next 自动缓存 10 分钟（stale-while-revalidate）；手动刷新用 `revalidateTag`/`revalidatePath`。无需 KV/Cron。
- Hobby 仅限**非商业用途**；学生非商业看板，合规。

## 3. 整体架构（全 TS 最终版）

```
┌───────────────────────────────────────────────────────────────┐
│  Vercel Hobby（单一 Next.js 项目，$0，单运行时）                  │
│                                                                 │
│  app/[lang]/page.tsx (Server Component)                         │
│    └─ buildAllSections()  ← lib/build.ts                        │
│         └─ lib/analyzers/* 计算                                  │
│              └─ lib/sources/* 抓取                               │
│                   fetch(url,{ next:{ revalidate:600, tags }})    │
│                   ← 上游响应被 Next 缓存 10 分钟（SWR）            │
│  app/api/data/route.ts   → 同样的 buildAllSections()（调试/外部） │
│  app/actions.ts          → 手动刷新: revalidateTag('upstream')   │
└───────────────────────────┬───────────────────────────────────┘
                            │ fetch + 重试（TS 移植）
                            ▼
        NY Fed Markets API · U.S. Treasury FiscalData（免费公开）
```

**“实时”机制**：数据新鲜度由“上游 fetch 缓存 10 分钟 + SWR”保证——页面计算很快（命中缓存），缓存过期后下一次请求后台刷新。手动刷新按钮 `revalidateTag` 立即失效缓存。

**无 Cron、无 KV、无 Python 上线、无 `requirements.txt`。**

## 4. 仓库结构

```
repo/
├─ web/                                  # 唯一部署单元（Vercel 根）
│  ├─ app/[lang]/layout.tsx              # 主题/字体/dir/lang
│  ├─ app/[lang]/page.tsx                # 仪表盘 Server Component
│  ├─ app/page.tsx                       # 根重定向 → /zh
│  ├─ app/api/data/route.ts             # 全量 JSON（调试/外部/快照对照）
│  ├─ app/actions.ts                     # Server Action: 刷新
│  ├─ components/dashboard/*.tsx         # Header/Cards/Sidebar/SectionPanel/MetricGrid/DataTable/SectionChart
│  ├─ components/theme-provider.tsx
│  ├─ components/ui/                     # shadcn
│  ├─ lib/sources/{nyfed,treasury}.ts    # 带重试+revalidate 的抓取
│  ├─ lib/analyzers/{common,pd,referenceRates,soma,facilityUsage,auction,marketShare}.ts
│  ├─ lib/build.ts                       # 并行装配所有 section → DataPayload
│  ├─ lib/{types,i18n,format,charts,dashboard}.ts
│  └─ lib/__tests__/                     # vitest（含 fixtures + Python 快照对照）
└─ backend/                              # 参照实现（不上线）：保留 analyzers/services 与 venv
```

> 旧 Vite `frontend/` 在重构完成后退役。Python `backend/` 不删，作为对数据/对照的“黄金实现”，并提供 `data/raw/` 原始抓取作为测试 fixture。

## 5. 数据层（TypeScript）

- **lib/sources/**：`fetchJson(url, { tag })` —— 用 `fetch(url, { next: { revalidate: 600, tags: [tag] } })`，含与 P0.1 等价的**重试/退避**（连接 reset/超时/5xx 重试，4xx 不重试）。
- **lib/analyzers/**：把 Python 的纯计算逐一移植：
  - `common.ts`：`changeFromWeeks(1/4/13)`、`rollingZScore(window=52)`、`historicalPercentile`、金额格式化、`freshnessStatus`(≤8 Fresh / ≤14 Stale / else Old)、`finalizeLiveMode`（数据缺失→unavailable）。
  - `pd.ts`：dealer-inventory / transactions / repo-financing（单序列）+ fails（deliver+receive 合并）。
  - `referenceRates.ts`、`soma.ts`、`facilityUsage.ts`（含 repo/RRP 分类、small-value 标记）、`auction.ts`（拍卖风险评分）、`marketShare.ts`。
  - 输出结构与现有保持兼容（`title/title_zh/mode/freshness_status/data_date/key_metrics/tables/normalized_data/warnings/...`），**不再生成图表**（前端 recharts 用 `normalized_data`）。
- **lib/build.ts**：`buildAllSections()` —— 用 `Promise.all` 并行构建独立 section，再构建依赖 section（facility-usage 依赖 reference-rates；auction 依赖 dealer/transactions/fails），最后拼 `summary`。单 section 失败 → 该 section `unavailable`，不影响整体。

## 6. 前端（Next.js）

- App Router，默认 Server Components，React 19。
- 路由 `/[lang]`（zh|en）+ `generateStaticParams`；`/` 重定向 `/zh`。
- Tailwind v4 + shadcn/ui；暗色用 `next-themes`。
- 图表 shadcn `Chart`（recharts），移植本会话 `buildChartSpec`。
- 复用并改写为 TS：i18n、`badgeTone`、格式化、图表 spec、dashboard 辅助、已完成的 P2 视觉（token、风险色阶、▲▼ 趋势、`tabular-nums`、表头 i18n）。
- 组件：Header（语言/主题/刷新）、DashboardCards（风险色阶）、Sidebar、SectionPanel（MetricGrid + DataTable + SectionChart）。
- 手动刷新：Server Action `revalidateTag('upstream')` + `revalidatePath`。

## 7. 部署（Vercel，$0）

- 单一 Next.js 项目（Root = `web/` 或仓库根含 web）。无 Python 函数、无 `requirements.txt`、无 `crons`。
- 环境变量：基本无需（同源 Route Handler）；可选 `DATA_REVALIDATE_SECONDS`。
- 域名：免费 `*.vercel.app`。
- 验证：先 preview 部署 → `/zh` `/en` 截图浅/深色、图表 hover、风险色阶、趋势箭头、无 console 报错 → promote。

## 8. 数值校验（移植正确性保证）

- 用 Python 客户端已落盘的 `data/raw/*.json`（或新跑一次保存）作为**确定性 fixture**。
- 对同一份 raw fixture：Python analyzers 产出 `key_metrics` → 存为快照 `web/lib/__tests__/fixtures/*.snapshot.json`；TS analyzers 跑同一 fixture → vitest 断言数值一致（浮点容差、忽略 `last_refreshed_at` 等时间字段）。
- 逐 section 对齐，确保移植无偏差。

## 9. 错误处理与数据诚实

- 单 section 抓取失败 → `mode=unavailable`、`freshness=Unavailable`，其余照常。
- 上游整体不可达 → Next fetch 缓存继续供上一份成功值（SWR）；页面显示新鲜度年龄。
- 重试/退避（P0.1 的 TS 版）吸收 NY Fed 偶发连接 reset。

## 10. 有意保留的原则

- 无数据库、无 KV（MVP）。
- 不生成交易建议。
- 中英双语贯穿。

## 11. 暂缓 / 后续项

- **policy-expectations**：原依赖本地 `data/manual/sme_latest.xlsx`。serverless 无持久本地文件 → MVP 降级 `unavailable`。后续可选：SME 文件传 Vercel Blob，TS 读取解析。
- 可选增强：上游抖动时引入 Upstash Redis（免费档）做跨区域持久缓存；升级 Pro plan 后用 Cron。

## 11b. 前端重设计 v2（"Treasury Terminal" 机构风，去 AI 感）

用户反馈 v1 前端（忠实复刻旧 Vite 布局）过于通用/AI 感。重设计方向（已授权，无需逐步确认）：

- **布局/骨架（方向 A 机构级仪表盘）**：固定左侧分组导航(240px) + 顶栏(52px) + 主内容区。
  - 左栏：产品标识 + 分组(Market Structure / Funding / Supply & Balance Sheet / Policy / System)，每项含新鲜度小圆点；active = 左侧 2px 强调条 + 淡底 + 强调色文字。
  - 顶栏：当前板块标题 + AS OF 时间(mono) + 全局新鲜度 pill + 语言切换 + 主题切换 + 刷新图标按钮。
- **路由模块化**：`/[lang]` = 概览；`/[lang]/[section]` = 各板块独立路由(generateStaticParams: lang × section)；移除 `?s=`。
- **严格单语言**：按路由 lang 用 i18n 字典显示**一种**语言；删除所有"中文 English"双标签堆叠（最大 AI 感来源）。
- **视觉系统**：
  - 暗色默认。底 `#0B0E14`，面板 `#11151F`，发丝边框 `#1C2230`/`#2A3140`，文字 `#E6E9EF`/muted `#8A93A6`/faint `#5A6172`。
  - 单一强调色 `#6E8BFF`（克制蓝，去掉紫色渐变与顶部彩条）；方向色 正 `#3FB950` / 负 `#F0616D` / 警示·stale `#D9A642`。
  - 字体：UI 用 Geist Sans；**所有数字/日期/指标用 Geist Mono + tabular-nums**（金融终端精确感、强去 AI）。
  - 圆角 6px、1px 发丝边框、去重阴影、密度更高(padding 12–16px、4px 间距尺度)；标签 11px 大写 tracking，KPI 值 22–26px mono。
  - 浅色模式镜像(底 `#FAFBFC`/白面板)，默认暗色。
- **概览页**：密集信号卡(小严重度圆点 + mono 大数 + 一行说明，4–6/行) + "重点观察"紧凑列表 + 可选 1–2 个 sparkline mini。**删除** v1 的巨型执行摘要重复块、Refresh Status 大块、status-minis 文本 dump；系统/覆盖/附录移到 `/[lang]/system`。
- **板块页**：标题 + mode chip + 新鲜度 + 数据日期(mono) → 紧凑 KPI 条(mono 值 + ▲▼ 绿/红) → 全宽交互图(细线/淡网格/mono 轴/克制配色) → 解读·why-it-matters(次级文字) → 可折叠数据表(单语言表头)。
- 复用 v1 已建的数据层、i18n/charts/format/dashboard 逻辑、recharts 组件；重做 shell/路由/视觉与组件结构。

## 12. 验收标准

1. `/zh`、`/en` 在 Vercel preview 正常渲染，浅/深色均可。
2. dealer-inventory / reference-rates / soma / facility-usage 显示真实 live 数据与交互式图表。
3. 抓取失败的 section 正确显示 `unavailable`（不假 live）。
4. 手动刷新按钮触发数据更新。
5. TS analyzers 与 Python 快照数值一致（容差内）。
6. 全程零费用（Hobby，无 KV/Cron/Python/付费域名）；无 console 报错。
