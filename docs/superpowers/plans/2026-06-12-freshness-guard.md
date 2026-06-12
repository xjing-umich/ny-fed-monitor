# 数据卫生 + 13F 新鲜度护栏 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 4 家源头停报/缺失 manager 的数据卫生问题，并给全站加上三档（current/stale/inactive）13F 新鲜度护栏。

**Architecture:** 数据卫生 = seed 变更 + 一次性 DB 清理脚本 + 全量重跑 `npm run ingest`。护栏 = 扩展既有纯函数模块 `web/src/lib/freshness/derive.ts`（新增按"全局最新季"算落后季数的三档判定），新建 `FreshnessBadge` 组件接进 manager 详情页（替换现有二元 stale 横幅），ConvictionPicks 按档位 gate，聚合双路径（DB 快照构建器 + 内存扫描回退）统一"buys/sells 只计当季申报者、inactive 全剔除、consensus 保留 stale 但页脚标注"。

**Tech Stack:** Next.js App Router（改过的版本，**写任何 page/组件前先读 `web/node_modules/next/dist/docs/` 对应指南**）、Supabase REST（@supabase/supabase-js）、tsx 脚本、--tt-* 品牌 token、内联 `COPY={zh,en}` 双语。

**项目约定（覆盖 plan 模板默认）：**
- 本项目**不写测试、不做 TDD**（solo dev 约定）。纯逻辑用 `derive.check.ts` 风格的 ad-hoc 自检（node:assert，跑 `npx tsx`，不接 CI）。
- 验证 = `npx tsc --noEmit` + `npm run build`（都在 `web/` 下跑）+ 人工看页面。
- 工作区：worktree `.claude/worktrees/freshness-guard`，分支 `feat/freshness-guard`。**只在该 worktree 内动**。所有 `web/` 相对路径以 worktree 根为基准。
- ⚠️ `npm run ingest` 和 `retire-manager.ts` 写的是**生产共享 Supabase**。这是有意为之（数据卫生本来就要修生产数据；加 bridgewater、删停报者的 DB 行在代码合并前生效是可接受的——错误数据早删早好）。但执行前确认 `.env.local`（仓库根）里的 SUPABASE_URL 指向预期项目。
- 数据准确性硬要求：任何拉取的 SEC 数据须可标注来源与日期；Task 2 末尾有 SEC↔DB 比对验收。

**Spec:** `docs/superpowers/specs/2026-06-12-freshness-guard-design.md`。阈值：落后 0–1 季 = current，2–3 = stale，≥4 = inactive。已拍板：停报无继任 → 完全退役；聚合保留 stale 但标注；conviction 对 stale 降级不抑制、对 inactive 不渲染。

---

## Task 1: 继任 CIK 排查（greenlight-capital、ruane-cunniff）

调查任务，无代码产出，结论决定 Task 2 怎么改 seed。**两个出口都已拍板，不需要再问用户**：找到继任 → 换 CIK 保 slug；找不到 → 退役。

**Files:** 无（结论记录到 Task 2 的 commit message 里）

- [ ] **Step 1: 用 EDGAR company search 找候选主体**

```bash
# Greenlight：Einhorn 仍活跃，几乎肯定换主体申报了
curl -s -H "User-Agent: NYFedMonitor research junlinzhu@jobright.ai" \
  "https://www.sec.gov/cgi-bin/browse-edgar?company=greenlight&type=13F-HR&action=getcompany&output=atom" | grep -E "<title>|CIK="

# Ruane Cunniff（Sequoia Fund 管理人，2018 后疑似重组）
curl -s -H "User-Agent: NYFedMonitor research junlinzhu@jobright.ai" \
  "https://www.sec.gov/cgi-bin/browse-edgar?company=ruane&type=13F-HR&action=getcompany&output=atom" | grep -E "<title>|CIK="
# 也试 "sequoia"：
curl -s -H "User-Agent: NYFedMonitor research junlinzhu@jobright.ai" \
  "https://www.sec.gov/cgi-bin/browse-edgar?company=sequoia&type=13F-HR&action=getcompany&output=atom" | grep -E "<title>|CIK="
```

Expected: atom XML 里每个候选公司一个 `<title>公司名 (CIK=##########)` 形态的条目。已知排除项：greenlight 旧 CIK 0001079114、ruane 旧 CIK 0000728014。

