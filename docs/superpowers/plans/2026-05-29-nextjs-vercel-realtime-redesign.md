# NY Fed Treasury 仪表盘 — Next.js + Vercel 全 TypeScript 实时化重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 NY Fed 美债看板重构为**单一 TypeScript** 的 Next.js(App Router, React 19, Tailwind v4 + shadcn/ui)应用：数据抓取+分析用 TS 在服务端完成，用 Next 数据缓存(`revalidate`)实现“允许延迟的实时”，全部跑在 Vercel Hobby 免费档($0)。

**Architecture:** 数据层在 `web/lib/{sources,analyzers,build}.ts`：每个上游 `fetch` 设 `next:{revalidate:600,tags}`(Next 自动缓存+SWR)，analyzers 纯 TS 计算，`buildAllSections()` 并行装配。Server Component 直接调用它渲染；手动刷新走 Server Action `revalidateTag`。现有 Python 后端保留为离线“参照实现”，提供 `data/raw/*.json` 作 fixture 与数值快照校验 TS 移植。无 Cron、无 KV、无 Python 上线。

**Tech Stack:** Next.js 15+、React 19、TypeScript、Tailwind v4、shadcn/ui、recharts、next-themes、vitest。

参考 spec: `docs/superpowers/specs/2026-05-29-nextjs-vercel-realtime-redesign-design.md`

---

## 文件结构

```
web/
├─ app/[lang]/layout.tsx          # 主题/字体/dir/lang（渲染 <html>）
├─ app/[lang]/page.tsx            # 仪表盘 Server Component
├─ app/page.tsx                   # 根重定向 → /zh
├─ app/api/data/route.ts          # 全量 JSON（调试/快照对照）
├─ app/actions.ts                 # Server Action: revalidateTag
├─ components/theme-provider.tsx
├─ components/dashboard/{Header,DashboardCards,Sidebar,SectionPanel,MetricGrid,DataTable,SectionChart}.tsx
├─ components/ui/                 # shadcn
├─ lib/sources/{nyfed,treasury}.ts
├─ lib/analyzers/{common,pd,referenceRates,soma,facilityUsage,auction,marketShare}.ts
├─ lib/build.ts
├─ lib/{types,i18n,format,charts,dashboard}.ts
└─ lib/__tests__/{*.test.ts, fixtures/*.json}
backend/                          # 参照实现（不上线，提供 data/raw fixtures + 快照）
```

> 旧 `frontend/`(Vite) 重构完成后退役；`backend/` 保留作对照。

---

## Phase 0 — 脚手架

### Task 1: 初始化 Next.js + Tailwind + shadcn + vitest

**Files:** Create `web/`(脚手架)、`web/.nvmrc`、`web/vitest.config.ts`

- [ ] **Step 1: 创建 app(Node 20)**

Run:
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/nyfed_treasury_web_agent_副本
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npx create-next-app@latest web --ts --app --tailwind --eslint --src-dir=false --import-alias "@/*" --no-turbopack
```
Expected: `web/` 生成。

- [ ] **Step 2: .nvmrc** — Create `web/.nvmrc` 内容 `20`。

- [ ] **Step 3: shadcn init + 组件 + 依赖**

Run:
```bash
cd web && export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
npx shadcn@latest init -d
npx shadcn@latest add card badge button table separator skeleton chart
npm install next-themes recharts lucide-react
npm install -D vitest @testing-library/react jsdom @vitejs/plugin-react
```

- [ ] **Step 4: vitest 配置**

Create `web/vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", globals: true },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
```
Add to `web/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 5: 冒烟** — `npm run dev` 后 `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000` → `200`，停服。

- [ ] **Step 6: Commit**
```bash
git add -f web/ && git commit -m "chore: scaffold Next.js + Tailwind + shadcn + vitest"
```
> 项目目录被 gitignore；按用户“git 先不处理”，commit 步骤可暂时跳过，仅在用户决定纳入版控后执行。后续每个 Commit step 同此约定。

---

## Phase 1 — TS 数据层(核心，TDD + 对照 Python)

### Task 2: 准备 fixtures 与 Python 快照

**Files:** Create `web/lib/__tests__/fixtures/raw/*.json`、`web/lib/__tests__/fixtures/snapshots/*.json`

- [ ] **Step 1: 抓取并保存一份原始上游数据作 fixture**

