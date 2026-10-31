# Account and Personal Valuation Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 首期交付 Google＋邮箱验证码统一账户，以及贯穿全站的个人估值追踪和可靠的基准对照。

**Architecture:** 复用 Supabase Auth、数据库和 Resend；公开研究页面继续缓存，个人会话与接口独立。现有估值结果补齐明确计算锚、证券身份和不可变版本，公开结果完成实际页面代次验证后才进入个人“最新”；个人只持有去重的关注基准引用。

**Tech Stack:** Next.js 16.2.6 / React 19.2.4；Node.js 22.x；supabase-js 2.114.0＋ssr 0.12.7；Postgres/RLS；现有 tsx/assert 检查；现有浏览器工具。

**Spec:** [已批准的首期设计](../specs/2026-10-31-account-valuation-tracking-design.md)。执行者必须同时读取设计与本计划。

## Global Constraints

- 估值是中心；内在价值、安全边际、击球区采用统一口径，保留来源、日期与未评估原因。
- 不修改估值公式、数值门槛、质量护栏；不加入个人参数、多列表、收益榜、投资人关注、AI 归因、提醒邮件或收费额度。
- Google 与邮箱验证码都是首期必交付项；相同已验证邮箱按官方规则关联，业务主键为 user UUID。
- 公开页继续 SSR/ISR；根布局不读用户 cookies，公共响应不刷新会话，私有响应 `private, no-store`。
- 不按用户重算估值，不为每人每日归档；基准固定、去重，来源日期不冒充关注日期。
- 产品文案遵循 `web/docs/copy-voice.md`、既有术语/日期/金额格式；中英文分别审阅。
- 执行时先读所用 Next 16.2.6 的 `node_modules/next/dist/docs/` 相关指南；本轮只写计划，不安装依赖或执行迁移。
- 浏览器验收使用现有浏览器工具，结果记录在 operations；不假设仓库已有 Playwright npm 依赖，不额外引入整套 E2E 测试框架。
- 计划不是执行记录；下列命令/预期结果均待实施。现有研究记录不得冒充真实 Google/邮箱登录验收。
- 不自动合并 PR；已授权代码范围内 review 通过后自动推送/建 PR。设计/计划尚未合并时，实现分支仍从最新 db-foundation 起，引用获批文档提交，不夹带其他分支。

## Review Focus

1. ticker 复用、股类不同或无法确认 FIGI/CIK/CUSIP：不能把关注静默迁给另一证券。Task 2/7 覆盖。
2. revalidate 200、页面仍旧、并发第二代发布：个人最新只能采用经实际页面确认的同一代结果。Task 5/6 覆盖。
3. 旧 JWT 在删除/退出后仍未过期：不能恢复个人读写；token 刷新不能充当近期重新验证。Task 7/11 覆盖。
4. Google 回跳、切换账号、过期关注意图、编码跳转：只执行当前用户的有效动作一次，拒绝外部返回地址。Task 9/10/12 覆盖。
5. 无估值先关注、首次可靠结果、取消/撤销与清理并发：基准不由访问时点决定，也不被清理或重复关注覆盖。Task 7/8 覆盖。

## 交付与基线

2026-10-31 核对：主分支仍为 `a6843f4`；文档分支已有设计提交 `bc95186`，PR #267。所有任务开始前重新核对相应源码和并行 PR。

| 分组 | 任务 | 可单独评审的交付 | 开放条件 |
| --- | --- | --- | --- |
| A 数据准确性 | 1–6 | 兼容运行时、结果契约、身份、比较、发布确认与公共读取 | 公开数字无回归，账户入口保持关闭 |
| B 账户与个人数据 | 7–11 | RLS/事务、个人 API、会话、Google＋邮箱、账户退出/删除 | 测试环境与真实身份验收；生产入口仍关闭 |
| C 全站体验与发布 | 12–14 | 统一关注、个人页/对照、备份与上线证据 | 全部必需验收通过才开启 |

三组通过明确接口相依，使用一份计划，按任务提交并逐组 PR；不是三个可各自替代完整首期的项目。

验证环境：纯函数与 HTTP 夹具检查不需要线上凭据；PG harness 只用本机临时数据库。真实页面/浏览器集成须指向已隔离的测试 Supabase 与本地/预览应用，使用合成证券和明确指定的验收账号，不复用生产 `.env.local`；环境未就绪时如实保留这些验收未完成，可继续无该依赖的任务，不能写成 GREEN 已通过。浏览器工具替代额外测试框架，不替代真实服务验证。

### 文件职责与约定

以下路径相对仓库根。新增模块按职责集中，禁止建立第二个计算引擎。

| 位置 | 职责 |
| --- | --- |
| `web/src/lib/valuation/trackingContract.ts`、`trackingComparison.ts` | 纯结果类型/验证/哈希、可比性与解释 |
| `web/src/lib/securities/trackingIdentity.ts`、`trackingIdentityRead.ts` | 纯身份解析、服务端可信目录读取 |
| `web/src/lib/valuation/publishedRead.ts`、`publishedAdapter.ts` | 公共/追踪版本与安全状态读取，适配现有组件 |
| `web/scripts/lib/trackingPublication.ts`、`valuation-publication-verify.ts` | 发布代次、缓存实际验证、幂等确认 |
| `web/supabase/migrations/20261031_valuation_publication.sql`、`20261031_account_tracking.sql` | 目录/发布状态、基准与个人表、权限/RPC |
| `web/src/lib/tracking/{types,repository,request}.ts` | 个人 DTO、用户会话 RPC 调用、请求校验 |
| `web/src/lib/auth/{config,browser,server,session,intent,redirect,recentAuth}.ts` | 单一认证集成与用户边界；不复用管理单例 |
| `web/src/components/account/`、`web/src/components/tracking/` | 登录、账户、共享关注状态、列表与对照 |
| `web/src/app/api/{auth,my,valuation}/` | 回调、私有数据和独立公共安全状态；接口精确列在任务中 |
| `web/docs/account-tracking-operations.md` | 配置、迁移、真实验收、备份、开关与回滚操作记录模板 |

已有文件修改位置以函数名为锚，实际行号在执行时核实；每个任务只暂存自身列出的文件。