补充手段（company search 没命中时）：EDGAR 全文搜索 UI `https://efts.sec.gov/LATEST/search-index?q=%22greenlight%22&forms=13F-HR`（JSON；若该端点 404 则用 WebFetch 打开 `https://www.sec.gov/cgi-srv/efts/search?q=...` 或人工查 https://efts.sec.gov/LATEST/search-index 文档）。Guy Spier/aquamarine **不用查**——已确认按退役处理。

- [ ] **Step 2: 验证候选 CIK 的申报连续性**

对每个候选 CIK（10 位补零）：

```bash
curl -s -H "User-Agent: NYFedMonitor research junlinzhu@jobright.ai" \
  "https://data.sec.gov/submissions/CIK##########.json" \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
r=d['filings']['recent']
rows=[(r['reportDate'][i],r['filingDate'][i]) for i,f in enumerate(r['form']) if f in ('13F-HR','13F-HR/A')]
print(d['name']); print(sorted(set(rows),reverse=True)[:10])
"
```

判定标准（满足才算继任）：
1. 主体名/管理人明显衔接（如 "Greenlight Capital" 变体、DME Capital 之类 Einhorn 关联名、"Ruane Cunniff LP" 变体）。
2. 有连续的近期 13F-HR，最新 period 在 2025-12-31 或 2026-03-31。
3. 时间衔接：新主体首报期 ≈ 旧主体末报期之后（greenlight 旧主体末报 2023-12-31；ruane 2018-03-31）。
4. 规模量级合理（greenlight ~$2B 级；ruane/Sequoia ~$10B 级）。拿不准时抓最新一期 total value 对比。

- [ ] **Step 3: 记录结论**

把每家的结论（继任 CIK 或"无继任 → 退役"）+ 证据（主体名、最新 period、首报期）写下来，供 Task 2 使用并写进 Task 2 的 commit message。

---

## Task 2: 数据卫生 — seed 变更、退役脚本、全量 ingest、SEC 比对验收

**Files:**
- Modify: `web/config/managers.json`
- Modify: `web/src/lib/investorAliases.ts`
- Create: `web/scripts/retire-manager.ts`
- Delete（由 ingest 覆盖/重生成，无需手动）: `web/src/data/13f/bridgewater-associates.json`、`web/src/data/13f/index.json`

- [ ] **Step 1: 改 `web/config/managers.json`**

1. 追加 bridgewater（放数组末尾即可，index 读取时按 totalValue 排序）：

```json
  { "cik": "0001350694", "slug": "bridgewater-associates", "person": "Ray Dalio" }
```

2. 删除 `{ "cik": "0001404599", "slug": "aquamarine", "person": "Guy Spier" }` 整行（已拍板退役）。
3. 按 Task 1 结论处理另两家：
   - 找到继任 → 只改该行的 `"cik"` 为新 CIK（slug、person 不动）：
     - `ruane-cunniff` 行（现 cik 0000728014）
     - `greenlight-capital` 行（现 cik 0001079114）
   - 无继任 → 删除该行。

- [ ] **Step 2: 同步 `web/src/lib/investorAliases.ts`**

- 删除退役者的行：第 17 行 `"aquamarine": "斯派尔 盖斯派尔",`；若 ruane/greenlight 退役，同样删 `"ruane-cunniff"`（第 28 行）/ `"greenlight-capital"`（第 30 行）行。换继任 CIK 不退役的，别名行保留不动（键是 slug）。
- 在对象里加 bridgewater 别名（按文件内现有格式，键为 slug、值为空格分隔的中文搜索词）：

```ts
  "bridgewater-associates": "达利欧 瑞·达利欧 桥水 桥水基金",
```

- [ ] **Step 3: 写一次性退役脚本 `web/scripts/retire-manager.ts`**

完整文件内容（env 加载与 realtime transport 写法照搬 `ingest-13f.ts` 末段惯例）：

