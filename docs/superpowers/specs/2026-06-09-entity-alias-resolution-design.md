# 实体别名解析层 / Entity Alias Resolution 设计

> 状态：设计已与用户分段确认（2026-06-09），待用户审阅 spec 后转 writing-plans。
> 所属规划 thread：Compounder 产品长期规划。
> 分支：`feat/entity-alias-resolution`（worktree `.claude/worktrees/entity-alias`，基于 origin/db-foundation 最新）。
> 相关记忆：[[product-direction]]、[[data-layer-state]]、[[seo-english-first]]、[[promotion-and-compliance]]。

## 1. 背景与目标

诊断（2026-06-09 实时检索）发现一类**发现性**问题——「一个实体，许多名字」：
- 投资人页 URL 以**基金 slug**（`berkshire-hathaway`）为锚，但用户/AI 搜的是**人名**（`warren buffett`）、**接班人**（`greg abel`）、**票代**（`BRK`）、**中文**（`巴菲特/阿贝尔`）。`/investors/warren-buffett` 直接 **404**。
- 个股同理（更开放）：`AAPL` ↔ `Apple` ↔ `苹果`；改名实体（Facebook→META、Google→Alphabet）。
- 内部链接：13F 的 issuer 字符串（"ALPHABET INC"）对不上我们的个股页（GOOGL）。

当前站**没有任何重定向机制**（`urls.ts` 的 `legacyRedirect` 仅有定义、无调用；无 `middleware.ts`），别名一律 404。

**目标**：建一个**统一的实体别名解析层**——任意合理的别名落到唯一 canonical 页（301），并让页面把所有别名外露给搜索/AI 匹配。一处解析、多处复用，且对投资人/个股/将来宏观通用。

**核心原则（与用户确认）**：
- **别名 301 → canonical（方案 A）**：唯一能扩展到成百上千个股的方式；信号汇聚、消灭 404、避免重复内容。
- **不靠开放式 hardcode**：派生别名从**权威数据自动生成**；只有"有限集"（34 投资人）用 config 策划。
- **数据归宿规则**：**人工策划别名 → config（repo，可版本审计）**；**自动派生别名 → storage（Supabase）+ 静态 emit**（与 managers/holdings 现有双写一致）；二者在读取/构建期合并进同一 `aliasIndex`。

## 2. 范围

### 2.1 v1 纳入
- 统一解析核心：`aliasIndex` + `resolveEntity(type, rawSlug)`。
- **投资人别名**：`config/managers.json` 加策划字段（人名含接班人/票代/中英）+ **EDGAR `formerNames` 自动**（基金曾用名，ingest 已抓 submissions）。
- **个股别名**：从**证券脊梁**自动派生（`name ↔ ticker ↔ cusip`，Tier 1，零 hardcode）。
- 三个消费点：①入站 301 重定向 ②页面结构化数据 `alternateName` ③内部 issuer→个股链接（CUSIP join）。

### 2.2 明确不做（v1）—— 守住范围
- **Wikidata（Tier 2）**：个股**中文名/曾用名**、人↔基金自动关联，留作后续"生产者"接同一 `aliasIndex`，**架构已预留，本期不建那条流水线**。
- LLM 生成别名、搜索框/自动补全、模糊匹配。
- 把任何 canonical URL 改成人名（保持基金 slug 为 canonical，避免迁移成本与多人歧义）。

## 3. 架构

### 3.1 核心
```
type EntityType = "investor" | "stock";          // 预留 "macro"
aliasIndex: Record<EntityType, Map<string, AliasTarget>>
type AliasTarget = { canonicalSlug: string; confidence: "high" | "loose" };
resolveEntity(type, rawSlug): { canonicalSlug } | null
```
- **type 命名空间隔离**：`/investors/{x}` 只在投资人别名里解析、`/stocks/{x}` 只在个股里——**URL 的 section 天然消歧**，`brk` 在两侧各自命中而不冲突。
- 运行时永远是查 Map，**复杂度全在构建期的数据聚合**。

### 3.2 归一化
`normalize(s)` = 去首尾空白 → 小写 → 去标点/空格/点（`BRK.B`→`brkb`、`Warren Buffett`→`warrenbuffett`、`苹果公司`→`苹果公司`）。查询与存储两侧用同一函数，保证对齐。中文不拆分、不转拼音（v1）。

### 3.3 可信度分档（为 Tier 2 预留安全闸）
- **high**：可触发 **301 重定向**。来源 = canonical slug 本身、票代、CUSIP、config 策划别名、EDGAR formerNames、脊梁官方名。
- **loose**：**只**进结构化数据 `alternateName`，**不**触发跳转。v1 暂无 loose 来源（全 high）；该字段为接 Wikidata 时的护栏，**避免脏别名造成错误重定向**。

## 4. 数据来源与归宿

### 4.1 投资人 · 人工策划（config）
扩 `config/managers.json` 每条（现仅 `{cik, slug, person}`）：
```jsonc
{
  "cik": "0001067983",
  "slug": "berkshire-hathaway",
  "person": "Warren Buffett",
  "people": [
    { "name": "Warren Buffett", "zh": "巴菲特" },
    { "name": "Greg Abel", "zh": "阿贝尔", "role": "CEO" },
    { "name": "Charlie Munger", "zh": "芒格" }
  ],
  "aliases": ["BRK", "BRK.A", "BRK.B", "伯克希尔", "伯克希尔哈撒韦"]
}
```
- `people[].name/zh` 与 `aliases[]` 全部归一化后映射到该 `slug`，confidence=high。
- `person` 字段保留兼容现有页面。