## 先锁定跨任务接口

所有后续签名从这里引用；类型定义在 Task 2/3/7，禁止各任务另起同义字段。

```ts
type SecurityIdentity = {
  key: string; ticker: string; figi: string | null; cik: string | null;
  cusip: string | null; securityType: string; source: string; checkedAt: string;
};
type ReferenceKind = "oe_dcf_neutral" | "zero_growth_floor" | "sotp_base";
type TrackingRecord = {
  schemaVersion: 1; revisionId: string; identity: SecurityIdentity;
  modelVersion: string; currency: string; perShareBasis: string;
  intrinsicValue: number | null; referenceValue: number | null;
  referenceKind: ReferenceKind | null; rangeLo: number | null; rangeHi: number | null;
  price: number | null; priceDate: string | null; priceSource: string | null;
  marginPct: number | null; requiredMargin: number | null; strikePrice: number | null;
  inStrikeZone: boolean | null; status: "valid" | "pending" | "unavailable";
  reasons: string[]; fundamentalAsOf: string | null; filedAt: string | null;
  computedAt: string; publishedAt: string | null;
  inputHashes: { fundamentals: string | null; assumptions: string | null; shareBasis: string | null };
  sources: { url: string; asOf: string | null }[];
};
type ChangeKind = "no_change" | "price_only" | "fundamentals" | "assumptions"
  | "multiple_inputs" | "result_updated" | "not_comparable" | "unavailable";
type TrackingComparison = {
  comparable: boolean; kind: ChangeKind; reasons: string[];
  valueChangePct: number | null; marginChangePp: number | null;
  zoneChange: "entered" | "left" | null;
};
type WatchlistItem = {
  securityKey: string; ticker: string; name: string; followedAt: string;
  baselineRecordedAt: string | null; baseline: TrackingRecord | null;
  latest: TrackingRecord | null; pendingReason: string | null;
  comparison: TrackingComparison | null;
};
```

`TrackingRecord` 是紧凑基准/比较契约。当前公共估值另保存同次 `ValuationRun` 的 presentation 结果，以保留原有详细解释；用户基准不复制整份财报或全套 presentation。

## Task 1: 兼容运行时与依赖，保持功能关闭

**Files:** Modify `web/package.json`、`web/package-lock.json`、`web/.env.example`；Create `web/.nvmrc`、`web/src/lib/auth/config.ts`；Modify `.github/workflows/{ingest,prices,prices-cleanup,fundamentals,valuation,report-finalize-send}.yml`；Create `web/docs/account-tracking-operations.md`。

**Interfaces:** Produces `accountTrackingEnabled(): boolean`（仅 `NEXT_PUBLIC_ACCOUNT_TRACKING_ENABLED === "1"`，默认 false）；客户端/服务端共用该编译期开关，改变需部署。认证只读取 `NEXT_PUBLIC_SUPABASE_URL`、`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`，并验证服务端项目 URL 与既有 SUPABASE_URL 一致；不把管理 key 作为公开 key 的回退。公开 key 缺失只在开启认证时报告配置错误，导入/公开静态构建不初始化客户端。

- [ ] **Step 1 — 验证依赖/记录基线。** 官方 npm 元数据于 2026-10-31 确认：ssr 0.12.7 peer 为 supabase-js `^2.114.0`，后者 engines 为 `>=22.0.0`。执行时重读元数据和本版 Next 指南；在原版本记录现有关键检查结果，已有失败单列，不宣称由本任务修复。
- [ ] **Step 2 — 最小升级。** 在执行工作区使用 Node 22.x；`cd web && npm install --save-exact @supabase/supabase-js@2.114.0 @supabase/ssr@0.12.7`；package engines=`22.x`，`.nvmrc`=`22`，上述全部使用共享 lockfile 的 workflow 对齐 22。不得用 `--force` 或 `--legacy-peer-deps`。
- [ ] **Step 3 — 验证。** Run `npm ls @supabase/supabase-js @supabase/ssr`、`npx --no-install tsc --noEmit`；Run `npx --no-install tsx --tsconfig scripts/tsconfig.json src/lib/valuation/runValuation.check.ts` 与 `scripts/lib/valuationPublication.check.ts`。Expected：无 peer/engine 错误，关键原有检查通过；环境 flag 关闭时公开构建仍成功。纯配置不另写镜像测试。
- [ ] **Step 4 — Commit.** `chore: align auth dependencies and runtime`。Vercel 运行时配置写入 operations 前置项，当前计划阶段不改线上设置。

## Task 2: 证券身份与明确估值参照

**Files:** Create `web/src/lib/securities/{trackingIdentity,trackingIdentityRead}.ts`、`trackingIdentity.check.ts`；Create `web/src/lib/valuation/{trackingContract.ts,trackingContract.check.ts}`；Modify `deriveValuationVerdict.ts`、`deriveValuationVerdict.check.ts`、`runValuation.ts`、`index.ts`（均在 `web/src/lib/valuation/`）。

**Interfaces:** Consumes `ValuationRun` 与现有 SEC/证券读取器。Produces `resolveTrackingIdentity(meta): SecurityIdentity | null`、`readTrackingIdentity(ticker: string): Promise<SecurityIdentity | null>`、`buildTrackingRecord(run: ValuationRun, context: TrackingContext): TrackingRecord`、`parseTrackingRecord(value: unknown): TrackingRecord | null`；`TrackingContext` 在 trackingContract.ts 定义，包含日期/来源/身份/完整非价格输入指纹。

