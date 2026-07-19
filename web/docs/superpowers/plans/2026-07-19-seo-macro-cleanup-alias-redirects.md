# Macro 全栈清理 + 投资人别名 301 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全站下线 macro 板块（前台页面 + API + cron + 脚本 + 专属 lib），并为 76 位投资人加唯一姓氏/基金简称 301 别名。

**Architecture:** 单分支单 PR。别名走 `next.config.ts` 的声明式 `redirects()`（沿用现有 `/managers → /investors` 先例，实测 `/:lang(zh|en)/x` 模式对裸 URL、/en、/zh 三种形态都生效，308）。删除按依赖自顶向下分层：先删页面/路由消费者，再删被它们独占的 lib；共享文件只摘 macro 分支。

**Tech Stack:** Next.js App Router（本项目是定制新版，非训练数据里的 Next，改路由相关配置前先查 `node_modules/next/dist/docs/`）、TypeScript、Supabase（本次零迁移）、Vercel cron。

**Spec:** `web/docs/superpowers/specs/2026-07-19-seo-macro-cleanup-alias-redirects-design.md`

## Global Constraints

- 工作目录一律是 `/Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor/web`；分支 `fix/seo-brand-consistency-alias-redirects`（已从 db-foundation 拉出）；PR base = `db-foundation`，不直接推主干。
- Node 不在默认 PATH：所有 node/npm/npx 命令前先 `export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- **保留红线（估值命脉，一行都不许动）：** `src/lib/sources/fred.ts`、`src/lib/managers/treasuryRead.ts`、`scripts/valuation-ingest.ts` 中的 `persistDgs10()`、Supabase `market_rates` 表。Supabase 任何表都不删。
- 项目无常驻测试套件；验证 = `npx tsc --noEmit` + `npm run build` + dev server curl 实测 + ad-hoc 自检脚本（`npx tsx <file>.check.ts`）。
- 删文件前先用 grep 验证消费者集合 ⊆ 删除集合；发现共享文件（有保留方在用）→ 不删，只摘 macro 分支，并在 PR 描述里记录。
- 纯注释里的 macro 提及（`seo.ts`、`freshness/derive.ts`、`ingestion/auth.ts`、首页注释）刻意保留，不算残留。
- 旧 /macro URL 不做 301/410，自然 404。

---

### Task 1: 投资人别名 301（next.config.ts）

**Files:**
- Modify: `next.config.ts`

**Interfaces:**
- Consumes: 现有 `redirects()` 配置（`/:lang(zh|en)/managers` 等）。
- Produces: 常量 `INVESTOR_ALIASES: Record<string, string>`（别名 → 规范 slug）；`redirects()` 中每位投资人一条 `{ source: "/:lang(zh|en)/investors/<alias>", destination: "/:lang/investors/<slug>", permanent: true }`。

- [ ] **Step 1: 查本版 Next 的 redirects 约定**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
grep -rl "redirects" node_modules/next/dist/docs/ | head -5
```

快速浏览命中文档中 `redirects()` 的字段约定（source/destination/permanent），确认与下方写法一致；如有 deprecation 提示按文档调整。

- [ ] **Step 2: 在 `next.config.ts` 的 `nextConfig` 定义之前添加别名表**

在文件顶部 import 之后、`const LEGACY_SECTION_SLUGS` 之前插入：