```ts
/**
 * 退役 manager 的 DB 清理：按 cik 或 slug 删除 holdings → filings → managers（顺序删，无级联依赖）。
 * 用法: npx tsx scripts/retire-manager.ts <cik-or-slug> [<cik-or-slug> ...]
 * 也用于换继任 CIK 前清理旧 CIK 行（managers.slug 唯一，旧行不删会撞 upsert）。
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createClient } from "@supabase/supabase-js";
import WebSocket from "ws";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 凭据优先 process.env，本地回退仓库根 .env.local（与 ingest-13f.ts 同款）。
const fileEnv: Record<string, string> = {};
const envPath = path.join(__dirname, "../../.env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) fileEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}
const env = { ...fileEnv, ...process.env } as Record<string, string>;
const sbUrl = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const sbKey = env.SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;
if (!sbUrl || !sbKey) {
  console.error("缺 Supabase env（SUPABASE_URL / SUPABASE_SERVICE_KEY）。");
  process.exit(1);
}
const db = createClient(sbUrl, sbKey, {
  auth: { persistSession: false },
  realtime: { transport: WebSocket as unknown as never },
});

async function retire(cikOrSlug: string): Promise<void> {
  const { data: mgrs, error } = await db
    .from("managers").select("cik,slug,name")
    .or(`cik.eq.${cikOrSlug},slug.eq.${cikOrSlug}`).limit(1);
  if (error) throw new Error(`managers 查询失败: ${error.message}`);
  const m = mgrs?.[0];
  if (!m) { console.warn(`[${cikOrSlug}] DB 里不存在，跳过。`); return; }

  const { data: filings, error: fe } = await db.from("filings").select("id").eq("cik", m.cik);
  if (fe) throw new Error(`filings 查询失败: ${fe.message}`);
  const ids = (filings ?? []).map((f) => f.id);

  if (ids.length) {
    const { error: he } = await db.from("holdings").delete().in("filing_id", ids);
    if (he) throw new Error(`holdings 删除失败: ${he.message}`);
  }
  const { error: fde } = await db.from("filings").delete().eq("cik", m.cik);
  if (fde) throw new Error(`filings 删除失败: ${fde.message}`);
  const { error: me } = await db.from("managers").delete().eq("cik", m.cik);
  if (me) throw new Error(`managers 删除失败: ${me.message}`);
  console.log(`[${m.slug}] 已退役（cik ${m.cik}，${ids.length} 期 filings 及其 holdings 已删）。`);
}

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error("用法: npx tsx scripts/retire-manager.ts <cik-or-slug> ..."); process.exit(1); }
  for (const a of args) await retire(a);
}
main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
```

- [ ] **Step 4: 类型检查 + commit 代码变更**

```bash
cd web && npx tsc --noEmit
```

Expected: 无错误。

```bash
git add web/config/managers.json web/src/lib/investorAliases.ts web/scripts/retire-manager.ts
git commit -m "feat(data): bridgewater 入 seed；停报基金退役；retire-manager 运维脚本

继任 CIK 排查结论：<Task 1 的结论与证据贴这里>"
```

- [ ] **Step 5: 执行 DB 清理（写生产库，先核对 env）**

```bash
grep "^SUPABASE_URL" ../.env.local   # 在 web/ 下跑；确认指向预期 Supabase 项目
npx tsx scripts/retire-manager.ts aquamarine
# 换了继任 CIK 的（按旧 cik 删，slug 此刻还指旧行）：
npx tsx scripts/retire-manager.ts 0000728014   # ruane 旧 CIK（若退役则传 slug 同效）
npx tsx scripts/retire-manager.ts 0001079114   # greenlight 旧 CIK（同上）
```

Expected: 每行输出 `[slug] 已退役（cik ...，N 期 filings 及其 holdings 已删）。`

- [ ] **Step 6: 全量 ingest（约 35 家 × 8 季，限速下需 20–40 分钟）**

```bash
cd web && npm run ingest 2>&1 | tee /tmp/ingest-freshness-guard.log
```

Expected（在日志里确认）:
- `[bridgewater-associates] Written to ... (8 quarters)`；换 CIK 的两家同样 8 季（继任主体存续不足 8 季则为实际期数，须 ≥ 与停报衔接的期数）。
- 末尾 `Supabase upsert done.`、`Consensus: holdings N 行, moves N 行`（consensus 快照已按新 manager 集重建）。
- 无 `13F ingest 护栏触发`（成功率 ≥90%）。
- `web/src/data/13f/index.json` 重生成后不含退役 slug；`bridgewater-associates.json` 变为新形状（顶层 `filings` 数组）。

```bash
python3 -c "import json; d=json.load(open('src/data/13f/index.json')); print(len(d['managers']), [m['slug'] for m in d['managers'] if m['slug'] in ('aquamarine','ruane-cunniff','greenlight-capital','bridgewater-associates')])"
```

Expected: 总数 = 新 seed 行数；列表里无退役 slug、有 bridgewater-associates（及未退役的换 CIK 者）。

- [ ] **Step 7: SEC ↔ DB 比对验收（数据准确性硬要求）**