- [ ] **Step 1 — RED tests。** 三个估值分支直接暴露 referenceValue/referenceKind/requiredMargin/strikePrice；断言中枢 IV 不等于 rangeLo 时基准仍用中枢，SOTP 用基础档，零增长回退不伪造 intrinsicValue。身份测试包含 SATS 隔离、同发行人不同股类、缺 FIGI/CIK/CUSIP、ticker 复用。

  代表性断言（夹具固定中枢 100、零增长底 60；夹具直接构造 ValuationRun，不调用外部数据）：
  ```ts
  assert.equal(buildTrackingRecord(run, context).referenceValue, 100);
  assert.equal(buildTrackingRecord(run, context).referenceKind, "oe_dcf_neutral");
  assert.equal(parseTrackingRecord({ rangeLo: 60, marginPct: .5 }), null);
  ```
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx src/lib/securities/trackingIdentity.check.ts`；`npx --no-install tsx src/lib/valuation/trackingContract.check.ts`。Expected：缺少新接口/字段失败。
- [ ] **Step 3 — 实现。** 计算锚在原 verdict 分支产生，原数值断言不变；身份优先确认 FIGI，否则 SEC CIK＋证券类别/CUSIP，来源冲突返回 null。revisionId 为规范化内容 SHA-256，覆盖语义/来源日期和状态，不含 computedAt、publishedAt 等纯运行时字段；未变输入重跑不造新版本。同次输入必须构建全部三个 inputHashes，缺指纹不允许声称 price_only。
- [ ] **Step 4 — GREEN。** 上述两命令及原 `deriveValuationVerdict.check.ts`、`runValuation.check.ts` 通过；所有 null/NaN/币种不匹配都可解释，旧快照 parse 返回 null。
- [ ] **Step 5 — Commit.** `feat: define traceable valuation tracking records`。

## Task 3: 可比性与简短变化说明

**Files:** Create `web/src/lib/valuation/{trackingComparison.ts,trackingComparison.check.ts,trackingCopy.ts}`；Reuse `web/src/lib/valuation/valuationLabel.ts`、`web/src/lib/i18n/format.ts`；Validate with `web/scripts/lexicon.check.ts`。

**Interfaces:** Consumes TrackingRecord。Produces trackingComparison.ts 的 `compareTrackingRecords(baseline: TrackingRecord, latest: TrackingRecord): TrackingComparison`、trackingCopy.ts 的 `trackingChangeText(result: TrackingComparison, lang: Lang): string`。仅返回证据支持的分类，不请求 AI；面向用户写“内在价值/零增长参照”，不暴露内部中枢 IV 等代码术语。

- [ ] **Step 1 — RED tests。** 断言 `(80-100)/100=-20%` 的价值变化与价格变化分别计算；margin 从 .20 到 .30 为 `10` 个百分点；方法/身份/币种/股本口径变化输出 not_comparable；无可靠结果 zoneChange=null。相同所有非价格输入指纹、仅价格改变才是 price_only；多项变化为 multiple_inputs。

  ```ts
  assert.ok(Math.abs(compareTrackingRecords(base, latest).marginChangePp! - 10) < 1e-9);
  assert.equal(compareTrackingRecords(base, { ...latest, status: "pending" }).zoneChange, null);
  ```
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx src/lib/valuation/trackingComparison.check.ts`。Expected：新接口缺失失败。
- [ ] **Step 3 — 实现。** 异常/不可比优先，按设计 §8 归类；基准零分母返回 null。首期遇拆股/ADS 口径变化一律暂停比较并列原始结果，暂不实现历史自动换算；来源缺乏纠错证据时只写 result_updated，不编经营归因。
- [ ] **Step 4 — GREEN。** 同命令通过，增加“价格跌但价值跌更多”、显示精度内无变化、同值不同来源指纹、pending→valid 但无基准四种断言。
- [ ] **Step 5 — Commit.** `feat: explain comparable valuation changes`。

## Task 4: 增量发布存储与唯一读取入口

**Files:** Create `web/supabase/migrations/20261031_valuation_publication.sql`、`web/supabase/checks/valuation_publication.sql`、`web/scripts/tests/tracking-pg.sh`；Create `web/src/lib/valuation/{publishedRead.ts,publishedAdapter.ts,publishedRead.check.ts}`；Modify `web/scripts/valuation-ingest.ts`、`web/src/lib/valuation/valuationSnapshot.ts`、`web/src/lib/managers/db.ts`。

**Interfaces:** Produces `readPublicValuations(tickers: string[]): Promise<Map<string, PublishedValuation>>`（按 ticker 键控）、`readTrackingValuations(securityKeys: string[]): Promise<Map<string, TrackingRecord>>`（按冻结身份 key 键控）、`readValuationSafety(tickers: string[]): Promise<Map<string, SafetyState>>`。PublishedValuation 在 publishedRead.ts 中定义为 record＋同次 ValuationRun presentation；SafetyState 含 identityKey、invalid/pending 原因、observedAt。为现有列表保留兼容 reader 签名，但数值来自该入口。

- [ ] **Step 1 — RED tests。** 本地 PG 建 `tracking_securities`（身份 key 主键、当前 ticker 部分唯一索引）、`valuation_publication`（每身份一行 public_result、tracking_result、状态/代次/时间、安全状态）。验证 candidate 不能直接被 tracking reader 采用、无新契约不反推 IV、失效状态优先、超过 1,000 行正确分页；任务中断未更新安全行时，价格超过现有 10 日阈值/基本面过期仍会在读取时关闭机会提示。管理模块补 server-only 边界，脚本沿用现有 tsconfig 桩。
- [ ] **Step 2 — Run RED。** `bash web/scripts/tests/tracking-pg.sh publication`；`cd web && npx --no-install tsx --tsconfig scripts/tsconfig.json src/lib/valuation/publishedRead.check.ts`。Expected：缺表/接口导致失败；PG harness 仅创建本机临时库，auth schema 用测试桩，不连接生产。
- [ ] **Step 3 — 实现。** 原 valuation_snapshot 保留兼容，public_result 保存可公开渲染的候选完整结果，tracking_result 保存最近经确认的紧凑结果；二者可以在发布中暂不同代，日期/状态可见。readValuationVerdicts、readBargainVerdicts、readStrikeZoneLeaders、readValuationScreen、readConvictionScreen 的数字/总数/排序均从 public_result 及同一身份过滤取得，不能查询旧表计数再拼新值。读取时重新执行现有价格/基本面新鲜度和当前模型/身份/安全状态检查：不合格的 confirmed 结果从 latest map 排除，原因由 safety map 提供，不把旧不可变 record 改成相同 revisionId 的新状态。同步可信证券目录，包括身份已确认但无估值者；失败不能覆盖确认过的身份。只有后台可写发布状态；对无凭据/表未迁移明确降级。
- [ ] **Step 4 — GREEN。** 两命令通过；归档只保留当前两代 presentation，不形成每日全市场历史。更新目录、public_result 和独立 safety 的写入以受控事务/RPC 执行，版本 CAS 防覆盖，DB 不可用不得伪造空正常结果。
- [ ] **Step 5 — Commit.** `feat: separate public and confirmed valuation generations`。