```ts
// 投资人姓氏/基金简称 → 规范 slug 的 301（SEO：接住自然搜索与站外链接里的人名 URL，
// 如 /investors/ackman 现状 404）。来源：76 位投资人 person 字段的唯一姓氏
//（人工审查剔除撞名、过短、复合姓）+ 常见基金简称。新增投资人时在此补充。
const INVESTOR_ALIASES: Record<string, string> = {
  ackman: "pershing-square",
  buffett: "berkshire-hathaway",
  munger: "daily-journal",
  klarman: "baupost-group",
  burry: "scion-asset-management",
  tepper: "appaloosa",
  dalio: "bridgewater-associates",
  druckenmiller: "duquesne-family-office",
  einhorn: "greenlight-capital",
  loeb: "third-point",
  marks: "oaktree",
  pabrai: "pabrai-funds",
  watsa: "fairfax",
  smith: "fundsmith",
  rochon: "giverny-capital",
  icahn: "icahn-capital",
  coleman: "tiger-global",
  peltz: "trian-partners",
  hohn: "tci-fund",
  halvorsen: "viking-global",
  mandel: "lone-pine-capital",
  ainslie: "maverick-capital",
  armitage: "egerton-capital",
  sosin: "cas-investment-partners",
  ketterer: "causeway-capital",
  hawkins: "southeastern-asset",
  morfit: "valueact-capital",
  pzena: "pzena-investment",
  romick: "first-pacific-advisors",
  berkowitz: "fairholme",
  greenberg: "brave-warrior",
  cooperman: "cooperman-family-office",
  davis: "davis-advisors",
  dorsey: "dorsey-asset",
  ellenbogen: "durable-capital",
  welling: "engaged-capital",
  russo: "gardner-russo",
  gates: "gates-foundation-trust",
  wachenheim: "greenhaven-associates",
  tarasoff: "greenlea-lane-capital",
  nygren: "harris-associates",
  kahn: "kahn-brothers",
  train: "lindsell-train",
  bancroft: "makaira-partners",
  gayner: "markel",
  katz: "matrix-asset-advisors",
  miller: "miller-value-partners",
  lawrence: "oakcliff-capital",
  olstein: "olstein-capital",
  mclemore: "patient-capital",
  vinall: "rv-capital",
  bloomstran: "semper-augustus",
  hong: "shawspring-partners",
  burn: "sound-shore",
  rolfe: "wedgewood-partners",
  weitz: "weitz-investment",
  fitzpatrick: "vulcan-value-partners",
  abrams: "abrams-capital",
  tangen: "ako-capital",
  akre: "akre-capital",
  spier: "aquamarine-capital",
  rogers: "ariel-investments",
  roepers: "atlantic-investment",
  chou: "chou-associates",
  alexander: "conifer-management",
  duan: "hh-international",
  // 基金简称（站外常用叫法）
  pershing: "pershing-square",
  baupost: "baupost-group",
  berkshire: "berkshire-hathaway",
  bridgewater: "bridgewater-associates",
  sequoia: "ruane-cunniff",
  scion: "scion-asset-management",
  duquesne: "duquesne-family-office",
  himalaya: "himalaya-capital",
  greenlight: "greenlight-capital",
  "li-lu": "himalaya-capital",
  tci: "tci-fund",
  tiger: "tiger-global",
  trian: "trian-partners",
  dodge: "dodge-and-cox",
  tweedy: "tweedy-browne",
};
```

- [ ] **Step 3: 在 `redirects()` 返回数组中注册别名跳转**

把 `redirects()` 改为（在既有 return 数组的开头追加一项；`managers`、`research`、sectionRedirects 保持原样，本任务不删它们）：

```ts
  async redirects() {
    const sectionRedirects = LEGACY_SECTION_SLUGS.map((slug) => ({
      source: `/:lang(zh|en)/${slug}`,
      destination: `/:lang/macro/${slug}`,
      permanent: true,
    }));

    const investorAliasRedirects = Object.entries(INVESTOR_ALIASES).map(
      ([alias, slug]) => ({
        source: `/:lang(zh|en)/investors/${alias}`,
        destination: `/:lang/investors/${slug}`,
        permanent: true,
      })
    );

    return [
      ...investorAliasRedirects,
      {
        source: "/:lang(zh|en)/managers",
        destination: "/:lang/investors",
        permanent: true,
      },
      {
        source: "/:lang(zh|en)/research/:ticker",
        destination: "/:lang/stocks/:ticker",
        permanent: true,
      },
      ...sectionRedirects,
    ];
  },
```