对**每一位**在档 manager 比对 DB 最新 period 与 SEC submissions 最新 13F-HR period：

```bash
cd web && npx tsx -e "
const fs = require('fs');
const idx = JSON.parse(fs.readFileSync('src/data/13f/index.json','utf8'));
const seeds = JSON.parse(fs.readFileSync('config/managers.json','utf8'));
const H = { 'User-Agent': 'NYFedMonitor research junlinzhu@jobright.ai' };
(async () => {
  let bad = 0;
  for (const s of seeds) {
    const cik10 = s.cik.replace(/^0+/,'').padStart(10,'0');
    const d = await (await fetch('https://data.sec.gov/submissions/CIK'+cik10+'.json',{headers:H})).json();
    const r = d.filings.recent;
    const secLatest = r.form.map((f,i)=>({f,p:r.reportDate[i]})).filter(x=>x.f==='13F-HR'||x.f==='13F-HR/A').map(x=>x.p).sort().at(-1);
    const dbLatest = idx.managers.find(m=>m.slug===s.slug)?.period;
    const ok = secLatest === dbLatest;
    if (!ok) bad++;
    console.log((ok?'OK  ':'FAIL')+' '+s.slug+' db='+dbLatest+' sec='+secLatest);
    await new Promise(r=>setTimeout(r,300));
  }
  if (bad) { console.error(bad+' 家不一致'); process.exit(1); }
  console.log('全部一致 ✓');
})();
"
```

Expected: 每行 `OK`，末尾 `全部一致 ✓`。有 FAIL → 回去查该家 ingest 日志，修完重跑本步。

- [ ] **Step 8: commit 数据文件**

```bash
git add web/src/data/13f/
git commit -m "data(13f): 全量重抓 — bridgewater 8 季入库，退役者出 index"
```

---

## Task 3: 三档新鲜度纯函数（扩展 `lib/freshness/derive.ts`）

**Files:**
- Modify: `web/src/lib/freshness/derive.ts`（文件末尾追加）
- Modify: `web/src/lib/freshness/derive.check.ts`（文件末尾追加自检）

注意：spec §B 原写新建 `web/src/lib/managers/freshness.ts`；计划阶段发现 `lib/freshness/derive.ts` 已是纯函数新鲜度的既定家（自带 parseUTC、季度算术、check 文件），故扩展之，不另开文件。spec 已同步修订。

- [ ] **Step 1: 在 `derive.ts` 末尾追加**

```ts
// ── 13F 三档新鲜度（以全局最新季为基准的落后季数）─────────────────────────────
// 与上面 filingFreshness(挂钟基准)不同：这里的基准是"全体 manager 中最新的 period"，
// 用于站内一致的相对落后标注与聚合口径(spec 2026-06-12-freshness-guard §B)。

export type Freshness13F = "current" | "stale" | "inactive";

export const STALE_MIN_LAG = 2;    // 落后 ≥2 季 → stale(偏旧)
export const INACTIVE_MIN_LAG = 4; // 落后 ≥4 季(一年无申报) → inactive(停报 tripwire)

/** periods(YYYY-MM-DD 季末日)中的最大值。空/全非法 → null。 */
export function globalLatestPeriod(periods: Array<string | null | undefined>): string | null {
  let max: string | null = null;
  for (const p of periods) {
    if (p && parseUTC(p) && (max === null || p > max)) max = p;
  }
  return max;
}

/** period 落后 globalLatest 的季数(非负)。任一非法 → null。 */
export function quarterLag(period: string | null, globalLatest: string | null): number | null {
  const p = parseUTC(period);
  const g = parseUTC(globalLatest);
  if (!p || !g) return null;
  const qi = (d: Date) => d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  return Math.max(0, qi(g) - qi(p));
}

/** 三档判定：0–1 → current；2–3 → stale；≥4 → inactive。period 缺失/非法按最严(inactive)。 */
export function freshness13F(period: string | null, globalLatest: string | null): Freshness13F {
  const lag = quarterLag(period, globalLatest);
  if (lag == null || lag >= INACTIVE_MIN_LAG) return "inactive";
  if (lag >= STALE_MIN_LAG) return "stale";
  return "current";
}
```

- [ ] **Step 2: 在 `derive.check.ts` 末尾追加自检**