## Task 5: 实际代次验证与失败重试

**Files:** Create `web/scripts/lib/{trackingPublication.ts,trackingPublication.check.ts}`、`web/scripts/valuation-publication-verify.ts`；Modify `web/scripts/lib/valuationPublication.ts`、`web/scripts/valuation-revalidate.ts`、`web/src/lib/revalidate/{targets,paths}.ts`、`web/src/app/api/revalidate/route.ts`、`.github/workflows/valuation.yml`。

**Interfaces:** Produces `publicationTargets(records: TrackingRecord[], context: PublicationContext): PublicationTarget[]`、`verifyPublishedPages(targets: PublicationTarget[], fetcher: typeof fetch): Promise<PublicationProof>`、`confirmTrackingPublication(db:SupabaseClient,proof:PublicationProof):Promise<{confirmed:number;pending:number}>`。trackingPublication.ts 定义 PublicationContext（origin、watchedSecurityKeys、前后两代路由成员关系）、PublicationTarget（url、language、expectedSourceDigest、每个 identityKey/revisionId 的 present/absent 期望）和 PublicationProof（verifiedAt、已验证 targets/标记及对应代次），不含凭据。聚合页 source digest 由同次实际渲染使用的完整估值输入计算，而非另查一次最新表。

- [ ] **Step 1 — RED tests。** revalidate 200 但 HTML 旧版本→不确认；仅一个语言更新、投资人页仍旧、第二代并发写入、重复重试、探测超时→保留 pending；CAS 仅确认实际验证过的版本。另测进入/离开筛选条件与分页边界：被移出的行应以新 source digest＋实际行缺席证明，不能因找不到行标记永远 pending，也不能忽略旧页仍保留该行。

  ```ts
  // targets 期望 R2，fetcher 返回实际数字容器标记 R1。
  await assert.rejects(verifyPublishedPages(targets, fetcher), /revision/i);
  assert.equal((await readTrackingValuations(["test-security"])).get("test-security")?.revisionId, "R0");
  ```
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx --tsconfig scripts/tsconfig.json scripts/lib/trackingPublication.check.ts`。Expected：接口不存在或错误地仅以 200 确认而失败。
- [ ] **Step 3 — 实现。** 发布先写 public_result，调用已有授权刷新；workflow 脚本使用普通公开 URL GET 读取 Task 6 的标记，不能用返回相同数据库结果的“验收 API”替代实际页面。targets 覆盖双语个股、首页、列表/筛选/共识/投资人的前后两代受影响路径并集，按实际页码/视图判断应存在还是应移除，移除用 digest＋absence 验证。只对待首次确认或已被关注的证券建立个人发布 proof；未关注证券沿原公开更新节奏。初始验收用显式 seed 证券集，后续 Task 7 提供关注集合；关注后尚无有效 confirmed 结果则返回 publication_pending，不临时重算。URL 先去重再并发 3 个探测，4 次上限重试，15 秒请求超时；当批不能完成时保留明确日期的上次结果和队列，不把每日全市场预热作为免费层前提。测试环境由明确 origin 注入，禁止预览批次写生产。
- [ ] **Step 4 — GREEN。** 同命令和原 valuationPublication.check.ts 通过；确认事务同时写 tracking_result，并调用 Task 8 的 pending 基准补齐函数。Task 8 尚未部署时该调用为版本化的可选后置 hook，账户功能仍关闭；不能通过 hook 缺失丢掉发布意图。
- [ ] **Step 5 — Commit.** `feat: verify rendered valuation generations before tracking publication`。

## Task 6: 公开页面使用同代结果并防止陈旧安全提示

**Files:** Create `web/src/components/valuation/{PublishedValuationBoundary.tsx,publicationMarkers.tsx}`、`web/src/app/api/valuation/state/route.ts`、`web/scripts/tests/valuation-generation.ts`；Modify `web/src/app/[lang]/stocks/[ticker]/page.tsx`、`web/src/lib/valuation/valuationSnapshot.ts`、`web/src/components/valuation/{EarningsPowerFloorCard,ValuationBadge}.tsx`、`web/src/components/home/StrikeLeadersCard.tsx`、`web/src/app/[lang]/stocks/{StocksTable.tsx,screener/ScreenerTable.tsx}`、`web/src/app/[lang]/investors/{[slug]/page.tsx,consensus/page.tsx,_movesPage.tsx}`、`web/src/components/investor/InvestorHoldingsTable.tsx`。

**Interfaces:** Consumes readPublicValuations/readValuationSafety。Produces `<PublishedValuationBoundary records: PublishedValuation[] lang: Lang>`、`<ValuationPublicationMarker identityKey revisionId>` 与 `valuationSourceDigest(records:PublishedValuation[]):string`；聚合块在由相同 records 派生的实际行/计数旁渲染 source digest。`GET /api/valuation/state?tickers=...` 批量返回公开版本及安全状态，最多 100 ticker，请求无用户 cookies，响应 no-store、不设置 cookie。

- [ ] **Step 1 — RED integration test。** 对生成的中英文真实页面断言实际渲染数字的容器 `data-valuation-identity`、`data-valuation-revision` 与 Task 5 期望匹配；不能只在 head 放新版本而 body 仍旧。模拟失效/网络失败/恢复可见，绿色击球区提示应关闭或标待核实。
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx scripts/tests/valuation-generation.ts --origin http://localhost:3000`（本地 Next server＋测试数据）。Expected：旧页面缺实际代次标记或仍独立计算而失败。
- [ ] **Step 3 — 实现。** 个股估值区域使用 PublishedValuation.presentation，移除其独立作为权威的 runValuation 路径；现有业务质量/13F 区域保留。所有 badge/行/结论标记绑定实际记录；API 返回可信状态并关闭旧提示。静态 SSR 的便宜/击球区强调默认待客户端校验，首次可见、恢复可见和网络恢复时按页面批量核对；失败保留带日期历史数字，不能继续称已确认当前机会。不做逐行轮询，不降低全站 ISR 周期。
- [ ] **Step 4 — GREEN。** 集成测试通过；`npm run check:isr`、`npm run check:revalidate-paths`、现有估值组件检查与 `npm run build` 通过。Task 5 验证完才推进 tracking_result；公共新代与个人旧代过渡期明确发布中，不能生成新比较事件。
- [ ] **Step 5 — Commit.** `feat: render shared valuation generations across public research`。分组 A 在账户开关关闭情况下独立验收数值等价与请求预算。