依据（已实测）：现有 `/:lang(zh|en)/managers` 规则对裸 `/managers` 也能 308 到 `/investors`，因此单一 `:lang` 模式即可覆盖裸 / /en / /zh 三种形态。

- [ ] **Step 4: 类型检查 + dev server 实测三种形态**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsc --noEmit
npm run dev -- -p 3107 &
sleep 12
curl -sI -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3107/investors/ackman
curl -sI -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3107/zh/investors/ackman
curl -sI -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3107/en/investors/ackman
curl -sI -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3107/investors/sequoia
```

Expected:
- `/investors/ackman` → `308 -> /investors/pershing-square`
- `/zh/investors/ackman` → `308 -> /zh/investors/pershing-square`
- `/en/investors/ackman` → `308 -> /en/investors/pershing-square`（随后由 proxy 再 301 到裸路径，两跳正常）
- `/investors/sequoia` → `308 -> /investors/ruane-cunniff`

若裸形态不跳转而 `:lang` 形态跳转，说明本环境下 redirects 在 proxy rewrite 之后执行——此时在 `src/proxy.ts` 顶部补一段别名映射（读 `INVESTOR_ALIASES`，命中即 301 到对应语言的规范 URL），再重测。实测为准。

- [ ] **Step 5: 关掉 dev server 并提交**

```bash
kill %1 2>/dev/null || true
git add next.config.ts
git commit -m "feat(seo): 301 investor surname/fund-alias URLs to canonical slugs"
```

---

### Task 2: 删除 macro 前台页面、专属组件与专属 lib

**Files:**
- Delete: `src/app/[lang]/macro/`（整目录）
- Delete: `src/components/dashboard/`（DataFreshnessReport/SectionBody/SectionChart/SectionChartClient，仅 macro 在用）
- Delete: `src/lib/macroSnapshot.ts`、`src/lib/macroResearch.ts`、`src/lib/macroNames.ts`、`src/lib/indicatorBlurbs.ts`
- Delete: `src/lib/i18n.ts`（零消费者的死文件，且全文是 "NY Fed Treasury Market Monitor" 旧品牌文案）

**Interfaces:**
- Consumes: 无（本任务是纯删除）。
- Produces: 无。后续 Task 4 清理的共享文件（nav/urls/SubNav 等）在本任务后不再有 macro 页面引用它们，可安全摘除 macro 分支。

- [ ] **Step 1: 删除前验证消费者集合（防共享误删）**

```bash
grep -rln 'components/dashboard' src --include='*.ts*' | grep -v 'components/dashboard'
grep -rln 'lib/macroSnapshot\|lib/macroResearch\|lib/macroNames\|lib/indicatorBlurbs' src scripts --include='*.ts*' | grep -v 'app/\[lang\]/macro'
grep -rln 'lib/i18n' src --include='*.ts*'
```

Expected: 第一条只输出 `src/app/[lang]/macro/[indicator]/page.tsx`；第二条无输出（或仅 macro 目录内文件）；第三条无输出。若出现保留方文件 → 该文件不删，转入 Task 4 按共享文件处理并记录。

- [ ] **Step 2: 执行删除**

```bash
git rm -r "src/app/[lang]/macro" src/components/dashboard src/lib/i18n.ts
git rm src/lib/macroSnapshot.ts src/lib/macroResearch.ts src/lib/macroNames.ts src/lib/indicatorBlurbs.ts
```

- [ ] **Step 3: 类型检查**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsc --noEmit
```

Expected: 通过。（macro 页面是唯一引用方；共享文件里的 macro 分支此时无人引用但语法仍合法，不会报错。）

- [ ] **Step 4: 提交**

```bash
git commit -m "feat(seo): remove macro pages, dashboard components, and macro-only libs"
```

---