### 4.2 投资人 · 自动（EDGAR formerNames）
ingest 抓 submissions 时一并取 `formerNames`（基金曾用名），写入 manager 记录 → emit 到静态别名 + Supabase。confidence=high。

### 4.3 个股 · 自动（证券脊梁）
从脊梁的 `ticker / issuer name / cusip` 派生：`normalize(name)→ticker`、`ticker→ticker`、`cusip→ticker`，confidence=high。**零 hardcode**。

### 4.4 合并
读取/构建期把「config 策划」+「派生（DB 或 JSON 回退）」合并成 `aliasIndex`——与 `assembleManagerDetail` 把 DB/JSON 合成 detail 同一套路。**有库/无库两环境都能解析**（config 天然在两环境都有；派生别名走与 holdings 相同的双写回退）。

## 5. 三个消费点

### 5.1 入站 301 重定向（消灭 404、捕获深链/人打的 URL）
机制（**page 级**，避免引入 middleware；与现有 ISR/动态路由兼容）：
- 在 `/[lang]/investors/[slug]/page.tsx` 与 `/[lang]/stocks/[ticker]/page.tsx` 里，**在 `notFound()` 之前**插入：先按原 slug 查数据；查不到 → `resolveEntity(type, slug)`；命中（且 ≠ 当前 slug）→ `permanentRedirect(canonicalUrl(lang))`（next/navigation 的 308 永久跳转，SEO 等价 301）；仍无 → `notFound()`。
- 别名 slug 不进 `generateStaticParams` → 动态渲染时解析跳转，开销可忽略。
- **保留** `generateStaticParams` 仅含真实 canonical slug（sitemap 不变）。

### 5.2 页面身份外露（让搜索/AI 匹配到所有名字）
- 投资人页：结构化数据补 `alternateName`（人名/中英/票代/曾用名），`Person` schema 已存在可扩 `sameAs`/多人。
- 个股页：补 `alternateName`（公司名/票代/CUSIP；中文名待 Tier 2）。
- 仅用 confidence ∈ {high, loose} 的别名；纯事实，无合规问题。

### 5.3 内部 issuer→个股链接（CUSIP join）
- 13F holdings 行带 `cusip`，脊梁有 `cusip→ticker`。投资人页持仓表的 issuer **经 `resolveEntity('stock', cusip)` 链到 `/stocks/{ticker}`**，修掉"issuer 字符串对不上个股页"的内链断裂。零名字匹配、零 hardcode。

## 6. 边界与冲突规则
- **别名撞已有 canonical**：canonical 永远赢，不重定向真实页。
- **别名映射到多个 canonical（歧义）**：**不**重定向（记日志跳过），宁可 404 也不错跳。
- **自指**（alias == canonical）：no-op。
- **跳转环**：解析只做一跳（alias→canonical），canonical 本身必是真实页，不会再跳。
- **大小写/标点/空格**变体由 `normalize` 归并；中文原样。

## 7. 验收标准
1. `/investors/warren-buffett`、`/investors/greg-abel`、`/investors/brk`、`/investors/巴菲特` 均 **308→** `/investors/berkshire-hathaway`（中英各 lang 前缀）。
2. `/stocks/apple`（或脊梁中 name 命中者）→ 对应 ticker 个股页；`/stocks/{cusip}` 同样解析。
3. 未命中任何别名的乱 slug 仍正常 `notFound()`（404），不误跳。
4. 投资人页/个股页结构化数据含 `alternateName`（含人名/票代/曾用名）。
5. 投资人持仓表 issuer 链接经 CUSIP 指向正确个股页。
6. 别名撞 canonical / 歧义 / 自指 三类边界不报错、不错跳（按 §6）。
7. 有 Supabase / 无库回退两环境，`resolveEntity` 都能解析（config 别名两环境可用；派生别名各走其路径）。
8. `config/managers.json` 加 `people`/`aliases` 字段后，现有读取（getManagerIndex/Detail）不回归。
9. confidence=high 才触发重定向；loose（v1 无）只进结构化数据。

## 8. 风险与备注
- **CUSIP 覆盖**：少数 13F 行 cusip 缺失/异常 → 该行 issuer 退化为纯文本（不链接），不报错。
- **脊梁 name 归一化撞名**：两家不同公司归一化后相同 → 归入 §6 歧义规则，不跳转。
- **EDGAR formerNames 噪声**：极个别历史名可能过于通用 → 若引发误跳，将该来源降级为 loose（结构化数据 only）。v1 默认 high，观察后可调。
- **接 Tier 2（Wikidata）**：作为新"生产者"产出 loose 别名喂同一 `aliasIndex`；confidence 闸已就位，**不返工**。
- **多 session 共用主工作树**：实现在本 worktree / `feat/entity-alias-resolution`；主工作树被其他 session 占用，勿切主树。