## Task 7: 个人表、RLS、原子关注与撤销

**Files:** Create `web/supabase/migrations/20261031_account_tracking.sql`、`web/supabase/checks/account_tracking.sql`；Modify `web/scripts/tests/tracking-pg.sh`；Create `web/src/lib/tracking/types.ts`。

**Interfaces:** Produces user_watchlist、valuation_baselines 以及用户会话调用的 RPC：`follow_security(p_ticker text)`、`unfollow_security(p_security_key text)`、`undo_unfollow(p_security_key text)`、`read_my_tracking(p_cursor jsonb default null,p_limit int default 50)`；均不接受 user_id/估值数字。定义 `RawWatchlistItem = Omit<WatchlistItem,"comparison">`，read_my_tracking 返回该原始资料和游标；Task 8 组装 comparison。后台 `read_active_tracking_keys()` 仅 service_role 执行，供 Task 5 读取去重的当前关注集合。

- [ ] **Step 1 — RED SQL tests。** 建 auth.users/auth.sessions/auth.uid/auth.jwt 最小测试桩，切 anon/authenticated/service_role，验证 A 无法读写 B、直接写 baseline_id 被拒、两个同票并发关注只一行且基准不变、ticker 复用拒绝、删除 Auth 用户后仍未过期 JWT 被拒。

  SQL 验证必须包含真实 role 切换下的断言，而非仅管理员查询：
  ```sql
  set local role authenticated;
  -- 夹具 JWT sub=A、session_id=A_session。
  select follow_security('TEST');
  -- 管理视角检查 A 仅一条、B 原记录不变；删 A 的 auth.sessions 后相同 JWT 调用须失败。
  ```
- [ ] **Step 2 — Run RED。** `bash web/scripts/tests/tracking-pg.sh accounts`。Expected：表/RPC 缺失失败，不能以字符串检查 SQL 替代实际 PG 权限测试。
- [ ] **Step 3 — 实现。** user_watchlist 主键 `(user_id,security_key)`，user_id FK auth.users ON DELETE CASCADE；valuation_baselines 按 revisionId 去重，服务端固定内容。个人表仅 SELECT owner，直接 INSERT/UPDATE/DELETE 撤权，通过锁定 search_path 的 RPC 写入；每个 RPC 先验证 auth.uid 和 private.current_account_active()（检查 auth.users 与 JWT session_id 对应的 auth.sessions），不能信任仅签名仍有效的旧 JWT。目录/发布/基准不向 anon 开放；基准通过限于本人引用的 RPC 返回。
- [ ] **Step 4 — GREEN。** SQL tests 通过。取消关注使用 10 分钟软删除撤销窗口：期间保留引用，undo 恢复原时间/基准；到期重新关注新建基准并明确反馈。锁按 security_key→user_id 固定顺序，目录、已确认版本、归档基准与引用在同一事务；未知身份拒绝、已知身份无可靠结果允许 pending。
- [ ] **Step 5 — Commit.** `feat: isolate personal tracking with transactional RLS operations`。

## Task 8: 首次基准补齐、清理与私有 API

**Files:** Modify `web/supabase/migrations/20261031_account_tracking.sql`、`web/supabase/checks/account_tracking.sql`、`web/scripts/lib/trackingPublication.ts`；Create `web/src/lib/tracking/{repository.ts,request.ts,repository.check.ts}`。API route 由 Task 9 在会话入口存在后创建。

**Interfaces:** Produces `listTracking(client:SupabaseClient,cursor:string|null):Promise<WatchlistPage>`、`followSecurity(client:SupabaseClient,ticker:string):Promise<WatchlistItem>`、`removeTracking(client:SupabaseClient,key:string):Promise<void>`、`undoTracking(client:SupabaseClient,key:string):Promise<WatchlistItem>`；WatchlistPage 为 `{items:WatchlistItem[];nextCursor:string|null}`，cursor 是 `(followed_at,security_key)` 的验证编码。request.ts 定义 `validateMutationRequest(request:Request):void`（POST/DELETE、同源 Origin 与 JSON 大小限制）。SQL 后台 hook `attach_first_tracking_baselines(p_security_key text,p_revision_id text)` 与 `gc_tracking_baselines(p_before timestamptz)` 仅 service_role 执行。

- [ ] **Step 1 — RED tests。** 无估值关注在第一次可靠确认时补基准、第二次不覆盖；publish/关注/取消/undo/GC 并发保证引用有效；路径 key 编码、非法 cursor、伪造 user_id、跨站 Origin、同页超过 50 条分页无遗漏。
- [ ] **Step 2 — Run RED。** `bash web/scripts/tests/tracking-pg.sh accounts`；`cd web && npx --no-install tsx --tsconfig scripts/tsconfig.json src/lib/tracking/repository.check.ts`。Expected：缺后置 hook/API 行为失败。
- [ ] **Step 3 — 实现。** repository 仅以注入的用户 client 调用 RPC，组装本人列表＋compareTrackingRecords；最新结果以冻结的 securityKey 关联，不只凭 ticker，身份不再当前或最新 safety 不合格时 latest=null 并解释原因，不能把新发行人的数字放到旧关注下或把失效视为离开击球区。request.ts 校验请求/游标/body，不接受 owner/估值字段。错误映射区分未登录、跨站、身份/数据冲突和暂时不可用。hook 与版本确认同事务，首次有效来源按服务器发布时间记录。GC 保留软删除窗口引用，按外键＋行锁清理无引用基准，不先查再无保护删除。此任务不引入未实现的认证 import。
- [ ] **Step 4 — GREEN。** 两命令通过，数据库异常不返回正常空列表或成功。当前 user 被删除或 session 失效时所有 API/RPC 均拒绝，不能重新插入个人行。
- [ ] **Step 5 — Commit.** `feat: serve reliable personal tracking and baseline lifecycle`。