### Task 3: 删除 macro 后端（API、cron、数据管道、脚本）

**Files:**
- Delete: `src/app/api/market/`（整目录，14 个路由）、`src/app/api/ai/funding-stress/`、`src/app/api/cron/market-ingest/`、`src/app/api/data/`
- Delete: `src/lib/build.ts`、`src/lib/analyzers/`（整目录 10 个文件）
- Delete: `src/lib/ingestion/` 中 market 专属模块（见 Step 3 清单；**保留 `auth.ts`、`sec13f.ts`**）
- Delete: `src/lib/sources/nyfed.ts`、`src/lib/sources/treasury.ts`（**保留 `fred.ts`**）
- Delete: `scripts/macro-ingest.ts`
- Modify: `vercel.json`、`package.json`

**Interfaces:**
- Consumes: Task 2 已删的前台（无代码依赖关系，仅部署层面）。
- Produces: `vercel.json` 仅剩 health-watchdog 与 sec-fundamentals 两条 cron；`package.json` scripts 无 `macro:ingest`。

- [ ] **Step 1: 删除 API 路由与 build/analyzers**

```bash
git rm -r src/app/api/market src/app/api/ai/funding-stress src/app/api/cron/market-ingest src/app/api/data
git rm src/lib/build.ts
grep -rln 'lib/analyzers' src scripts --include='*.ts*' | grep -v 'lib/analyzers'
```

Expected: grep 无输出（build.ts 是唯一消费者，已删）。若有输出 → 该 analyzers 文件保留并记录。然后：

```bash
git rm -r src/lib/analyzers
```

- [ ] **Step 2: 删除 macro 数据源（保留 fred.ts）**

```bash
grep -rln 'sources/nyfed\|sources/treasury' src scripts --include='*.ts*' | grep -v 'lib/sources'
```

Expected: 无输出（原消费者是 build.ts、analyzers、ingestion market 模块，均已删或本任务内删除）。确认后：

```bash
git rm src/lib/sources/nyfed.ts src/lib/sources/treasury.ts
```

红线自查：`grep -n 'import' src/lib/managers/treasuryRead.ts | head -5` 应仍显示 `@/lib/sources/fred`，且 `src/lib/sources/fred.ts` 未被触碰。

- [ ] **Step 3: 删除 ingestion market 专属模块（保留 auth.ts、sec13f.ts）**

删除候选：`auctionResults.ts batch.ts coerce.ts common.ts facilityUsage.ts marketShare.ts marketShare.pure.ts marketShare.check.ts pdSeries.ts policyExpectations.ts primaryDealerPositions.ts primaryDealerTransactions.ts readRoutes.ts referenceRates.ts repoFinancing.ts routes.ts settlementFails.ts somaHoldings.ts`

逐个验证消费者（`common.ts`、`coerce.ts`、`readRoutes.ts`、`routes.ts` 可能被 api/sec 等非 market 方共享）：

```bash
cd src/lib/ingestion
for f in auctionResults batch coerce common facilityUsage marketShare marketShare.pure pdSeries policyExpectations primaryDealerPositions primaryDealerTransactions readRoutes referenceRates repoFinancing routes settlementFails somaHoldings; do
  echo "== $f"; grep -rln "ingestion/$f\"" ../../app ../../lib ../../../scripts 2>/dev/null | grep -v "lib/ingestion" | grep -vE 'api/(market|cron/market-ingest|data)' ; done
cd -
```

对输出为空的文件执行 `git rm src/lib/ingestion/<f>.ts`（marketShare.check.ts 一并删）；对有保留方消费者的文件**保留**，并在 PR 描述记录"因共享保留"。
另外检查脚本侧：`grep -rln 'lib/ingestion' scripts/*.ts | grep -v macro-ingest` —— 确认保留方脚本（如 sec-ingest-*）只 import `auth`/`sec13f`/被保留的共享文件；若 import 了待删模块，则该模块保留。