```ts
// --- 13F 三档新鲜度 ---
import { globalLatestPeriod, quarterLag, freshness13F } from "./derive";

assert.equal(globalLatestPeriod(["2025-12-31", "2026-03-31", null]), "2026-03-31", "取最大季");
assert.equal(globalLatestPeriod([]), null, "空=null");

assert.equal(quarterLag("2026-03-31", "2026-03-31"), 0, "同季=0");
assert.equal(quarterLag("2025-12-31", "2026-03-31"), 1, "跨年1季");
assert.equal(quarterLag("2025-09-30", "2026-03-31"), 2, "2季");
assert.equal(quarterLag("2022-06-30", "2026-03-31"), 15, "aquamarine 量级");
assert.equal(quarterLag("2026-03-31", "2025-12-31"), 0, "超前夹到0");
assert.equal(quarterLag(null, "2026-03-31"), null, "缺失=null");

assert.equal(freshness13F("2026-03-31", "2026-03-31"), "current", "0季=current");
assert.equal(freshness13F("2025-12-31", "2026-03-31"), "current", "1季=current(正常申报节奏)");
assert.equal(freshness13F("2025-09-30", "2026-03-31"), "stale", "2季=stale(scion 现状)");
assert.equal(freshness13F("2025-06-30", "2026-03-31"), "stale", "3季=stale");
assert.equal(freshness13F("2025-03-31", "2026-03-31"), "inactive", "4季=inactive");
assert.equal(freshness13F(null, "2026-03-31"), "inactive", "缺失按最严");

console.log("freshness13F checks ✓");
```

注意：文件顶部已 import 自 "./derive"，把新增符号并入**顶部既有 import**（ESM import 不能出现在断言之后；上面代码块的 import 行仅示意要引入哪些符号）。

- [ ] **Step 3: 跑自检 + 类型检查**

```bash
cd web && npx tsx src/lib/freshness/derive.check.ts && npx tsc --noEmit
```

Expected: 原有断言 + `freshness13F checks ✓`，无类型错误。

- [ ] **Step 4: Commit**

```bash
git add web/src/lib/freshness/derive.ts web/src/lib/freshness/derive.check.ts
git commit -m "feat(freshness): 三档 13F 新鲜度纯函数(current/stale/inactive, 全局最新季基准)"
```

---

## Task 4: FreshnessBadge 组件 + manager 详情页接线 + ConvictionPicks gate

**Files:**
- Create: `web/src/components/entity/FreshnessBadge.tsx`
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`
- Modify: `web/src/components/entity/ConvictionPicks.tsx`

前置：改 page 前读 `web/node_modules/next/dist/docs/` 中 Server Components / 页面相关指南（项目硬约定）。本任务不引入新 Next API（只动 JSX 与已有数据流），但仍须确认 `notFound`/ISR 用法未变。

- [ ] **Step 1: 新建 `web/src/components/entity/FreshnessBadge.tsx`**

```tsx
import React from "react";
import type { Lang } from "@/lib/nav";
import type { Freshness13F } from "@/lib/freshness/derive";

const COPY = {
  zh: {
    provenance: (period: string, filedAt: string) =>
      `数据截至 ${period}（${filedAt} 提交）· 来源 SEC EDGAR`,
    stale: (period: string, lag: number) =>
      `⚠ 该投资者最新公开 13F 为 ${period}，落后当前披露季 ${lag} 季。以下持仓与解读反映该期数据，可能并非当前持仓。`,
    inactive: (period: string) =>
      `⚠ 已停报：该申报主体最后一次 13F 为 ${period}，此后未再申报。以下为历史数据，并非当前持仓。`,
  },
  en: {
    provenance: (period: string, filedAt: string) =>
      `Data as of ${period} (filed ${filedAt}) · Source: SEC EDGAR`,
    stale: (period: string, lag: number) =>
      `⚠ This manager's most recent public 13F covers ${period}, ${lag} quarter${lag === 1 ? "" : "s"} behind the latest disclosure quarter. Holdings below reflect that filing and may not be current.`,
    inactive: (period: string) =>
      `⚠ No longer filing: this filer's last 13F covers ${period}, with none since. Holdings below are historical, not current.`,
  },
} as const;

/**
 * 13F 来源/截止日常显行 + 按三档新鲜度的条件警示。
 * 纯展示组件(服务端渲染)，判定由调用方用 freshness13F 算好传入。
 */