## Task 9: 请求级会话、私有 API、回调与限定刷新范围

**Files:** Create `web/src/lib/auth/{browser.ts,server.ts,session.ts,redirect.ts,session.check.ts}`、`web/src/proxy.ts`、`web/src/app/api/auth/callback/route.ts`、`web/src/app/api/my/session/route.ts`、`web/src/app/api/my/{tracking/route.ts,tracking/[securityKey]/route.ts,tracking/[securityKey]/undo/route.ts}`；Modify `web/scripts/isr-budget.check.ts`；Create `web/scripts/tests/auth-isr-boundary.ts`。

**Interfaces:** Produces `getBrowserAuthClient():SupabaseClient`、`createUserSupabaseClient():Promise<SupabaseClient>`、`requireAccountUser(): Promise<VerifiedAccount>`、`safeReturnPath(raw:string|null,lang:Lang):string`；VerifiedAccount 在 session.ts 定义 userId、email、sessionId、已验证 claims（至少 sub/iss/aud/role/exp/session_id 与可空 amr）。createUserSupabaseClient 每请求新建；管理客户端仍只做后台任务。

- [ ] **Step 1 — RED tests。** 两个并发用户的 cookies 不串；伪造 getSession.user、错误 issuer/audience、过期/撤销会话拒绝；URL `//evil`、编码 slash/backslash、控制字符、回调循环均拒绝；普通公开 URL 不匹配 proxy。

  ```ts
  assert.equal(safeReturnPath("//evil.example/", "zh"), "/zh/my");
  assert.equal(safeReturnPath("/%2f%2fevil.example", "en"), "/my");
  ```
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx --tsconfig scripts/tsconfig.json src/lib/auth/session.check.ts`；`npx --no-install tsx scripts/tests/auth-isr-boundary.ts`。Expected：缺会话入口或预算脚本仍 blanket ban proxy 导致失败。
- [ ] **Step 3 — 实现。** 当前用户使用 getClaims 验签＋getUser/active-session 检查，callback 以 PKCE code exchange 写 cookie；公开/中文私有地址通过 localePath 构建。私有 GET 调 Task 8 listTracking，POST 仅 ticker 调 followSecurity，DELETE/POST undo 调对应接口；每条路由都 requireAccountUser 和变更请求校验，返回 401/403/409/503，所有响应 private/no-store。proxy matcher 精确为 `/my/:path*`、`/zh/my/:path*`、`/account/:path*`、`/zh/account/:path*`、`/api/my/:path*`、`/api/auth/:path*`，不匹配 login、stocks、investors、learn、ingest。预算检查只允许该精确 matcher，继续禁止其他全站 middleware/proxy；cookie/cache 头沿官方 setAll 方式传递。
- [ ] **Step 4 — GREEN。** 两命令、`npm run check:isr` 通过；公开页面构建仍为既有缓存类型，新增私有页面动态。Supabase callback 与本站 `/api/auth/callback` 分别列入 operations，不把它们配置成同一地址。
- [ ] **Step 5 — Commit.** `feat: add isolated Supabase account sessions`。

## Task 10: Google＋邮箱验证码登录与待完成关注

**Files:** Create `web/src/components/account/{LoginForm.tsx,LoginResult.tsx}`、`web/src/lib/auth/{intent.ts,intent.check.ts,loginFlow.ts,loginFlow.check.ts}`；Create `web/src/app/[lang]/login/{page.tsx,loading.tsx}`；Modify `web/docs/account-tracking-operations.md` 的浏览器登录用例。

**Interfaces:** Produces `saveFollowIntent({ticker,returnPath,lang}):void`、`consumeFollowIntent(now:number):FollowIntent|null`、`completeFollowIntent(intent, followSecurity):Promise<IntentResult>`；FollowIntent 在 intent.ts 定义随机 id、ticker、站内路径、lang、createdAt，无用户/邮箱/token/估值字段。consume 只取得有效意图并锁定当前动作，成功后由 complete 清除，失败解除锁且保留可重试意图；有效期 15 分钟，最多一个待完成动作。loginFlow.ts 定义 `LoginState`（email/code/submitting/authenticated/error）与 `transitionLogin(state:LoginState,event:LoginEvent):LoginState`，LoginEvent 为对应 SDK 成功/错误/取消/超时事件联合；组件据该状态显示反馈。

- [ ] **Step 1 — RED tests。** Google 取消、错误/过期/重发验证码、错误 anon key、邮件限流、OAuth 返回不带 intent、过期 intent、账号切换、保存失败重试和两个组件重复消费；确认无成功保存就不能清除待完成操作或显示成功。
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx src/lib/auth/intent.check.ts`；`npx --no-install tsx src/lib/auth/loginFlow.check.ts`。Expected：缺状态转换/动作恢复导致失败；SDK 注入的错误夹具只验证状态和调用顺序，不计为真实认证通过。
- [ ] **Step 3 — 实现。** Google 调官方 signInWithOAuth＋PKCE；邮箱 signInWithOtp/verifyOtp；只有验证成功才视为注册/登录成功。OTP 建议配置 10 分钟有效、60 秒重发间隔，服务端官方限制/CAPTCHA 生效，UI 倒计时不充当安全限制。intent 放当前 tab 的 sessionStorage，页面进入后先经私有 session endpoint 确认用户，再执行幂等 follow；原路返回并清理成功意图，主动登录无意图到 /my。仅将有限错误码带回页面，禁止把 code/token/email 写进返回 URL 或分析事件。
- [ ] **Step 4 — GREEN。** intent 和 loginFlow 检查通过；用现有浏览器工具查看本地 `/login`、`/zh/login` 的键盘焦点、错误/重试和小屏；Google 和邮箱两个入口均实际存在且受同一开关控制。完整真实登录留 Task 14，未配置时不假装点击按钮等于认证通过。
- [ ] **Step 5 — Commit.** `feat: support Google and email-code account access`。