- [ ] **Step 4: 删除脚本与 cron/package.json 条目**

```bash
git rm scripts/macro-ingest.ts
```

`vercel.json` 改为（删去 market-ingest 条目，保留另外两条）：

```json
{
  "crons": [
    {
      "path": "/api/cron/health-watchdog",
      "schedule": "0 13 * * *"
    },
    {
      "path": "/api/cron/sec-fundamentals",
      "schedule": "0 11 * * 0"
    }
  ]
}
```

`package.json` scripts 中删去这一行：

```json
    "macro:ingest": "tsx scripts/macro-ingest.ts",
```

- [ ] **Step 5: 类型检查 + 提交**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsc --noEmit
git add -A
git commit -m "feat(seo): remove macro APIs, ingestion pipeline, cron, and ingest script"
```

Expected: tsc 通过。若报"找不到模块"，按报错文件调整（多半是某共享 ingestion 模块被误删 → `git checkout -- <file>` 恢复并记录）。

---

### Task 4: 清理共享文件中的 macro 分支

**Files:**
- Modify: `src/lib/nav.ts`、`src/lib/urls.ts`、`src/components/shell/SubNav.tsx`、`src/components/home/FoundationsGrid.tsx`、`src/components/common/DataStrip.tsx`、`src/app/sitemap.ts`、`src/lib/learn.ts`、`src/lib/health/checks.ts`、`src/lib/health/checks.check.ts`、`src/lib/health/gather.ts`、`next.config.ts`
- Delete（如验证无消费者）: `src/lib/db/freshness.ts`

**Interfaces:**
- Consumes: Task 2/3 的删除结果（macro 页面/路由已不存在）。
- Produces: `TOP_NAV` 无 macro 项；`SECONDARY_NAV` 无 macro 键；`SubNav` 的 `section` 类型为 `"investors" | "stocks"`；`urls.ts` 无 `macroPath`；health 看门狗只覆盖 13f/prices；`next.config.ts` 无 `LEGACY_SECTION_SLUGS`。

- [ ] **Step 1: `src/lib/nav.ts` —— 三处删除**

1. `TOP_NAV` 中删去 `{ key: "macro", zh: "宏观/流动性", en: "Macro / Liquidity", href: "/macro" },` 一行。
2. `SECONDARY_NAV` 中删去整个 `macro: [ ... ],` 块（funding/supply/policy/macro-pricing/system/methodology 六条）。
3. 删去 `MACRO_GROUPS` 常量与 `indicatorToGroup` 函数。删前验证：`grep -rn 'MACRO_GROUPS\|indicatorToGroup' src --include='*.ts*' | grep -v 'lib/nav.ts'` —— Expected: 无输出（原消费者是 macro 页面，Task 2 已删）。若有输出 → 保留并记录。

- [ ] **Step 2: `src/lib/urls.ts` —— 删 `macroPath`**

删去这一行（原消费者在 macro 页面，已删）：

```ts
export const macroPath = (lang: Lang, indicator: string) => localePath(lang, `/macro/${indicator}`);
```

- [ ] **Step 3: `src/components/shell/SubNav.tsx` —— 收窄 section 类型**

```ts
section: "investors" | "stocks";
```

（原为 `"investors" | "stocks" | "macro"`。）

- [ ] **Step 4: `src/components/home/FoundationsGrid.tsx` —— 摘掉 macro 链接**

1. 删除 COPY.zh 的 `macroLabel: "宏观流动性 →",` 与 COPY.en 的 `macroLabel: "Macro & liquidity →",`。
2. 删除组件末尾的链接块：

```tsx
      <div className="mt-6">
        <Link
          href={localePath(lang, "/macro")}
          className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {c.macroLabel}
        </Link>
      </div>
