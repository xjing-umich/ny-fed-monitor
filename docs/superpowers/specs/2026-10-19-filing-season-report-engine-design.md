# 申报季内容引擎：季度共识报告 + 首期 newsletter

- 日期：2026-10-19
- 状态：四节设计已逐节获用户认可，待用户审阅本 spec → writing-plans
- 分支：`plan/filing-season-report-engine`（off `db-foundation`）
- 纲领对齐：北斗星纲领柱③留存（newsletter 真发）+ 柱②权威（季度报告当外链弹药）；两个月目标见“Q3 申报季：信任 + 第一批回访用户”。
- 硬时间点：Q3 2026 13F 截止 = 9/30 + 45 天 = 11/14（周六）→ **11/16（周一）**。

---

## 1. 目标与非目标

**目标**
1. 每季自动生成一份“季度超级投资者共识报告”，作为可收录、可引用的 Learn 页（`/[lang]/learn/qN-YYYY-superinvestor-consensus`）。
2. 申报季期间报告页标“申报中 n/97”实时刷新；截止后经用户审阅定稿冻结。
3. 定稿后用同一份数据发一期 newsletter（Resend Broadcast，按 zh/en 分发）。这是站点第一封 newsletter。
4. Q3 2026 赶在申报季上线；Q2 2026 用同一模板补出（只上页面，不群发），兼作彩排。

**非目标（YAGNI）**
- 不做双重确认订阅（用户确认暂不加）。
- 不做 AI 叙述；所有文字由模板 + 数据生成（DeepSeek 层已于 7/18 拆除）。
- 不改 Q1 手写报告 `q1-2026-superinvestor-consensus`。
- 不合并多个订阅框（属 UX 首期第 6 步）；本 spec 只改订阅文案文字。
- 不做行业轮动、集中度等新板块。
- 不做按股票的关注推送（第二期）。

## 2. 已确认的决策

| 决策点 | 结论 |
|---|---|
| 人工参与 | 自动生成；用户审预览后一键定稿并发送 |
| 发布时机 | 报告页申报季中先上线标“申报中”；截止后定稿，只发一封邮件 |
| 邮件语言 | 订阅时记录 zh/en，按语言分发；老订阅者归 EN，英文版顶部附“中文版”链接 |
| 板块 | 共识买入/卖出、持有人数最多 + 变化、击球区交集、名家动作（四个都要） |
| 架构 | 方案 A：`quarterly_reports` 快照表，页面与邮件读同一份 payload |
| 申报季加密抓取 | 要 |

## 3. 数据与生成

### 3.1 表 `quarterly_reports`

```sql
create table quarterly_reports (
  period            date primary key,          -- 季末日，如 2026-09-30
  status            text not null check (status in ('live','final')),
  payload           jsonb not null,            -- 只存数字 / ticker / 投资人 slug，不存成句文案
  coverage_filed    int  not null,             -- 已申报该季的活跃投资人数
  coverage_total    int  not null,             -- 活跃投资人总数（剔除 inactive）
  valuation_as_of   date,                      -- 击球区判定所用估值快照日期
  first_live_at     timestamptz not null,      -- JSON-LD datePublished
  generated_at      timestamptz not null,      -- 最近一次生成；JSON-LD dateModified、sitemap lastmod
  payload_hash      text not null,             -- payload 内容哈希；内容不变则不更新 generated_at
  preview_payload   jsonb,                     -- 最近一次预览邮件所用的 payload（定稿时原样冻结它）
  preview_valuation_as_of date,
  preview_sent_at   timestamptz,               -- 最近一次预览邮件
  finalized_at      timestamptz,
  sends             jsonb not null default '{}'::jsonb  -- {"en":{"broadcastId":..,"sentAt":..},"zh":{...}}
);
```

- 冻结由写入条件保证：`report.ts` 的 upsert 只在 `status = 'live'` 或行不存在时生效（`insert … on conflict (period) do update … where quarterly_reports.status = 'live'`），定稿行任何脚本都改不动。
- 迁移文件放 `web/supabase/migrations/`，沿用现有命名。

### 3.2 为什么不能直接读 `consensus_*` 表

`consensus_holdings` / `consensus_moves` 等只存**当前有效季**的快照（`computeAndStoreConsensus` 每次全表删后重写），没有 period 维度；而且申报季前段 `effectiveMovesPeriod` 会回退到上一季。报告必须**锁定在报告季度**，所以按指定 period 从 `filings` + `holdings` 重新算，复用同一套纯函数（`computeConsensus`、`computeStockHolders` 与 `scripts/lib/computeConsensus.ts` 的 `diff`），口径与全站一致。