## Task 11: 退出、删除账户与营销偏好边界

**Files:** Create `web/src/lib/auth/{recentAuth.ts,recentAuth.check.ts}`、`web/src/components/account/AccountSettings.tsx`、`web/src/app/[lang]/account/page.tsx`、`web/src/app/api/my/account/{logout/route.ts,delete/route.ts}`；Modify `web/src/app/[lang]/privacy/page.tsx`、`web/docs/account-tracking-operations.md`。

**Interfaces:** Produces `requireRecentOtp(claims: VerifiedAccount["claims"],nowSeconds:number):boolean`；删除使用绑定邮箱重新 OTP 验证，要求已验证 amr.method=otp 且 timestamp 在 5 分钟内，sub 与当前目标账户一致；不以 token iat/refresh 时间为凭证。

- [ ] **Step 1 — RED tests。** “仅刷新 token 的旧登录”不能删除；重新验证到另一 UUID 不能删除原账户；管理员删除失败不可显示已删除；删账户后旧 JWT 的 GET/POST/RPC 均拒绝。退出清本地缓存且撤销相应 session；刷新不能复活。

  ```ts
  // amr 中 otp 已是 301 秒前，即使 token iat 是当前时刻仍拒绝。
  assert.equal(requireRecentOtp(claims, nowSeconds), false);
  assert.equal(requireRecentOtp(freshOtpClaims, nowSeconds), true);
  ```
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx src/lib/auth/recentAuth.check.ts`；`bash web/scripts/tests/tracking-pg.sh accounts`。Expected：近期凭证检查或旧 JWT 权限断言失败。
- [ ] **Step 3 — 实现。** 用户确认后服务端仅操作当前验证 UUID，重新验证前后 sub 变化即清除删除意图，使用 admin.deleteUser 硬删除与外键级联；失败保留账户。成功清 cookie/客户端状态；旧 access token 本身仍可能有效，Task 7 的 active-session 检查负责应用访问立即失效。普通退出采用 `signOut({scope:"local"})` 仅退出当前设备，删除账户撤销全部会话。账户页只展示当前身份/关联方式，不提供不同邮箱合并；营销订阅保持独立，提供现有邮件中的退订方式与现有 newsletter 入口，不创建一个无后台支持的开关。
- [ ] **Step 4 — GREEN。** 两命令通过，用现有浏览器工具核对取消/确认/失败状态；Google 注册用户的同邮箱 OTP 删除在 Task 14 真实验收；取消删除不丢数据，删除别人的账户请求无法构造。
- [ ] **Step 5 — Commit.** `feat: complete account logout and verified deletion`。

## Task 12: 全站共享关注状态与轻量入口

**Files:** Create `web/src/components/tracking/{TrackingProvider.tsx,FollowButton.tsx,trackingStore.ts,trackingStore.check.ts}`、`web/src/components/account/AccountNav.tsx`；Modify `web/src/components/shell/{AppShell,TopNav,MobileDrawer}.tsx`、`web/src/app/[lang]/stocks/{StocksTable.tsx,[ticker]/page.tsx,screener/ScreenerTable.tsx}`、`web/src/app/[lang]/investors/{[slug]/page.tsx,consensus/page.tsx,_movesPage.tsx}`、`web/src/components/home/StrikeLeadersCard.tsx`；沿现有文章/报告证券链接进入个股，不解析正文。

**Interfaces:** Produces `useTracking():{statusFor(key:string):FollowState;follow(ticker:string):Promise<void>;remove(key:string):Promise<void>;reset():void}`；FollowState 在 tracking/types.ts 定义 idle/loading/followed/pending/error。provider 不在 server root 读取 cookies，登录后批量加载当前页所需/个人分页状态；缓存键包含验证 user UUID。

- [ ] **Step 1 — RED tests。** 同一证券多处按钮仅一请求，添加失败回滚，A→B 切换清除关注、延迟的 A 响应不能写进 B store；跨 tab 只广播“重读”信号、不广播用户资料；无唯一身份按钮给原因而非错误归档。
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx src/components/tracking/trackingStore.check.ts`；本地浏览器账户流程检查。Expected：共享状态/请求代次隔离缺失失败。
- [ ] **Step 3 — 实现。** 未登录点击走 Task 10；已登录调用私有 API并等待服务器确认。状态更新同步当前浏览器及同源 tabs，其他设备重新读取可见。关注按钮不占整行主导航点击，触摸/键盘有标签和焦点。公开列表排序、13F 文案、无证券上下文的信息页保持原职责，文章证券链接通向已集成个股页。
- [ ] **Step 4 — GREEN。** store 检查与中英文：首页→筛选→投资人持仓→个股→个人页，同票状态一致；执行 `npm run check:isr` 与 `npx --no-install tsc --noEmit`。禁止一行一个状态请求或全站请求 proxy。
- [ ] **Step 5 — Commit.** `feat: connect valuation tracking across research pages`。

## Task 13: 个人列表、个股对照与最小统计

**Files:** Create `web/src/app/[lang]/my/{page,loading,error}.tsx`、`web/src/components/tracking/{TrackingList,TrackingComparisonPanel}.tsx`、`web/src/components/tracking/TrackingComparisonPanel.check.tsx`；Modify `web/src/app/[lang]/stocks/[ticker]/page.tsx`、`web/src/lib/analytics/track.ts`、`web/docs/account-tracking-operations.md`。

**Interfaces:** Consumes WatchlistPage/TrackingComparison 与现有格式化函数。Produces 个人页面和可复用 `<TrackingComparisonPanel item:WatchlistItem lang:Lang>`；全站同一数据，不把 public_result 发布中候选当个人最新。