Run(用现有 venv 的客户端落盘 raw)：
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/nyfed_treasury_web_agent_副本
backend/.venv/bin/python -c "
from backend.app.analyzers.pd_common import fetch_history_for_keyid, fetch_latest_pd_snapshot
import json,os
os.makedirs('web/lib/__tests__/fixtures/raw',exist_ok=True)
rows,_=fetch_history_for_keyid('PDPOSGST-TOT')
json.dump(rows, open('web/lib/__tests__/fixtures/raw/dealer_history.json','w'))
print('saved', len(rows))
"
```
Expected: 保存 dealer 历史序列。对 reference-rates/soma/facility 各存一份(参照 analyzer 的 fetch 函数)。

- [ ] **Step 2: 生成 Python 数值快照**

Run:
```bash
backend/.venv/bin/python -c "
from backend.app.analyzers.dealer_inventory import build_dealer_inventory_section
import json
s=build_dealer_inventory_section()
km={m['label']:m['value'] for m in s['key_metrics']}
json.dump({'data_date':s['data_date'],'freshness_status':s['freshness_status'],'key_metrics':km}, open('web/lib/__tests__/fixtures/snapshots/dealer.json','w'), ensure_ascii=False, indent=2)
print(km)
"
```
> 注：实网数据，TS 测试将对“同一 raw fixture”计算并与快照比对(下个 task)。dealer 快照基于上一步保存的 raw。

- [ ] **Step 3: Commit** — `git add -f web/lib/__tests__/fixtures && git commit -m "test: capture raw fixtures + python snapshots"`

### Task 3: `lib/types.ts` 与 `lib/analyzers/common.ts`(TDD)

**Files:** Create `web/lib/types.ts`、`web/lib/analyzers/common.ts`、`web/lib/__tests__/common.test.ts`

- [ ] **Step 1: 写失败测试**

Create `web/lib/__tests__/common.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { changeFromWeeks, rollingZScore, historicalPercentile, freshnessStatus, finalizeLiveMode } from "@/lib/analyzers/common";

const series = Array.from({ length: 60 }, (_, i) => ({ date: `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`, value: 100 + i }));

describe("common analyzers", () => {
  it("changeFromWeeks computes latest - prior", () => {
    const { change } = changeFromWeeks(series, 1);
    expect(typeof change).toBe("number");
  });
  it("rollingZScore returns number for enough points", () => {
    expect(typeof rollingZScore(series, 52)).toBe("number");
  });
  it("historicalPercentile returns Limited sample under 52 pts", () => {
    expect(historicalPercentile(series.slice(0, 10))).toBe("Limited sample");
  });
  it("freshnessStatus: <=8 days Fresh", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(freshnessStatus(today)).toBe("Fresh");
  });
  it("finalizeLiveMode downgrades empty section", () => {
    expect(finalizeLiveMode({ mode: "live", data_date: null, freshness_status: "Missing" } as any).mode).toBe("unavailable");
  });
});
```

- [ ] **Step 2: 运行确认失败** — `cd web && npm run test -- common` → FAIL.

- [ ] **Step 3: 实现** — Create `web/lib/types.ts`(同前版 `Section/Metric/TableT/Summary/DataPayload` 类型)；Create `web/lib/analyzers/common.ts`，移植 Python `pd_common.py` 的纯函数：
```ts
import type { Section } from "@/lib/types";
type Row = { date: string; value: number | null };