### 3.3 生成函数

- `src/lib/reports/build.ts`：纯函数 `buildQuarterlyReport(input: ReportInput): ReportPayload`，无 I/O。
- `scripts/lib/loadReportInput.ts`：I/O 层，按 period 取数：
  - 每位活跃投资人取 period = P 的申报与 period = P−1 季的申报（同季原件 + 修正件按现有 `latestDistinctPeriodFilings` 规则取最新一份），持仓走 `readAll` 分页（避开 PostgREST 1000 行截断，见 #198）。
  - `security_cusips` 映射 ticker；`valuation_snapshot` 取击球区判定。
- 活跃口径：沿用 `freshness13F(...) !== 'inactive'`；`coverage_total` = 活跃人数，`coverage_filed` = 其中已申报 P 的人数。

### 3.4 四个板块的口径

| 板块 | 口径 | 条数 |
|---|---|---|
| 共识买入 / 卖出 | 只计**已申报 P 的投资人**，其 P 对 P−1 的变动；按参与人数排序，平手按净金额；期权不计 | 各 Top 10 |
| 持有人数最多 + 变化 | P 的持有人数；“变化”只在**已申报 P 的投资人**内比较其 P 与 P−1 是否持有（同一批人自比，申报季中不会因为有人没申报而虚降） | Top 10 |
| 击球区交集 | P 中持有人 ≥ `CONSENSUS_MIN_HOLDERS`（2）且估值快照 `reliable` 并判为击球区或价值带以下；只说位置和计数 | 全部，按持有人数排序 |
| 名家动作 | `web/config/report-featured.json`（8–10 个投资人 slug）每人取 P 对 P−1 权重变化绝对值最大的 1–2 个动作；未申报 P 的标“未申报” | 每人 1–2 条 |

空板块不隐藏，payload 带 `emptyReason`，页面写“本季暂无满足条件的股票”加原因，绝不显示“—”。

### 3.5 生成时机

- `scripts/report.ts`（`npm run report`），在 `ingest.yml` 中 consensus 算完之后运行。
- 报告季度 P = 最近一个已结束的季度（`mostRecentDueQuarter` 的同一套季度算术，取季末 ≤ 今天的最近一季）。P 中至少 1 位活跃投资人已申报时，才 upsert `live` 行；`payload_hash` 不变时只跳过（不改 `generated_at`、不 revalidate），变了才写入并 `POST /api/revalidate?source=report`。
- 失败时非零退出、不覆盖已有行（沿用 consensus 写失败必须抛错的纪律），由 watchdog 发现。

### 3.6 可定稿条件与 Q2 补发

- `reportReadiness(row, today)` 纯函数：`today > filingDeadline(P)` 且 `coverage_filed / coverage_total ≥ 0.9` → `ready`。只触发预览提醒，不自动定稿。
- 击球区用**最后一次预览时**的估值快照（定稿冻结的就是那份）；页面和邮件写明“价值位置按 YYYY-MM-DD 收盘价计算”。
- 定稿后的迟到申报和修正申报不计入；页面注明并链到实时共识页。
- **Q2 2026**：对 2026-06-30 直接生成并定稿（申报季已过）；估值用当下快照，页面如实写“价值位置按 2026-10-xx 计算，晚于该季申报季”。只上页面，不群发。

## 4. 报告页

### 4.1 路由

- 沿用 Q1 的 slug 形态：`/[lang]/learn/q3-2026-superinvestor-consensus`。
- `learn/[slug]/page.tsx` 增加分支：slug 匹配 `^q([1-4])-(\d{4})-superinvestor-consensus$` 且不在手写 `ARTICLES` 中 → 读 `quarterly_reports` 渲染 `ReportArticle`；无行 → `notFound()`。
- `generateStaticParams` 保持只列手写文章；报告页 `dynamicParams` 按需生成。
- 按需刷新：`/api/revalidate` 增加 `source=report`，对该报告的两个语言路径 `revalidatePath`。`DATA_DRIVEN_PATHS` 不变量（`revalidate-paths.check.ts`）若因此需要登记，按该校验的规则一并更新。

### 4.2 页面结构（自上而下）