```

3. 删除不再使用的 import：`import Link from "next/link";` 和 `import { localePath } from "@/lib/urls";`（该文件仅此一处用到两者）。

- [ ] **Step 5: `src/components/common/DataStrip.tsx` —— DGS10 瓦片去链接**

10Y 数据保留展示（估值相关信号），仅删跳转（目标 /macro 将 404）：删去 dgs10 Tile 的

```tsx
        href={localePath(lang, "/macro")}
```

注意保留 consensus Tile 的 `href={localePath(lang, "/investors/consensus")}`，因此 `localePath` import 保留。

- [ ] **Step 6: `src/app/sitemap.ts` —— 删两个 macro 条目**

删去这两行：

```ts
    entry("/macro", "daily", 0.7),
    entry("/macro/methodology", "weekly", 0.5),
```

（其上方注释 `// 编辑/外部数据页:无诚实的 13F 变更日期 → 不带 lastmod。` 保留，它同时覆盖 about/learn。）

- [ ] **Step 7: `src/lib/learn.ts` —— 修正一句过时文案**

```bash
grep -n 'macro backdrop' src/lib/learn.ts
```

将 `"We pull superinvestors' 13F filings, valuation, and the macro backdrop into one place and keep it readable, so the judgment stays yours."` 改为 `"We pull superinvestors' 13F filings and valuation into one place and keep it readable, so the judgment stays yours."`。若同句存在中文版（含"宏观"措辞），一并同步修正。

- [ ] **Step 8: health 看门狗摘除 macro 检查**

`src/lib/health/checks.ts`：
1. `HealthProblem.pipeline` 类型改为 `"13f" | "prices"`。
2. 删去 `MacroStatusInput` 类型、`MACRO_ALERT_STATUSES`、`MACRO_STALE_CHECKED_DAYS`、`evaluateMacro` 函数。

`src/lib/health/checks.check.ts`：删去 `// --- evaluateMacro ---` 起到文件倒数第二行（`console.log` 之前）的全部 macro 自检块和 `mk` 工厂；import 行改为：

```ts
import { evaluate13F } from "./checks";
```

`src/lib/health/gather.ts`：
1. import 块删去 `evaluateMacro,` 与 `type MacroStatusInput,`，删去 `import { getFreshnessStatus } from "@/lib/db/freshness";`。
2. 删去整个 `gatherMacro` 函数。
3. `gatherHealth` 改为：

```ts
export async function gatherHealth(today: Date): Promise<HealthReport> {
  const [r13, rPrices] = await Promise.all([gather13F(today), gatherPrices(today)]);
  const problems = [...r13.problems, ...rPrices.problems];
  const info = [...r13.info, ...rPrices.info];
  return { ok: problems.length === 0, checkedAt: today.toISOString(), problems, info };
}
```

然后验证 `src/lib/db/freshness.ts` 是否已成孤儿：`grep -rln 'lib/db/freshness' src scripts --include='*.ts*' | grep -v 'lib/db/freshness'` —— 无输出则 `git rm src/lib/db/freshness.ts`；有输出则保留并记录。

- [ ] **Step 9: 运行看门狗自检脚本**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsx src/lib/health/checks.check.ts
```

Expected: `checks.check.ts: all assertions passed ✓`

- [ ] **Step 10: `next.config.ts` —— 删指向 /macro 的旧跳转**

删去 `LEGACY_SECTION_SLUGS` 常量（11 个 slug 的数组）和 `redirects()` 里的 `sectionRedirects` 定义及其在 return 数组中的 `...sectionRedirects,`。Task 1 加的 `investorAliasRedirects` 与 `managers`/`research` 两条保留。

- [ ] **Step 11: 全库残留扫描 + 类型检查 + 提交**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
grep -rn -iE 'macro|Treasury Market Monitor' src scripts next.config.ts --include='*.ts*' | grep -v tsconfig.tsbuildinfo
grep -n -i 'macro' vercel.json package.json
npx tsc --noEmit
```