export function FreshnessBadge({
  lang,
  period,
  filedAt,
  status,
  lagQuarters,
}: {
  lang: Lang;
  period: string;
  filedAt: string;
  status: Freshness13F;
  lagQuarters: number;
}): React.ReactElement {
  const t = COPY[lang];
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
        {t.provenance(period, filedAt)}
      </p>
      {status === "stale" && (
        <div className="border-l-2 border-[var(--tt-warn)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
          {t.stale(period, lagQuarters)}
        </div>
      )}
      {status === "inactive" && (
        <div className="border-l-2 border-[var(--tt-negative)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
          {t.inactive(period)}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: `ConvictionPicks.tsx` 加可选 as-of 警示**

1. COPY 两语言各加一个键（zh 在 `title` 同级，en 同）：

```ts
    asOf: (period: string) => `基于 ${period} 数据`,
```
```ts
    asOf: (period: string) => `Based on ${period} data`,
```

2. 组件签名加可选 prop `asOfPeriod?: string`，标题行渲染处（`{t.title}` 的 `<span>` 之后、同一个 `<div>` 内）追加：

```tsx
        {asOfPeriod && (
          <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-warn)]">
            {t.asOf(asOfPeriod)}
          </span>
        )}
```

（props 解构里加 `asOfPeriod,`，类型里加 `asOfPeriod?: string; // stale 时传 latest.period，区块级 as-of 警示`。）

- [ ] **Step 3: 详情页 `[slug]/page.tsx` 接线**

1. import 区：

```ts
import { filingFreshness, freshness13F, quarterLag, globalLatestPeriod } from "@/lib/freshness/derive";
import { FreshnessBadge } from "@/components/entity/FreshnessBadge";
```

并**删除** `import { isPeriodStale } from "@/lib/ai/investorNarrative";`（本页唯一使用点即将移除；该函数本身保留，别处还在用则不动——先 grep 确认：`grep -rn "isPeriodStale" web/src` 若仅此页用 import 才删）。

2. 把现有 `const idx = await getManagerIndex();`（约 370 行，"Related" 注释处）**上移**到 `const picks = deriveConviction(d.filings);` 之前，related 计算继续复用同一个 `idx`（`getManagerIndex` 有 `cache()`，位置变化无重复查询，但单变量更清晰）。

3. 删除现有 stale 判定块（`const stale = isPeriodStale(...)` 到 `: undefined;` 整段，约 283–291 行），替换为：

```tsx
  // 三档新鲜度(全局最新季基准, spec freshness-guard §B/C1): 常显来源+截止日, stale/inactive 加警示。
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const fresh = freshness13F(latest.period, globalLatest);
  const lag = quarterLag(latest.period, globalLatest) ?? 0;
  const freshnessNotice = (
    <FreshnessBadge lang={lang} period={latest.period} filedAt={latest.filedAt} status={fresh} lagQuarters={lag} />
  );
```

4. `EntityPage` 的 `notice={staleNotice}` 改为 `notice={freshnessNotice}`（现在恒有值：常显来源行）。

5. ConvictionPicks 渲染处改为 gate 形态：

```tsx
          {fresh !== "inactive" && picks.length > 0 && (
            <ConvictionPicks
              picks={picks}
              lang={lang}
              investor={slug}
              cusipToTicker={cusipToTicker}
              asOfPeriod={fresh === "stale" ? latest.period : undefined}
            />
          )}
```

6. `sources={[...]}` 行保持不动（`filingFreshness` 挂钟口径继续用于来源徽标，与三档口径并存，职责不同）。

- [ ] **Step 4: 类型检查 + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/components/entity/FreshnessBadge.tsx web/src/components/entity/ConvictionPicks.tsx "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(freshness): FreshnessBadge 组件；详情页三档警示接线；conviction 按档位 gate"
```

---

## Task 5: 聚合口径 — 内存扫描路径 + DB 快照构建器 + 页面标注

**Files:**
- Modify: `web/src/lib/aggregations.ts`
- Modify: `web/scripts/lib/computeConsensus.ts`
- Modify: `web/src/app/[lang]/investors/consensus/page.tsx`
- Modify: `web/src/app/[lang]/investors/_movesPage.tsx`

口径（spec §C2，三处保持一致）：
- consensus（持仓快照）：stale 计入；inactive 剔除。
- buys/sells/holderDeltas（季度变动）：只计 `latest.period === 全局最新季` 的 manager。
- 标注：consensus 页脚列 stale manager 与其截止期；buys/sells 页脚标统计基准季 + 未计入名单。

- [ ] **Step 1: `web/src/lib/aggregations.ts` — ScanRow 带 period，两个过滤助手**

1. import 区加：

```ts
import { freshness13F, globalLatestPeriod } from "@/lib/freshness/derive";
```

2. `ScanRow` 加字段：

```ts
export type ScanRow = {
  slug: string;
  person: string;
  period: string; // latest.period，新鲜度口径用
  holdings: Holding[];
  changes: HoldingChange[];
};
```

3. `scanAllManagers` 的 return 行补 `period: d.latest.period,`：

```ts
      return { slug: m.slug, person: m.person, period: d.latest.period, holdings: d.latest.holdings ?? [], changes: d.changes ?? [] };
```

4. `computeMostHeld` 之前加两个纯助手：

```ts
/** 剔除 inactive(≥4季停报 tripwire)；stale 保留。consensus 持仓口径。 */
export function excludeInactive(scan: ScanRow[]): ScanRow[] {
  const gl = globalLatestPeriod(scan.map((r) => r.period));
  return scan.filter((r) => freshness13F(r.period, gl) !== "inactive");
}

/** 只留全局最新季有申报者。季度变动(buys/sells/holderDeltas)口径。 */
export function currentQuarterOnly(scan: ScanRow[]): ScanRow[] {
  const gl = globalLatestPeriod(scan.map((r) => r.period));
  return scan.filter((r) => r.period === gl);
}
```

5. 三个回退调用点改为过滤后传入：
- `mostHeld`：`computeMostHeld(excludeInactive(await scanAllManagers()), limit)`
- `notableMoves`：`computeNotableMoves(currentQuarterOnly(await scanAllManagers()), limit)`
- `holderDeltas`：`computeHolderDeltas(currentQuarterOnly(await scanAllManagers()))`

（`computeMostHeld`/`computeNotableMoves`/`computeHolderDeltas` 本体不动——过滤在入口，纯函数保持单一职责。）

- [ ] **Step 2: `web/scripts/lib/computeConsensus.ts` — DB 快照构建器同口径**

`computeAndStoreConsensus` 的 manager 循环改造。现循环体为"读 latest/prior → push scan"。改为先收集再过滤：

```ts
  const managers = await readAll(db, "managers", "cik,slug");
  type Raw = { slug: string; period: string; latestH: any[]; priorH: any[] };
  const raws: Raw[] = [];
  for (const m of managers) {
    const filings = await readAll(db, "filings", "id,period", (q) => q.eq("cik", m.cik).order("period", { ascending: false }).limit(2));
    if (!filings.length) continue;
    const latestH = await readAll(db, "holdings", "cusip,issuer,value,shares", (q) => q.eq("filing_id", filings[0].id));
    const priorH = filings[1] ? await readAll(db, "holdings", "cusip,issuer,value,shares", (q) => q.eq("filing_id", filings[1].id)) : [];
    raws.push({ slug: m.slug, period: filings[0].period, latestH, priorH });
  }

  // 新鲜度口径(与 src/lib/aggregations.ts 一致): inactive 全剔除; 非当季者 holdings 计入但 changes 清空。
  const gl = globalLatestPeriod(raws.map((r) => r.period));
  const scan: ScanInput[] = raws
    .filter((r) => freshness13F(r.period, gl) !== "inactive")
    .map((r) => ({
      slug: r.slug,
      holdings: r.latestH.map((h) => ({ cusip: h.cusip, issuer: h.issuer, value: Number(h.value) })),
      changes: r.period === gl ? diff(r.latestH, r.priorH) : [],
    }));
```

文件顶部加静态 import（跟随该文件自身惯例——它已用无 `.js` 后缀的静态 import 引 `../../src/lib/consensus/compute`；derive.ts 无 server-only，脚本可安全引）：

```ts
import { freshness13F, globalLatestPeriod } from "../../src/lib/freshness/derive";
```

- [ ] **Step 3: consensus 页脚标注 stale manager**

`web/src/app/[lang]/investors/consensus/page.tsx`，import 加：

```ts
import { freshness13F, globalLatestPeriod } from "@/lib/freshness/derive";
```

`managerCount` 之后加：

```ts
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  const staleManagers = idx.managers.filter((m) => freshness13F(m.period, globalLatest) === "stale");
```

`<div className="mt-3"><DataAsOfBadge lang={lang} /></div>` 之后加：

```tsx
          {staleManagers.length > 0 && (
            <p className="mt-2 text-xs text-[var(--tt-faint)]">
              {isZh
                ? `注：${staleManagers.map((m) => `${m.person}（数据截至 ${m.period}）`).join("、")} 的持仓按其最新申报计入，环比变动不计。`
                : `Note: ${staleManagers.map((m) => `${m.person} (as of ${m.period})`).join(", ")} counted per their latest filing; excluded from QoQ deltas.`}
            </p>
          )}
```

- [ ] **Step 4: buys/sells 页脚标注统计口径**

`web/src/app/[lang]/investors/_movesPage.tsx`：

1. import 加：

```ts
import { getManagerIndex } from "@/lib/managers/source";
import { freshness13F, globalLatestPeriod, quarterLag } from "@/lib/freshness/derive";
```

2. `MovesPage` 函数体内 `notableMoves(30)` 行改为并取 index：

```ts
  const [{ mostBought, mostSold }, idx] = await Promise.all([notableMoves(30), getManagerIndex()]);
  const globalLatest = globalLatestPeriod(idx.managers.map((m) => m.period));
  // 未计入名单 = period ≠ 全局最新季的所有人，与 currentQuarterOnly 口径精确互补。
  const lagged = idx.managers.filter((m) => m.period !== globalLatest);
```

3. `<div className="mt-3"><DataAsOfBadge lang={lang} /></div>` 之后加：

```tsx
          <p className="mt-2 text-xs text-[var(--tt-faint)]">
            {isZh
              ? `统计基准季：${globalLatest ?? "—"}。${lagged.length > 0 ? `未计入（最新申报更早）：${lagged.map((m) => `${m.person}（${m.period}）`).join("、")}。` : ""}`
              : `Baseline quarter: ${globalLatest ?? "—"}.${lagged.length > 0 ? ` Not counted (older latest filing): ${lagged.map((m) => `${m.person} (${m.period})`).join(", ")}.` : ""}`}
          </p>
```

- [ ] **Step 5: 重建 DB 快照使口径生效**

consensus_moves/consensus_holdings 是 Task 2 ingest 时按旧口径建的，重跑快照（不必重新 ingest）：

```bash
cd web && npm run consensus
```

Expected: `Consensus: holdings N 行, moves M 行` 正常输出。（若 `scripts/consensus.ts` 调用签名与 computeAndStoreConsensus 改动不符，按报错同步小改该入口文件。）

- [ ] **Step 6: 类型检查 + commit**

```bash
cd web && npx tsc --noEmit
git add web/src/lib/aggregations.ts web/scripts/lib/computeConsensus.ts "web/src/app/[lang]/investors/consensus/page.tsx" "web/src/app/[lang]/investors/_movesPage.tsx"
git commit -m "feat(freshness): 聚合双路径统一口径 — 变动只计当季申报者, inactive 剔除, 页脚标注"
```

---

## Task 6: 整体验证

- [ ] **Step 1: 自检 + 类型 + 构建**

```bash
cd web && npx tsx src/lib/freshness/derive.check.ts && npx tsc --noEmit && npm run build
```

Expected: 自检全过、零类型错误、build 成功（关注 `[slug]` 静态参数生成不再包含退役 slug）。

- [ ] **Step 2: 人工看页面**（`cd web && npm run dev`，或用 preview 工具）

| 页面 | 预期 |
|---|---|
| `/zh/investors/scion-asset-management` | 常显来源行 + amber「落后 2 季」警示；ConvictionPicks 仍渲染且标题旁有「基于 2025-09-30 数据」 |
| `/zh/investors/bridgewater-associates` | 8 季新数据、持仓表、conviction 正常、无警示（current） |
| `/zh/investors/berkshire-hathaway`（任一 current） | 只有常显来源行，无警示 |
| `/zh/investors/aquamarine` | 404 |
| `/zh/investors/ruane-cunniff`、`/zh/investors/greenlight-capital` | 退役 → 404；换 CIK → 新数据正常 |
| `/zh/investors/consensus` | 页脚有 stale 名单注（含 Burry）；榜单正常 |
| `/zh/investors/buys`、`/sells` | 页脚「统计基准季：2026-03-31」+ 未计入名单（含 Burry 2025-09-30） |
| 以上各页的 `/en/` 版 | 英文文案对应正确 |

- [ ] **Step 3: 复跑 Task 2 Step 7 的 SEC↔DB 比对**

Expected: `全部一致 ✓`（确认 Task 5 的 `npm run consensus` 等后续操作没碰坏 filings 数据——只读比对，快速安心）。

- [ ] **Step 4: 收尾**

用 superpowers:finishing-a-development-branch 决定合并方式（默认目标分支 `db-foundation`，PR 走 GitHub）。