1. **状态条**：
   - live：“97 位中已有 61 位申报 · 每次有新申报后更新”
   - final：“定稿于 2026-11-18 · 97 位中 94 位已申报”
2. **一句结论**（模板 + 数据，兼作 `meta description` 与 GEO 引用句），例：“Q3 2026：12 位超级投资者同时加仓 X；持有人数最多的仍是 GOOG（17 位，比上季多 2 位）；被至少 2 位持有的股票中有 4 只处在击球区。”
3. **四个板块**：SSR 表格，区块头左标题、右来源与日期；股票与投资人链到实体页。live 期计数一律写“已申报的 61 位中”。
4. **方法与口径**：SSR 原生 `<details>`：数据来源、共识口径、击球区定义、未申报与修正申报的处理、价值位置日期。
5. **来源**：SEC EDGAR + as-of。

### 4.3 周边

- Learn 首页把最新一份报告置顶（`getFeatured` 优先最新报告）。
- 首页 masthead 申报季进度行加“Q3 报告”链接（与 UX 第 4 步可能冲突，后合并者处理）。
- sitemap 收录报告页，`lastmod = generated_at`。
- Article JSON-LD：`datePublished = first_live_at`，`dateModified = generated_at`。
- OG：沿用 `ogCard`，副标题放结论句。
- 文案遵守 `docs/copy-voice.md`，中英各自独立判断。

## 5. 邮件与订阅

### 5.1 订阅端

- `NewsletterForm` 提交时带 `lang`；`/api/subscribe` 校验 `lang ∈ {zh,en}`（缺省 en），`resend.contacts.create({ email, unsubscribed:false, segments:[{ id: SEGMENT[lang] }] })`。是否仍需 `audienceId` 以 resend 6.12.4 实际行为为准，实现时先查 SDK 类型与 Resend 文档再定。
- 新 env：`RESEND_SEGMENT_EN_ID`、`RESEND_SEGMENT_ZH_ID`（Vercel + GitHub Secrets）。
- 一次性脚本 `scripts/newsletter-backfill-segment.ts`：把现有无 segment 的联系人归入 EN。
- 订阅文案改为诚实版（字典文字）：“每季 13F 申报截止后一封，讲超级投资者这季动了什么。随时退订。”
- 隐私页补一句“会记录你订阅时的语言”；`lastUpdated` 更新。

### 5.2 邮件

- `src/lib/reports/email.ts`：纯函数 `renderReportEmail(payload, meta, lang) → { subject, previewText, html, text }`，与报告页同一份 payload；不引入 react-email，表格式简单 HTML。
- 内容：一句结论 → 四个板块各前 3 条 → “看完整报告”按钮（对应语言报告页）→ 来源与 as-of → “不构成投资建议” → 退订链接 `{{{RESEND_UNSUBSCRIBE_URL}}}`。
- 英文版顶部一行“中文版 →”。
- 首期开头一句：“你之前在 thecompounder.fyi 订阅了季度更新，这是第一期。”（由 `isFirstIssue` 控制，以后不出现。）
- 发件人：`Compounder <newsletter@send.thecompounder.fyi>`；reply-to 为站长联系邮箱。

### 5.3 待用户确认

- **CAN-SPAM 实际通讯地址**：纯内容性质的 newsletter 一般不算商业推广邮件，但是否在页脚放地址由用户判断。实现时预留可选的 `NEWSLETTER_POSTAL_ADDRESS`，有值才渲染。

## 6. 定稿与发送流程

1. **ingest 后**：`report.ts` 刷新 live 行 → revalidate。
2. **申报季加密**：`ingest.yml` 增加一条 cron，仅在 2/5/8/11 月 10–20 日每天 09:00 UTC 运行；原周一/四不变。
3. **可定稿时**：`report.ts` 在 `reportReadiness = ready` 且 `preview_sent_at` 为空时，把中英两版真实渲染的邮件发到 `RESEND_ALERTS_TO`，附报告页链接和操作说明；同时把这份 payload 写入 `preview_payload`、`preview_valuation_as_of`、`preview_sent_at`。之后的 ingest 照常刷新 live 页面，但不再自动重发预览（估值随股价每日变化，自动重发会无限循环）。
4. **用户运行 `report-finalize-send.yml`**（`workflow_dispatch`，输入 `period`、`action`）：
   - `action = preview`：用当前 payload 重新生成预览（想要更新的估值日期时用）。
   - `action = finalize`（默认）：把 `preview_payload` **原样**冻结为 `payload`，`valuation_as_of = preview_valuation_as_of`，原子更新 `status = 'final'`（条件 `status = 'live'` 且 `preview_payload` 非空）、写 `finalized_at` → revalidate → 对 EN、ZH 两个 Segment 分别 `broadcasts.create` + `send`，逐个写入 `sends`。**你审的就是发出去的。**
   - 幂等：已 final 时跳过定稿步骤；`sends` 中已有的语言跳过；重跑只补失败的那个。
   - 输入 `dry_run`（默认 `false`）：为 `true` 时只发给 `RESEND_ALERTS_TO`，不改状态。Q2 彩排用它。