- [ ] **Step 1 — RED component scenarios。** 通过现有 React renderToStaticMarkup 约定检查缺值、价格跌但价值跌更多、方法改变、首次可用基准、失效时的数字/日期/状态语义。空列表、50 条分页、长名称、离线与恢复、取消/10 分钟内撤销列为浏览器实际用例；手机与桌面均可打开依据而无需记住前一页数字。
- [ ] **Step 2 — Run RED。** `cd web && npx --no-install tsx --tsconfig scripts/tsconfig.json src/components/tracking/TrackingComparisonPanel.check.tsx`。Expected：缺对照组件或把不可比结果渲染成变化而失败。
- [ ] **Step 3 — 实现。** 按 followedAt 倒序＋securityKey 稳定次序，主要列为公司/内在价值/估值采用价格/安全边际/击球区状态，单条变化与日期；展开后展示两时点值、锚、来源、不可比较原因。复用现有纯格式/文案，不新增评分、图表和筛选器。后台失败展示可重试状态，不能显示“你还没有关注”。
- [ ] **Step 4 — 加最小事件并 GREEN。** 仅经现有 track 发 `account_login_success`、`valuation_follow_success`、`tracking_return`、`valuation_comparison_open`，在服务器确认/真实页面操作后；表单禁自动采集敏感输入，首期不调用 posthog.identify、不承诺跨设备留存统计，公开报表口径按浏览器标识。事件无邮箱、token、证券名单或 OAuth query。组件检查通过，用浏览器工具执行本任务实际用例；`npm run lint`、`npm run build` 与既有文案/格式检查通过。
- [ ] **Step 5 — Commit.** `feat: deliver concise personal valuation comparisons`。

## Task 14: 权限/配置、私有备份、真实双登录验收与上线

**Files:** Create `web/scripts/account-preflight.ts`、`web/scripts/account-backup.ts`、`web/scripts/tests/account-recovery.ts`；Modify `web/docs/account-tracking-operations.md`、`web/src/app/[lang]/privacy/page.tsx`（依最终实际数据处理更新）；需要的新环境变量只写名称/样例，不写真实值。

**Interfaces:** `account-preflight.ts --mode read-only` 只输出脱敏配置/权限/配额核对结果；`account-backup.ts --destination <private-local-path>` 通过既有管理员入口导出必要个人表和基准/发布关联，输出目录仅用户可读，真实密钥从受控环境读取。备份不放仓库、Library 或公开 Actions artifacts。

- [ ] **Step 1 — 准备可评审的操作清单。** 列新增迁移、现有表/view/RPC 的 anon/authenticated 授权收紧、正确公开 key、Node22部署运行时、Google OAuth应用/受众/生产状态/双回调、Resend SMTP域名、邮件模板/10分钟OTP/60秒重发、CAPTCHA/官方限流、私有备份与容量。先 read-only 检查，迁移/配置/付费/合并仍按执行时明确授权处理；不能自动购买服务或把测试凭据写入公开文档。
- [ ] **Step 2 — 恢复测试。** 在本机隔离 PG 导出→还原两用户关注、共享/各自基准、pending 与撤销状态；`cd web && npx --no-install tsx scripts/tests/account-recovery.ts --fixture` Expected：引用/owner完整且 RLS 仍隔离。首期备份支持在同一个仍有效的托管 Auth 项目中恢复个人数据：先核对现有 Auth UUID，仅恢复仍存在且未删除用户的引用，已删除者剔除；不保存密码或 refresh token，不把个人表导出称为完整 Auth 灾难备份。每日私有导出，保留 7 日并轮换；实际备份位置由用户现有私有存储确定、记录恢复证据后才开功能，禁止未经确认把身份映射迁往新项目。
- [ ] **Step 3 — 真实登录验收。** 用现有浏览器工具在非生产测试环境及用户明确指定的验收邮箱/Google账号逐项执行：Google首次/再次、邮箱首次/再次、两种顺序同邮箱关联、不同邮箱隔离、取消/过期/重发、刷新/退出、跨设备、关注原路恢复、删除后旧JWT拒绝。每项在 operations 记录时间、部署提交、预期/实际结果和脱敏证据；交互授权由用户亲自完成，工具不索取/记录密码；未经指定不发送测试邮件。
- [ ] **Step 4 — 发布演练。** 在目标部署读取实际中英文页面验证 Task 5 proof；故意让一个公开页面旧代/返回500，tracking_result 不推进；恢复后只确认当前代。核对公开 GET 不写 cookie、私有不缓存、根布局仍缓存，以及状态请求/发布刷新没有退回全站频繁重生成。
- [ ] **Step 5 — 最终验收与渐进开放。** 所有设计 §10 场景逐项附脱敏证据；两种真实登录任一未通过则首期仍未完成，不先删掉该入口交付。read-only preflight 通过、容量/免费额度已核实、备份恢复可用后，再在获授权目标部署设置账户开关并验证真实流程；回滚为关闭开关并保留个人数据/不可变基准，不删表。
- [ ] **Step 6 — Commit/PR.** `docs: record account tracking release and recovery evidence`。代码 review 通过后自动推送/创建对应 PR，报告检查结果；不自动合并。

## 计划自检与交接

- 设计覆盖：§1–3→Task1/9/10/14；§4→Task10–13；§5→Task7–9/11/14；§6→Task2–6；§7→Task7/8；§8→Task3/13；§9→Task12–14；§10→全部验收。无未归属产品要求。
- 依赖顺序：Task8 仅提供注入用户 client 的 repository/请求校验，可在 Task9 前独立测试；实际 route 在 Task9 同 requireAccountUser 一起创建，无悬空认证 import。Task5 的首次基准 hook/真实关注集合在 Task7/8 后接入，之前用显式 seed 验证公共发布。
- 本轮仅计划与设计状态更新；没有执行上面的安装、测试、迁移、配置或真实登录。执行方式尚待用户选择，所有任务保持未勾选。
- 推荐 subagent-driven：共享估值发布、数据库事务/RLS和两条登录链的故障代价较高，适合按任务独立审查；若选择本人顺序实施，也须保留同样测试与最终独立 review。

依据：代码基线 a6843f4；2026-10-31 只读查询 `npm view @supabase/ssr@0.12.7 peerDependencies` 与 `npm view @supabase/supabase-js@2.114.0 engines`；[官方 JWT/AMR 说明](https://supabase.com/docs/guides/auth/jwt-fields)、[删除用户与存量 JWT 边界](https://supabase.com/docs/guides/auth/managing-user-data)、其余官方来源见已批准设计 §12。执行时重新核实外部数据与依赖。