Expected: grep 仅剩刻意保留的注释提及（`seo.ts`、`freshness/derive.ts`、`ingestion/auth.ts`、首页注释）与 `checks.check.ts` 之类无匹配；tsc 通过。若有代码级残留 → 回到对应 Step 清理。

```bash
git add -A
git commit -m "feat(seo): strip macro branches from shared nav, health, sitemap, and config"
```

---

### Task 5: 全量验证 + 提 PR

**Files:**
- 无新改动；产出为验证记录与 PR。

**Interfaces:**
- Consumes: Task 1–4 的全部提交。
- Produces: 指向 `db-foundation` 的 PR。

- [ ] **Step 1: 类型检查 + 生产构建**

```bash
export PATH="/Users/junlinzhu/.nvm/versions/node/v20.20.0/bin:$PATH"
npx tsc --noEmit
npm run build
```

Expected: 两者通过。构建警告里如出现与本次无关的历史问题，记录在 PR 描述，不阻塞。

- [ ] **Step 2: dev server 端到端实测**

```bash
npm run dev -- -p 3107 &
sleep 12
# macro 自然 404（三种形态）
for u in /macro /macro/methodology /zh/macro; do echo "$u => $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3107$u)"; done
# 别名 301 抽查
curl -sI -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3107/investors/ackman
curl -sI -o /dev/null -w "%{http_code} -> %{redirect_url}\n" http://localhost:3107/zh/investors/buffett
# 核心页面正常
for u in / /investors /stocks /stocks/AAPL /investors/pershing-square /learn /zh; do echo "$u => $(curl -s -o /dev/null -w '%{http_code}' http://localhost:3107$u)"; done
# sitemap 无 macro
curl -s http://localhost:3107/sitemap.xml | grep -c macro || echo "0 macro entries"
```

Expected: macro 三个 URL 全部 `404`；别名 `308` 到正确 slug；核心页面全部 `200`；sitemap 输出 `0 macro entries`。首页人工看一眼（导航无"宏观/流动性"，底部无 macro 链接，DGS10 瓦片仍在但不可点击）。

- [ ] **Step 3: 关 dev server，推送并提 PR**

```bash
kill %1 2>/dev/null || true
git push -u origin fix/seo-brand-consistency-alias-redirects
gh pr create --base db-foundation --title "SEO: retire macro section + investor alias 301s" --body "$(cat <<'EOF'
## What
- Retires the entire macro section (pages, APIs, cron, ingest script, macro-only libs) — off-theme for the 13F × valuation core; indexed /macro URLs will 404 and drop out naturally.
- Adds 301 redirects for investor surname/fund-alias URLs (e.g. /investors/ackman → /investors/pershing-square), covering bare / /en / /zh forms.
- Strips macro branches from shared files (nav, SubNav, FoundationsGrid, DataStrip, sitemap, learn copy, health watchdog, next.config legacy redirects).

## Preserved (red lines)
- Valuation DGS10 chain: lib/sources/fred.ts, treasuryRead.ts, persistDgs10() in valuation-ingest, market_rates table. No Supabase tables touched.

## Verification
- tsc --noEmit ✓ / next build ✓
- checks.check.ts (health watchdog self-check) ✓
- Dev-server curl: /macro 3 forms → 404; alias 3 forms → 308; core pages 200; sitemap macro-free.

Spec: web/docs/superpowers/specs/2026-07-19-seo-macro-cleanup-alias-redirects-design.md
Plan: web/docs/superpowers/plans/2026-07-19-seo-macro-cleanup-alias-redirects.md
EOF
)"
```

Expected: 输出 PR URL。若 `gh` 未登录/不可用，打印分支名与上述 PR 文案，提示站长手动开 PR。

- [ ] **Step 4: 把计划与 spec 一并提交（如尚未）**

```bash
git add docs/superpowers/ && git commit -m "docs: implementation plan for macro teardown + alias 301s" && git push
```

（本文件与 spec 应随分支一起进入 PR，便于审查。）