5. **watchdog**：新增检查——截止日 + 10 天后报告仍未定稿 → 告警。

## 7. 出错处理

| 场景 | 处理 |
|---|---|
| 生成失败 / 读库失败 | 非零退出，不覆盖已有行；watchdog 可见 |
| 某板块无数据 | `emptyReason` + 页面说明原因 |
| 报告行不存在 | 报告页 `notFound()` |
| 预览后数据变化 | 定稿冻结的是预览那一份；想用新数据先跑 `action = preview` |
| 未发过预览就运行定稿 | 拒绝并提示先跑 `action = preview` |
| 单个 Segment 发送失败 | 记录失败；重跑只补发该语言 |
| Segment env 未配置 | 订阅接口退回无 segment 创建（仍归 EN），发送流程报错退出 |

## 8. 验收

- `*.check.ts` 断言（项目现有写法，`tsx` 运行）：`buildQuarterlyReport`（含申报季中“同一批人自比”的口径）、`reportReadiness`、`renderReportEmail`（中英、首期句、退订占位符存在）、报告 slug 解析。
- **跨页一致性核对**：定稿后的报告每个数字与当期 consensus / buys / sells 页逐个比对（在 `effectiveMovesPeriod` 已切到该季之后）。
- `curl` 确认报告页正文为 SSR；`tsc --noEmit` 与 `npm run build` 通过。
- **Q2 彩排**：完整跑一遍生成 → 定稿（`dry_run=true` 发到站长）→ 检查邮件在 Gmail / Apple Mail 的渲染与退订链接。

## 9. 时间线

| 时间 | 事项 |
|---|---|
| 10/19–10/23 | spec 审阅、plan |
| 约 11/6 前 | 实现完成，Q2 彩排 |
| 约 11/9 | Q3 报告页以“申报中”上线 |
| 11/16 后 | 等覆盖率达标 |
| 约 11/18–20 | 用户审预览，一键发出第一封 |

与 UX 第 2、4 步改的文件基本不重叠，可并行；唯一交叉是首页 masthead 的报告链接。

## 10. 原则核对（精简 · 准确 · 轻松）

| 原则 | 本 spec 的落点 |
|---|---|
| 首屏一个结论 | 状态条 + 一句结论，四个板块在其后 |
| 同一事实一页只说一次 | 覆盖率只在状态条出现；表内计数引用它而不重复解释 |
| 不删数据，次要内容收进 `<details>` | 方法与口径 SSR `<details>`，爬虫可读 |
| 同一事实跨页同值 | 复用全站同一套 consensus 纯函数；页面与邮件同一份 payload；定稿后冻结 |
| 半成品数据不当终值 | live 期标“申报中 n/97”，计数写“已申报的 n 位中”；邮件只在定稿后发 |
| “未评估”“待确认”带原因 | 空板块 `emptyReason`；名家未申报标“未申报” |
| 文案不承诺做不到的事 | 订阅文案改为“每季申报截止后一封”，从首期起属实；隐私页“退订链接”从首期起属实 |
| 正文 15px、术语就地解释 | 沿用字阶 v2；“击球区”“价值带”在方法段解释，并链到 Learn 估值文章 |

## 11. 护栏与成本

- URL 体系不变（沿用 Learn slug）；正文 SSR；零新增客户端组件。
- 合规：只说位置和计数，无买卖建议、目标价、评级。
- 双语对等：中英由同一模板生成。
- **新增 Supabase 读取**（首期路线图护栏要求单列）：报告页每次 ISR 刷新读 1 行；sitemap 读报告列表（每季 1 行）。报告页只在 ingest/定稿时按需刷新，egress 可忽略。生成脚本的读取在 GitHub Actions 内，与现有 consensus 计算同量级。
- 新增外部依赖：无（resend 已有）。