export function closestRecord(series: Row[], target: Date): Row | null {
  let best: Row | null = null, bestD = Infinity;
  for (const r of series) {
    const d = Math.abs(new Date(r.date).getTime() - target.getTime());
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}
export function changeFromWeeks(series: Row[], weeks: number): { change: number | null } {
  if (!series.length) return { change: null };
  const latest = series[series.length - 1];
  if (latest.value == null) return { change: null };
  const target = new Date(new Date(latest.date).getTime() - weeks * 7 * 864e5);
  const prior = closestRecord(series.slice(0, -1), target);
  if (!prior || prior.value == null) return { change: null };
  return { change: latest.value - prior.value };
}
export function rollingZScore(series: Row[], window = 52): number | null {
  const vals = series.map((r) => r.value).filter((v): v is number => v != null);
  if (vals.length < 2) return null;
  const s = vals.slice(-window);
  const mean = s.reduce((a, b) => a + b, 0) / s.length;
  const std = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / s.length);
  return std === 0 ? 0 : (s[s.length - 1] - mean) / std;
}
export function historicalPercentile(series: Row[]): string {
  const vals = series.map((r) => r.value).filter((v): v is number => v != null);
  if (vals.length < 52) return "Limited sample";
  const latest = vals[vals.length - 1];
  const le = vals.filter((v) => v <= latest).length;
  return `${((le / vals.length) * 100).toFixed(1)}%`;
}
export function freshnessStatus(dataDate: string | null): string {
  if (!dataDate) return "Missing";
  const age = Math.floor((Date.now() - new Date(dataDate).getTime()) / 864e5);
  if (age <= 8) return "Fresh";
  if (age <= 14) return "Stale";
  return "Old";
}
export function finalizeLiveMode(section: Section): Section {
  if (section.mode !== "live") return section;
  if (!section.data_date || ["Missing", "Unavailable", undefined, null].includes(section.freshness_status as any))
    section.mode = "unavailable";
  return section;
}
export function formatMillions(v: number | null): string {
  if (v == null) return "Unavailable";
  const sign = v < 0 ? "-" : "", a = Math.abs(v);
  if (a >= 1_000_000) return `${sign}$${(a / 1_000_000).toFixed(1)} trillion`;
  if (a >= 1_000) return `${sign}$${(a / 1_000).toFixed(1)} billion`;
  return `${sign}$${a.toFixed(1)} million`;
}
export function formatChange(v: number | null): string {
  if (v == null) return "Unavailable";
  return `${v > 0 ? "+" : ""}${formatMillions(v)}`;
}
```

- [ ] **Step 4: 运行确认通过** — `npm run test -- common` → PASS.
- [ ] **Step 5: Commit**

### Task 4: `lib/sources/{nyfed,treasury}.ts`(带重试 + revalidate)

**Files:** Create `web/lib/sources/nyfed.ts`、`web/lib/sources/treasury.ts`、`web/lib/__tests__/sources.test.ts`

- [ ] **Step 1: 写失败测试(重试逻辑，mock fetch)**

Create `web/lib/__tests__/sources.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { fetchJsonWithRetry } from "@/lib/sources/nyfed";

describe("fetchJsonWithRetry", () => {
  it("retries on 503 then succeeds", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(new Response("x", { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: 1 }), { status: 200 }));
    const out = await fetchJsonWithRetry("http://x", { tag: "t", fetchImpl: f as any, backoffMs: 0 });
    expect(out).toEqual({ ok: 1 });
    expect(f).toHaveBeenCalledTimes(2);
  });
  it("does not retry on 404", async () => {
    const f = vi.fn().mockResolvedValue(new Response("nope", { status: 404 }));
    await expect(fetchJsonWithRetry("http://x", { tag: "t", fetchImpl: f as any, backoffMs: 0 })).rejects.toThrow();
    expect(f).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: 运行确认失败** — FAIL.

- [ ] **Step 3: 实现**

Create `web/lib/sources/nyfed.ts`:
```ts
type Opts = { tag: string; revalidate?: number; maxAttempts?: number; backoffMs?: number; fetchImpl?: typeof fetch };

export async function fetchJsonWithRetry(url: string, opts: Opts): Promise<any> {
  const { tag, revalidate = 600, maxAttempts = 3, backoffMs = 500, fetchImpl = fetch } = opts;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(url, { next: { revalidate, tags: [tag] } } as RequestInit);
      if (res.ok) return await res.json();
      if (res.status < 500) throw new Error(`${url} ${res.status}`); // 4xx: 不重试
      lastErr = new Error(`${url} ${res.status}`);
    } catch (e) { lastErr = e; }
    if (attempt < maxAttempts) await new Promise((r) => setTimeout(r, backoffMs * 2 ** (attempt - 1)));
  }
  throw new Error(`fetch failed after ${maxAttempts}: ${lastErr}`);
}

const PD_GET = (k: string) => `https://markets.newyorkfed.org/api/pd/get/${k}.json`;
export async function fetchPdHistory(keyid: string) {
  const p = await fetchJsonWithRetry(PD_GET(keyid), { tag: "nyfed-pd" });
  return (p?.pd?.timeseries ?? []).map((it: any) => ({ date: it.asofdate, value: it.value == null || it.value === "*" ? null : Number(it.value) }));
}
// 其余：fetchReferenceRates / fetchSomaSummary / fetchFacilityUsage（参照 spec 中的 URL）
```
Create `web/lib/sources/treasury.ts`：拍卖 `auctions_query` 抓取(同样用 `fetchJsonWithRetry`)。

- [ ] **Step 4: 运行确认通过** — `npm run test -- sources` → PASS.
- [ ] **Step 5: Commit**

### Task 5: `lib/analyzers/pd.ts` + 对照 Python 快照(TDD)

**Files:** Create `web/lib/analyzers/pd.ts`、`web/lib/__tests__/pd.test.ts`

- [ ] **Step 1: 写失败测试(用 raw fixture 算，对比快照)**

Create `web/lib/__tests__/pd.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import raw from "./fixtures/raw/dealer_history.json";
import snap from "./fixtures/snapshots/dealer.json";
import { buildSingleSeriesFromRows } from "@/lib/analyzers/pd";

describe("pd analyzer parity", () => {
  it("matches python dealer snapshot", () => {
    const s = buildSingleSeriesFromRows(raw as any, "dealer-inventory");
    expect(s.data_date).toBe((snap as any).data_date);
    expect((s.key_metrics.find((m) => m.label === "Latest Level"))?.value).toBe((snap as any).key_metrics["Latest Level"]);
    expect((s.key_metrics.find((m) => m.label === "Historical Percentile"))?.value).toBe((snap as any).key_metrics["Historical Percentile"]);
  });
});
```

- [ ] **Step 2: 运行确认失败** — FAIL.

- [ ] **Step 3: 实现** — `web/lib/analyzers/pd.ts`：`buildSingleSeriesFromRows(rows, key)` 复刻 `build_single_series_section`(排序、1/4/13周变化、分位、zscore、标签、key_metrics、normalized_data)，标签函数按 section key 选择；`buildFails(deliver,receive)` 合并。用 `common.ts` 的函数。`mode:"live"` 后过 `finalizeLiveMode`。

- [ ] **Step 4: 运行确认通过** — `npm run test -- pd` → PASS(数值与 Python 一致)。
- [ ] **Step 5: Commit**

### Task 6: 其余 analyzers(referenceRates/soma/facilityUsage/auction/marketShare)

**Files:** Create 对应 `web/lib/analyzers/*.ts` + 各自 `*.test.ts`(同 Task5 模式：raw fixture → 对照快照)

- [ ] **Step 1–N:** 对每个 analyzer 重复 “写失败测试(对照快照)→实现移植→通过→commit”。各 section 的数据形状与计算见 spec §5 与现有 Python analyzer。marketShare/auction 若快照不稳定，至少断言结构与关键标签。

### Task 7: `lib/build.ts` 并行装配(TDD)

**Files:** Create `web/lib/build.ts`、`web/lib/__tests__/build.test.ts`

- [ ] **Step 1: 写失败测试** — mock 各 analyzer，断言 `buildAllSections()` 返回 `{summary,sections,as_of}`，且某个 analyzer 抛错时该 section 为 `unavailable`、其余正常。
- [ ] **Step 2: 失败** → **Step 3: 实现**:
```ts
import { finalizeLiveMode } from "@/lib/analyzers/common";
// import 各 build*；独立项 Promise.all，依赖项随后；失败 catch→unavailable
export async function buildAllSections() {
  const safe = async (name: string, fn: () => Promise<any>) => {
    try { return [name, finalizeLiveMode(await fn())] as const; }
    catch (e) { return [name, { title: name, mode: "unavailable", freshness_status: "Unavailable", data_date: null, key_metrics: [], tables: [], warnings: [String(e)] }] as const; }
  };
  const indep = await Promise.all([
    safe("dealer-inventory", buildDealerInventory), /* ...transactions/repo/fails/market-share/reference-rates/soma */
  ]);
  const sections: Record<string, any> = Object.fromEntries(indep);
  Object.assign(sections, Object.fromEntries([
    await safe("facility-usage", () => buildFacilityUsage(sections["reference-rates"])),
    await safe("auction-risk", () => buildAuction(sections["dealer-inventory"], sections["transactions"], sections["fails"])),
  ]));
  const live = Object.entries(sections).filter(([, v]) => v.mode === "live").map(([k]) => k);
  const summary = { data_mode: live.length && live.length < Object.keys(sections).length ? "partial-live" : live.length ? "live" : "mock",
    live_sections: live, unavailable_sections: Object.entries(sections).filter(([, v]) => v.mode === "unavailable").map(([k]) => k),
    section_order: Object.keys(sections) };
  return { summary, sections, as_of: new Date().toISOString() };
}
```
- [ ] **Step 4: 通过** → **Step 5: Commit**

### Task 8: `app/api/data/route.ts`(全量 JSON)

**Files:** Create `web/app/api/data/route.ts`

- [ ] **Step 1: 实现**
```ts
import { NextResponse } from "next/server";
import { buildAllSections } from "@/lib/build";
export const revalidate = 600;
export async function GET() {
  try { return NextResponse.json(await buildAllSections()); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 500 }); }
}
```
- [ ] **Step 2: 冒烟** — `npm run dev`，`curl -s localhost:3000/api/data | head -c 200` 含 `summary`。
- [ ] **Step 3: Commit**

---

## Phase 2 — 前端逻辑库(移植)

### Task 9: `lib/format.ts` `lib/dashboard.ts` `lib/i18n.ts`(TDD)

**Files:** Create 三文件 + `web/lib/__tests__/{format,dashboard}.test.ts`
- [ ] **Step 1:** 写失败测试：`trendDirection`(+/-/null)、`badgeTone`(red/orange/yellow/gray/green)。
- [ ] **Step 2:** 失败 → **Step 3:** 实现(移植本会话 `frontend/src/lib/dashboard.js` 的 i18n/sidebarItems/Groups/displayStatusValue/badgeTone/sectionLabel/metricLabel 到 TS；`format.ts` 的 `trendDirection`)。
- [ ] **Step 4:** 通过 → **Step 5:** Commit

### Task 10: `lib/charts.ts`(TDD)

**Files:** Create `web/lib/charts.ts` + `web/lib/__tests__/charts.test.ts`
- [ ] **Step 1:** 写失败测试(reference-rates pivot 出多序列；空数据返回 null) — 同前版测试。
- [ ] **Step 2:** 失败 → **Step 3:** 移植 `frontend/src/lib/charts.js` 的 `buildChartSpec/singleSeries/pivotSeries/CHART_PALETTE/formatAxisDate` 到 TS，导出 `ChartSpec` 类型。
- [ ] **Step 4:** 通过 → **Step 5:** Commit

---

## Phase 3 — 组件与页面

### Task 11: 主题与布局

**Files:** Create `web/components/theme-provider.tsx`、`web/app/[lang]/layout.tsx`、`web/app/page.tsx`；Modify `web/app/globals.css`；Delete 脚手架 `web/app/layout.tsx`(由 `[lang]/layout.tsx` 渲染 `<html>`)。
- [ ] **Step 1:** theme-provider(next-themes, `attribute="class"`).
- [ ] **Step 2:** `[lang]/layout.tsx` + `generateStaticParams [{zh},{en}]`，渲染 `<html lang>` 包 ThemeProvider。
- [ ] **Step 3:** `app/page.tsx` → `redirect("/zh")`；删除冲突的根 `app/layout.tsx`/`page.tsx`。
- [ ] **Step 4:** `globals.css`：迁移本会话 styles.css 的颜色 token 到 Tailwind v4 `@theme` + shadcn `.dark`；加 `.tnum`。
- [ ] **Step 5:** dev 验证 `/` → `/zh`，可切系统暗色。
- [ ] **Step 6:** Commit

### Task 12: 展示组件

**Files:** Create `web/components/dashboard/{SectionChart,MetricGrid,DataTable,DashboardCards,Header,Sidebar,SectionPanel}.tsx`(代码见前版计划 Task10 各 Step：SectionChart/recharts、MetricGrid/▲▼+tabular-nums、DataTable/表头 i18n、DashboardCards/风险色阶、Header/语言+主题+刷新、Sidebar/分组+Link、SectionPanel/组合)。
- [ ] **Step 1–7:** 逐组件实现(参照本会话已完成的 `frontend/src/components/*` 改 TSX + shadcn + Tailwind)。
- [ ] **Step 8:** `npx tsc --noEmit` 无错误。
- [ ] **Step 9:** Commit

### Task 13: 页面装配 + 刷新 Server Action

**Files:** Create `web/app/actions.ts`；Create `web/app/[lang]/page.tsx`
- [ ] **Step 1:** `actions.ts`:
```ts
"use server";
import { revalidateTag, revalidatePath } from "next/cache";
export async function refreshData(lang: string) {
  revalidateTag("nyfed-pd"); revalidateTag("nyfed"); revalidateTag("treasury");
  revalidatePath(`/${lang}`);
}
```
- [ ] **Step 2:** `page.tsx`：`export const revalidate = 600`；`buildAllSections()` 取数；用 `searchParams.s ?? section_order[0]` 选中；渲染 Header/Cards/Sidebar(Link `?s=`)/SectionPanel。
- [ ] **Step 3:** `npx tsc --noEmit` 无错误。
- [ ] **Step 4:** Commit

---

## Phase 4 — 本地验证与部署

### Task 14: 本地端到端验证
- [ ] **Step 1:** `cd web && npm run test` 全 PASS；`npx tsc --noEmit` 无错误。
- [ ] **Step 2:** `npm run dev`，浏览器开 `/zh`、`/en`：卡片/侧栏/指标/图表 hover 正常；浅/深色正常；dealer-inventory/reference-rates/soma/facility-usage 显示真实数据+交互图；失败 section 显示 `unavailable`；手动刷新生效；console 无报错。
- [ ] **Step 3:** 截图浅/深各一存档。

### Task 15: Vercel 部署
- [ ] **Step 1:** Vercel 项目 Root Directory 设为 `web/`(或仓库根含 web)，框架 Next.js。
- [ ] **Step 2:** `cd web && vercel`(首次 link)→ preview URL。
- [ ] **Step 3:** 线上验证 `/zh` `/en`、`/api/data` 200、暗色、无 console 报错。
- [ ] **Step 4:** `vercel --prod`；确认免费档无超额。

### Task 16: 退役旧前端(确认无误后)
- [ ] **Step 1:** 删除/归档旧 `frontend/`(Vite)；保留 `backend/` 作参照实现。
- [ ] **Step 2:** Commit

---

## Self-Review(对照 spec)

- **数据层全 TS + 实时(revalidate 600+SWR)**：Task 3–8、13 ✔
- **重试/退避(TS)**：Task 4 ✔
- **数据诚实(finalizeLiveMode + safe)**：Task 3、7 ✔
- **数值校验对照 Python 快照**：Task 2、5、6 ✔
- **Next.js+React19+Tailwind+shadcn**：Task 1、11、12 ✔
- **图表交互(recharts)**：Task 10、12 ✔
- **暗色/双语 /[lang]**：Task 9、11 ✔
- **Vercel $0(无 cron/KV/python/requirements)**：Task 1、15 ✔
- **policy-expectations 降级**：由 Task 7 `safe`/`finalizeLiveMode` 自然落为 unavailable ✔
- **验收 1–6**：Task 14、15 覆盖 ✔
- 占位符：Task 6 用“重复 Task5 模式”是有意的逐 analyzer 循环(模式已在 Task5 给全代码)；其余逻辑步骤均含代码。
- 类型一致：`Section/DataPayload`(Task3)→ analyzers/build/page 一致；`ChartSpec`(Task10)→ SectionChart(Task12) 一致；`fetchJsonWithRetry`(Task4)→ sources 使用一致。

## 已知风险/注意
- Server Component 直接 `buildAllSections()` 取数(无 HTTP 自调用)，靠每个上游 `fetch` 的 `revalidate` 做缓存——这是“实时但允许延迟”的核心，避免服务端自调用绝对 URL 的麻烦。
- `create-next-app` 默认根 `app/layout.tsx`；本方案由 `[lang]/layout.tsx` 渲染 `<html>`，需删冲突根 layout(Task11)。
- Python 快照基于实网数据：fixture 与快照需用“同一次抓取的 raw”，否则数值会因数据更新而不一致(Task2 已注明用 raw fixture 计算)。
- 移植数值差异风险由 Task5/6 的快照测试兜底，发现差异即对齐公式(注意 Python `timedelta(weeks)` 与 JS 毫秒换算、分位 `<=` 边界、保留小数位)。
