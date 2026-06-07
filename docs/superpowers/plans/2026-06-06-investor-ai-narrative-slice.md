# 投资者页 AI 叙述竖切 v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为超级投资者页生成「本季调仓」AI 人话叙述（中英、批量预生成、缓存到库），服务端渲染进 HTML 供 Google 收录与 AI 引擎引用。

**Architecture:** 生成走**受 token 保护的 Next API 路由**（跑在 Next 服务端运行时，可用 server-only 的 `getManagerDetail` 拿现成 `changes` 动作 diff），用 **AI SDK + Vercel AI Gateway**（DeepSeek 模型）生成 `{judgment_line, moves[]}`，写 `ai_analysis_cache`，key=`investor:<slug>:<period>:<lang>`。投资者页 Server Component 读缓存、SSR 渲染叙述层（与事实层视觉分离 + 披露注脚）；无缓存/无 env 优雅降级。纯逻辑（payload 构造 + 响应解析）拆为无依赖模块走 vitest。**不改**宏观 `deepseek.ts`。

**Tech Stack:** Next.js 16 / TypeScript、`ai`(AI SDK，走 Gateway)、`@supabase/supabase-js`(已装)、vitest(纯逻辑)。

**参考 spec:** `docs/superpowers/specs/2026-06-06-investor-ai-narrative-slice-design.md`

> **用户偏好:** 主要验收 = `npm run build` 通过；测试精简（只测纯逻辑）；真实 Gateway/DB 写入为「手动验证关卡」。
>
> **价值观护栏(记忆 `valuation-philosophy-constraint`):** 叙述只描述动作，**禁买卖/目标价/估值判断**；judgment_line 不评贵贱。
>
> **关键修正(写计划时检查发现):** ① 生成**不能用 tsx 脚本**——`import "server-only"` 在 tsx 下报错，而 `getManagerDetail` 链路是 server-only。改用 **Next API 路由**（项目既有范式 = `/api/refresh-ai-analysis`）。② 不直连 DeepSeek，改走 **AI Gateway**（静态 `AI_GATEWAY_API_KEY`，模型 `deepseek/*`）。
>
> **并发协调:** 与并行 `phase1b-managers-consensus` 共用工作树。执行前**先用 `superpowers:using-git-worktrees` 开独立 worktree**（基于最新 `db-foundation`），避免互踩。

---

## 环境/约定

- App root: `web/`（`src/` 布局；`@/*` → `web/src/*`）。
- Node 20: 命令前置 `export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"`。
- **生成所需 env**（路由在 Next 运行时读）：本地放 `web/.env.local`（Next 只读 `web/.env.local`，不读仓库根）：`SUPABASE_URL` / `SUPABASE_SERVICE_KEY` / `AI_GATEWAY_API_KEY` / `NARRATIVE_REFRESH_TOKEN`（自取一串随机串）/ 可选 `NARRATIVE_MODEL`。生产则在 Vercel 项目 env 配同名变量。
- 已实测数据形状：
  - `getManagerDetail(slug)` → `{ manager:{person,name,slug}, latest:{holdings:Holding[], totalValue, period, filedAt}, prior?, changes: HoldingChange[] }`。
  - `HoldingChange = { cusip, issuer, kind:"new"|"exited"|"increased"|"decreased", prevShares, shares, value, deltaPct:number|null }`。
  - `Holding = { cusip, issuer, value, shares, weight?:number, ... }`。
  - `ai_analysis_cache (id, page_key, analysis_json jsonb, model, source_data_timestamp, created_at)`。
  - `config/managers.json` = `Array<{cik,slug,person}>`（34 户）。
  - `db.ts` 导出 `hasSupabaseEnv()` / `getDb()`（**非** server-only）。

## 文件结构

```
web/src/lib/ai/investorNarrative.ts            纯逻辑: 类型+payload构造+响应解析+prompt+key (无server-only/ai/db)  [新建]
web/src/lib/ai/investorNarrative.test.ts        vitest                                                          [新建]
web/src/lib/ai/investorNarrativeServer.ts       server-only: AI SDK 生成并写库 + react.cache 读缓存             [新建]
web/src/app/api/refresh-investor-narratives/route.ts   受 token 保护的 POST 生成路由                            [新建]
web/src/components/entity/InvestorNarrative.tsx 叙述层 Server Component(判决条+moves+披露注脚)                  [新建]
web/src/components/entity/EntityPage.tsx        新增可选 aiNarrative?:ReactNode                                 [改]
web/src/app/[lang]/investors/[slug]/page.tsx    服务端读缓存→传 aiNarrative; description 用 judgment_line       [改]
web/package.json                                 加依赖 ai                                                       [改]
```

---

## Task 1: 纯逻辑 — payload 构造 + 响应解析（TDD）

**Files:**
- Create: `web/src/lib/ai/investorNarrative.ts`
- Test: `web/src/lib/ai/investorNarrative.test.ts`

- [ ] **Step 1: 写失败测试**

`web/src/lib/ai/investorNarrative.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  buildMovesPayload,
  parseInvestorNarrative,
  narrativeKey,
  type ManagerDetailLike,
} from "./investorNarrative";

const detail: ManagerDetailLike = {
  manager: { person: "Warren Buffett", name: "Berkshire Hathaway", slug: "berkshire-hathaway" },
  latest: {
    period: "2024 Q4",
    totalValue: 300_000_000_000,
    filedAt: "2025-02-14",
    holdings: [
      { issuer: "APPLE INC", value: 75_000_000_000, weight: 0.25 },
      { issuer: "BANK OF AMERICA", value: 30_000_000_000, weight: 0.1 },
    ],
  },
  changes: [
    { issuer: "OCCIDENTAL PETROLEUM", value: 12_000_000_000, deltaPct: 0.2, kind: "increased" },
    { issuer: "APPLE INC", value: 75_000_000_000, deltaPct: -0.13, kind: "decreased" },
    { issuer: "ULTA BEAUTY", value: 200_000_000, deltaPct: null, kind: "new" },
    { issuer: "PARAMOUNT", value: 0, deltaPct: null, kind: "exited" },
  ],
};

describe("buildMovesPayload", () => {
  it("提炼经理人/季度/组合规模 + 动作(按市值降序, 截断) + top 持仓", () => {
    const p = buildMovesPayload(detail, 10);
    expect(p.person).toBe("Warren Buffett");
    expect(p.name).toBe("Berkshire Hathaway");
    expect(p.period).toBe("2024 Q4");
    expect(p.portfolio_value).toBe(300_000_000_000);
    expect(p.moves[0]).toEqual({ issuer: "APPLE INC", kind: "decreased", delta_pct: -0.13, value: 75_000_000_000 });
    expect(p.moves.map((m) => m.kind)).toContain("new");
    expect(p.moves.map((m) => m.kind)).toContain("exited");
    expect(p.top_holdings[0]).toEqual({ issuer: "APPLE INC", weight: 0.25 });
  });

  it("limit 截断动作数", () => {
    expect(buildMovesPayload(detail, 2).moves).toHaveLength(2);
  });
});

describe("narrativeKey", () => {
  it("拼 page_key", () => {
    expect(narrativeKey("berkshire-hathaway", "2024 Q4", "zh")).toBe("investor:berkshire-hathaway:2024 Q4:zh");
  });
});

describe("parseInvestorNarrative", () => {
  it("解析裸 JSON → 校验 judgment_line + moves", () => {
    const text = JSON.stringify({
      judgment_line: "本季减持苹果约 13%，加仓西方石油。",
      moves: [{ issuer: "APPLE INC", action: "减仓", why: "持续兑现部分科技仓位" }],
      confidence: "medium",
      limitations: ["基于公开 13F，滞后一个季度"],
    });
    const r = parseInvestorNarrative(text);
    expect(r.judgment_line).toContain("苹果");
    expect(r.moves[0]).toEqual({ issuer: "APPLE INC", action: "减仓", why: "持续兑现部分科技仓位" });
    expect(r.confidence).toBe("medium");
  });

  it("解析带 ```json 围栏的输出", () => {
    const text = "```json\n{\"judgment_line\":\"x\",\"moves\":[],\"confidence\":\"low\",\"limitations\":[]}\n```";
    expect(parseInvestorNarrative(text).judgment_line).toBe("x");
  });

  it("非法 confidence 归一为 low", () => {
    const text = JSON.stringify({ judgment_line: "x", moves: [], confidence: "bananas", limitations: [] });
    expect(parseInvestorNarrative(text).confidence).toBe("low");
  });

  it("缺 judgment_line 抛错", () => {
    const text = JSON.stringify({ moves: [], confidence: "low", limitations: [] });
    expect(() => parseInvestorNarrative(text)).toThrow();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npx vitest run src/lib/ai/investorNarrative.test.ts
```
Expected: FAIL（`Cannot find module './investorNarrative'`）。

- [ ] **Step 3: 写实现（纯逻辑，无 server-only/ai/db 依赖）**

`web/src/lib/ai/investorNarrative.ts`:
```ts
// 纯逻辑(无 server-only / 无 ai / 无 db): 投资者叙述的 payload 构造、响应解析、prompt。
// 可被路由(服务端)与脚本/测试共同导入。

export type Lang = "zh" | "en";

export type ManagerDetailLike = {
  manager: { person: string; name: string; slug: string };
  latest: {
    period: string;
    totalValue: number;
    filedAt: string;
    holdings: { issuer: string; value: number; weight?: number | null }[];
  };
  changes: {
    issuer: string;
    value: number;
    deltaPct?: number | null;
    kind: "new" | "exited" | "increased" | "decreased";
  }[];
};

export type MovesPayload = {
  person: string;
  name: string;
  period: string;
  portfolio_value: number;
  top_holdings: { issuer: string; weight: number | null }[];
  moves: { issuer: string; kind: string; delta_pct: number | null; value: number }[];
};

export type InvestorNarrativeData = {
  judgment_line: string;
  moves: { issuer: string; action: string; why: string }[];
  confidence: "low" | "medium" | "high";
  limitations: string[];
};

export function narrativeKey(slug: string, period: string, lang: Lang): string {
  return `investor:${slug}:${period}:${lang}`;
}

export function buildMovesPayload(d: ManagerDetailLike, limit = 12): MovesPayload {
  const moves = [...d.changes]
    .sort((a, b) => b.value - a.value)
    .slice(0, limit)
    .map((c) => ({ issuer: c.issuer, kind: c.kind, delta_pct: c.deltaPct ?? null, value: c.value }));
  const top_holdings = [...d.latest.holdings]
    .sort((a, b) => b.value - a.value)
    .slice(0, 10)
    .map((h) => ({ issuer: h.issuer, weight: h.weight ?? null }));
  return {
    person: d.manager.person,
    name: d.manager.name,
    period: d.latest.period,
    portfolio_value: d.latest.totalValue,
    top_holdings,
    moves,
  };
}

export function systemPrompt(lang: Lang): string {
  const common = [
    "You explain a superinvestor's quarterly 13F portfolio changes in plain language.",
    "Use ONLY the provided JSON numbers. Never invent tickers, sizes, or facts.",
    "Describe ACTIONS ONLY (added / trimmed / new / exited / concentration shifts).",
    "STRICTLY FORBIDDEN: buy/sell/hold ratings, price targets, valuation judgments (cheap/expensive), technical or sentiment signals.",
    "This is a lagged, post-hoc read of a public SEC 13F filing — acknowledge it may be incomplete and is not investment advice.",
    "Tone: a restrained financial wire editor. No emoji, no filler like 'let me analyze'.",
    "Output STRICT JSON only, no Markdown.",
  ];
  const langLine =
    lang === "zh"
      ? "Write all output text in Simplified Chinese, cautious wording (可能/或反映/需结合其他信息)."
      : "Write all output text in English, cautious wording (may / could reflect / subject to other information).";
  return [...common, langLine].join("\n");
}

export function userPrompt(payload: MovesPayload): string {
  return [
    "请基于以下 JSON 生成严格 JSON（不要 Markdown）。输出格式：",
    JSON.stringify({
      judgment_line: "一句话总结本季调仓动作；不含估值、不含买卖建议",
      moves: [{ issuer: "...", action: "建仓|加仓|减仓|清仓", why: "一句为什么/组合在讲什么故事；仅在有事实支撑处说话" }],
      confidence: "low | medium | high",
      limitations: ["..."],
    }),
    "唯一允许使用的数据：",
    JSON.stringify(payload),
  ].join("\n\n");
}

export function parseInvestorNarrative(text: string): InvestorNarrativeData {
  const trimmed = text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  const jsonText = start >= 0 && end >= start ? trimmed.slice(start, end + 1) : trimmed;
  const parsed = JSON.parse(jsonText) as Partial<InvestorNarrativeData>;

  if (typeof parsed.judgment_line !== "string" || !parsed.judgment_line.trim()) {
    throw new Error("investor narrative missing judgment_line");
  }
  const moves = Array.isArray(parsed.moves)
    ? parsed.moves
        .filter(
          (m): m is { issuer: string; action: string; why: string } =>
            Boolean(m) && typeof m.issuer === "string" && typeof m.action === "string" && typeof m.why === "string"
        )
        .slice(0, 12)
    : [];
  const confidence = ["low", "medium", "high"].includes(String(parsed.confidence))
    ? (parsed.confidence as "low" | "medium" | "high")
    : "low";
  const limitations = Array.isArray(parsed.limitations)
    ? parsed.limitations.filter((x): x is string => typeof x === "string")
    : [];
  return { judgment_line: parsed.judgment_line.trim(), moves, confidence, limitations };
}
```

- [ ] **Step 4: 运行确认通过**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npx vitest run src/lib/ai/investorNarrative.test.ts
```
Expected: PASS（7 用例）。

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/ai/investorNarrative.ts web/src/lib/ai/investorNarrative.test.ts
git commit -m "feat(ai): 投资者叙述纯逻辑(payload/prompt/解析) + 单测"
```

---

## Task 2: 安装 AI SDK + 服务端生成/读取模块

**Files:**
- Modify: `web/package.json`（加依赖 `ai`）
- Create: `web/src/lib/ai/investorNarrativeServer.ts`

- [ ] **Step 1: 安装 AI SDK**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npm install --legacy-peer-deps ai
```
Expected: 装上 `ai`（v6+）。`.npmrc` 已含 `legacy-peer-deps=true`，无 peer 冲突。

- [ ] **Step 2: 核准 DeepSeek 模型 slug（手动验证关卡）**

> 需 `web/.env.local` 含 `AI_GATEWAY_API_KEY`。AI Gateway 的 slug 会变，**不要猜**——列出再选。
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npx tsx -e "
import { gateway } from 'ai';
const ms = await gateway.getAvailableModels();
console.log(ms.models.filter(m => m.id.startsWith('deepseek/')).map(m => m.id).join('\n'));
" 2>&1 | tail -10
```
Expected: 打印若干 `deepseek/...` slug。挑一个文本对话模型（如 `deepseek/deepseek-v3.x`），记下作为 `NARRATIVE_MODEL` 写入 `web/.env.local`（缺省时实现里兜底用打印出来的其一）。

- [ ] **Step 3: 写服务端模块**

`web/src/lib/ai/investorNarrativeServer.ts`:
```ts
import "server-only";
import { cache } from "react";
import { generateText } from "ai";
import { getDb, hasSupabaseEnv } from "@/lib/managers/db";
import {
  buildMovesPayload,
  parseInvestorNarrative,
  systemPrompt,
  userPrompt,
  narrativeKey,
  type ManagerDetailLike,
  type InvestorNarrativeData,
  type Lang,
} from "./investorNarrative";

// 缺省模型: 用 Task 2 Step 2 核出的 slug 替换（保持可被 env 覆盖）
const DEFAULT_MODEL = "deepseek/deepseek-v3.2-exp";

/** 调 AI Gateway 生成并写库。缺 env 抛错（路由捕获）。 */
export async function generateAndCacheNarrative(
  d: ManagerDetailLike,
  lang: Lang
): Promise<InvestorNarrativeData> {
  if (!process.env.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY not configured");
  if (!hasSupabaseEnv()) throw new Error("Supabase env not configured");

  const model = process.env.NARRATIVE_MODEL || DEFAULT_MODEL;
  const payload = buildMovesPayload(d);

  const { text } = await generateText({
    model, // 纯 "provider/model" 字符串 → 自动走 AI Gateway
    temperature: 0.2,
    system: systemPrompt(lang),
    prompt: userPrompt(payload),
  });
  const data = parseInvestorNarrative(text);

  const { error } = await getDb().from("ai_analysis_cache").insert({
    page_key: narrativeKey(d.manager.slug, d.latest.period, lang),
    analysis_json: data,
    model,
    source_data_timestamp: d.latest.filedAt,
  });
  if (error) throw new Error(`cache insert failed: ${error.message}`);
  return data;
}

/** 读最新缓存叙述。无 env / 无缓存 → null。每次渲染缓存一次。 */
export const getInvestorNarrative = cache(
  async (slug: string, period: string, lang: Lang): Promise<InvestorNarrativeData | null> => {
    if (!hasSupabaseEnv()) return null;
    const { data, error } = await getDb()
      .from("ai_analysis_cache")
      .select("analysis_json")
      .eq("page_key", narrativeKey(slug, period, lang))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.analysis_json as InvestorNarrativeData;
  }
);
```
> 把 `DEFAULT_MODEL` 改成 Task 2 Step 2 核出的真实 slug。

- [ ] **Step 4: 类型校验**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npx vitest run src/lib/ai/investorNarrative.test.ts && npx tsc --noEmit -p tsconfig.json
```
Expected: 测试仍 PASS；`tsc` 无错误（以 Task 6 的 `npm run build` 为最终准）。

- [ ] **Step 5: Commit**

```bash
git add web/package.json web/package-lock.json web/src/lib/ai/investorNarrativeServer.ts
git commit -m "feat(ai): 投资者叙述服务端模块(AI Gateway 生成 + 读缓存) + 装 ai SDK"
```

---

## Task 3: 受保护的生成路由 + 驱动

**Files:**
- Create: `web/src/app/api/refresh-investor-narratives/route.ts`

- [ ] **Step 1: 写路由**

`web/src/app/api/refresh-investor-narratives/route.ts`:
```ts
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import { generateAndCacheNarrative } from "@/lib/ai/investorNarrativeServer";
import type { ManagerDetailLike, Lang } from "@/lib/ai/investorNarrative";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  const secret = process.env.NARRATIVE_REFRESH_TOKEN;
  if (!secret || token !== secret) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const slugParam = url.searchParams.get("slug");
  const langParam = url.searchParams.get("lang") as Lang | null;
  const langs: Lang[] = langParam === "zh" || langParam === "en" ? [langParam] : ["zh", "en"];

  const idx = await getManagerIndex();
  const slugs = (slugParam ? idx.managers.filter((m) => m.slug === slugParam) : idx.managers).map((m) => m.slug);

  const results: { slug: string; lang: Lang; ok: boolean; error?: string }[] = [];
  for (const slug of slugs) {
    const d = (await getManagerDetail(slug)) as ManagerDetailLike | null;
    if (!d) { results.push({ slug, lang: "zh", ok: false, error: "no detail" }); continue; }
    for (const lang of langs) {
      try {
        await generateAndCacheNarrative(d, lang);
        results.push({ slug, lang, ok: true });
      } catch (e) {
        results.push({ slug, lang, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }
  }
  const made = results.filter((r) => r.ok).length;
  return Response.json({ ok: true, made, total: results.length, results });
}
```

- [ ] **Step 2: 构建校验**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npm run build
```
Expected: 构建成功；路由 `/api/refresh-investor-narratives` 出现在输出。

- [ ] **Step 3: 准备本地生成环境（手动验证关卡）**

把生成所需 env 放进 `web/.env.local`（Next 只读这里）：
```bash
cd /Users/junlinzhu/Desktop/yangyang-code/ny-fed-monitor
cp .env.local web/.env.local   # 带上 SUPABASE_URL / SUPABASE_SERVICE_KEY
# 再向 web/.env.local 追加(用你的值):
#   AI_GATEWAY_API_KEY=...           (你的 Vercel AI Gateway key)
#   NARRATIVE_REFRESH_TOKEN=...      (自取一串随机串)
#   NARRATIVE_MODEL=deepseek/...     (Task 2 Step 2 核出的 slug)
```

- [ ] **Step 4: 起服 + 先生成伯克希尔（手动验证关卡 — 真实 Gateway + 库写入）**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npm run build && (npm run start &) && sleep 5
TOKEN="$(grep NARRATIVE_REFRESH_TOKEN .env.local | cut -d= -f2)"
curl -s -X POST "http://localhost:3000/api/refresh-investor-narratives?slug=berkshire-hathaway&token=$TOKEN" | head -40
```
Expected: JSON `{ ok:true, made:2, ... results:[{slug:"berkshire-hathaway",lang:"zh",ok:true},{...lang:"en",ok:true}] }`。

- [ ] **Step 5: 抽查叙述质量（手动验证关卡 — 价值观护栏）**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && node --input-type=module -e '
import { createClient } from "@supabase/supabase-js"; import WebSocket from "ws"; import fs from "fs";
const env=fs.readFileSync(".env.local","utf8"); const g=k=>{const m=env.match(new RegExp("^"+k+"=(.*)$","m"));return m?m[1].trim().replace(/^["\x27]|["\x27]$/g,""):undefined;};
const db=createClient(g("SUPABASE_URL"),g("SUPABASE_SERVICE_KEY"),{auth:{persistSession:false},realtime:{transport:WebSocket}});
const {data}=await db.from("ai_analysis_cache").select("page_key,analysis_json").like("page_key","investor:berkshire-hathaway:%:zh").order("created_at",{ascending:false}).limit(1).maybeSingle();
console.log(data?.page_key); console.log(JSON.stringify(data?.analysis_json,null,2));
process.exit(0);'
```
> **人工确认**：judgment_line 与 moves.why **不含**任何买/卖/目标价/贵贱判断；语气克制；数字与持仓一致。若违规 → 回 Task 1 收紧 `systemPrompt` 措辞、重跑路由。

- [ ] **Step 6: 全量生成（手动验证关卡）— 驱动循环 34 户**

```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web
TOKEN="$(grep NARRATIVE_REFRESH_TOKEN .env.local | cut -d= -f2)"
for slug in $(node -e "require('./config/managers.json').forEach(m=>console.log(m.slug))"); do
  echo -n "$slug: "
  curl -s -X POST "http://localhost:3000/api/refresh-investor-narratives?slug=$slug&token=$TOKEN" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('made',j.made,'/',j.total)})"
done
```
Expected: 34 行，多数 `made 2 / 2`。少数户若无 `prior`、`changes` 为空仍会生成（judgment_line 描述当前组合）。失败少数可接受。
> 完成后停服并清理：`kill %1 2>/dev/null; rm -f web/.env.local`（避免把库凭据留在 web 下；生产靠 Vercel env）。

- [ ] **Step 7: Commit**

```bash
git add "web/src/app/api/refresh-investor-narratives/route.ts"
git commit -m "feat(ai): 受token保护的投资者叙述生成路由(逐户×中英, 走Gateway)"
```

---

## Task 4: 叙述层 Server Component（事实/AI 分层 + 披露注脚）

**Files:**
- Create: `web/src/components/entity/InvestorNarrative.tsx`

- [ ] **Step 1: 写组件**

`web/src/components/entity/InvestorNarrative.tsx`:
```tsx
import React from "react";
import type { InvestorNarrativeData } from "@/lib/ai/investorNarrative";

type Lang = "zh" | "en";

const COPY = {
  zh: {
    heading: "本季动作 · AI 解读",
    disclosure: "本段由 AI 依据 SEC 13F 申报自动生成，可能存在错误，不构成投资建议。",
  },
  en: {
    heading: "This Quarter · AI Read",
    disclosure:
      "This section is AI-generated from the SEC 13F filing, may contain errors, and is not investment advice.",
  },
} as const;

export function InvestorNarrative({
  data,
  lang,
}: {
  data: InvestorNarrativeData;
  lang: Lang;
}): React.ReactElement {
  const t = COPY[lang];
  return (
    <section className="rounded-sm border-l-2 border-[var(--tt-accent)] bg-[var(--tt-surface)] px-4 py-4">
      <div className="pb-2">
        <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
          {t.heading}
        </span>
      </div>

      <p className="text-[15px] leading-relaxed text-[var(--tt-text)]">{data.judgment_line}</p>

      {data.moves.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {data.moves.map((m, i) => (
            <li key={i} className="text-sm leading-relaxed text-[var(--tt-text)]">
              <span className="font-medium">{m.issuer}</span>
              <span className="ml-1 text-[var(--tt-muted)]">· {m.action}</span>
              {m.why && <span className="text-[var(--tt-muted)]"> — {m.why}</span>}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-[var(--tt-faint)]">{t.disclosure}</p>
    </section>
  );
}
```

- [ ] **Step 2: 构建校验**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npx tsc --noEmit -p tsconfig.json
```
Expected: 无错误。

- [ ] **Step 3: Commit**

```bash
git add web/src/components/entity/InvestorNarrative.tsx
git commit -m "feat(entity): 投资者叙述层 Server Component(事实/AI视觉分层+披露注脚)"
```

---

## Task 5: 接进投资者页（EntityPage 加 aiNarrative + SSR 读缓存 + meta）

**Files:**
- Modify: `web/src/components/entity/EntityPage.tsx`
- Modify: `web/src/app/[lang]/investors/[slug]/page.tsx`

- [ ] **Step 1: EntityPage 新增可选 `aiNarrative` prop**

在 `EntityPageProps` 中 `aiPageKey?: string;` 下一行加：
```ts
  /** 若提供, 用服务端渲染的叙述节点替代客户端 AINarrative(SEO/GEO 可见) */
  aiNarrative?: React.ReactNode;
```
函数签名解构加入 `aiNarrative,`（与 `aiPageKey,` 同列）。把 slot ③：
```tsx
      {/* ③ AI narrative */}
      <AINarrative lang={lang} pageKey={aiPageKey} />
```
改为：
```tsx
      {/* ③ AI narrative — 服务端节点优先(SEO可见), 否则回退客户端组件 */}
      {aiNarrative ?? <AINarrative lang={lang} pageKey={aiPageKey} />}
```

- [ ] **Step 2: 投资者页服务端读缓存并传入**

`web/src/app/[lang]/investors/[slug]/page.tsx` 顶部 imports 追加：
```ts
import { getInvestorNarrative } from "@/lib/ai/investorNarrativeServer";
import { InvestorNarrative } from "@/components/entity/InvestorNarrative";
```
在 `const { manager, latest, prior, changes } = d;` 之后追加：
```ts
  const narrative = await getInvestorNarrative(slug, latest.period, lang);
```
在 `<EntityPage ...>` 调用新增一行 prop（紧邻 `aiPageKey`）：
```tsx
        aiNarrative={narrative ? <InvestorNarrative data={narrative} lang={lang} /> : undefined}
```

- [ ] **Step 3: generateMetadata 用 judgment_line 作 description**

在 `generateMetadata` 的 `const d = await getManagerDetail(slug); if (!d) return {};` 之后追加：
```ts
  const nb = await getInvestorNarrative(slug, d.latest.period, lang);
```
并在文件顶部确保已 `import { getInvestorNarrative } from "@/lib/ai/investorNarrativeServer";`（与 Step 2 同一 import，勿重复）。把两处 `description` 改为优先用 judgment_line：
- zh 分支：`description: nb?.judgment_line ?? \`${name} — ${person} 的最新 SEC 13F 季度持仓披露，持仓明细与环比变动。\`,`
- en 分支：`description: nb?.judgment_line ?? \`${name} — Latest SEC 13F quarterly holdings for ${person}, with positions and quarter-over-quarter changes.\`,`

> `getInvestorNarrative` 由 `react.cache` 包裹，generateMetadata 与页面同参数只查库一次。

- [ ] **Step 4: 构建验证（主要验收关卡）**

Run:
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && npx vitest run && npm run build
```
Expected: 全部测试 PASS；构建成功，无类型错误。

- [ ] **Step 5: 手动验证关卡（SSR/GEO 可见 + 降级）**

> 需已生成缓存（Task 3）且 `web/.env.local` 指向库。
```bash
export PATH="$HOME/.nvm/versions/node/v20.20.0/bin:$PATH"
cd web && cp ../.env.local .env.local && npm run build && (npm run start &) && sleep 5
curl -s http://localhost:3000/zh/investors/berkshire-hathaway | grep -o "本段由 AI 依据" | head -1
curl -s http://localhost:3000/zh/investors/berkshire-hathaway | grep -oE "<meta name=\"description\"[^>]*>" | head -1
kill %1 2>/dev/null; rm -f .env.local
```
Expected: grep 到披露注脚文本（叙述已 SSR 进 HTML）；`<meta description>` 为该户 judgment_line。
> 降级检查：无 `web/.env.local` 时 `npm run build` 仍通过（`getInvestorNarrative` 返回 null，页面只渲染事实层）。

- [ ] **Step 6: Commit**

```bash
git add web/src/components/entity/EntityPage.tsx "web/src/app/[lang]/investors/[slug]/page.tsx"
git commit -m "feat(investors): 服务端渲染AI叙述进页面(GEO可见)+judgment_line作meta description"
```

---

## 后续（本计划之外，各自独立）

- **生产生成**：把 `AI_GATEWAY_API_KEY` / `NARRATIVE_REFRESH_TOKEN` / `NARRATIVE_MODEL` 配进 Vercel env，部署后对生产 URL 跑同样的 curl 驱动；季度更新接 GitHub Actions。
- **GEO 结构化**：FAQ/Article schema、judgment_line 可摘录化。
- **估值判决叠加**：待 Phase 2/3 估值层就绪（护栏：无买卖/目标价）。
- **分享卡**：判决条 + Top5 动作渲染成 OG 图。
- **个股页叙述**：把同套机制用到 `/stocks/[ticker]`。

---

## Self-Review 检查

- **Spec 覆盖**：§2 架构(路由 Task 3 / 服务端模块 Task 2 / 页面 Task 5)、§3 prompt+护栏(Task 1 systemPrompt)、§4 视觉分层+披露(Task 4)、决策 5 AI Gateway(Task 2)、SSR/中英/批量(Task 3、5)、§5 验收(各关卡 + Task 5 build)。判决条作 meta(Task 5 Step 3)。
- **关键修正落实**：生成走路由(非 tsx，规避 server-only)；AI Gateway(非直连 DeepSeek)。
- **类型一致**：`ManagerDetailLike`/`MovesPayload`/`InvestorNarrativeData`/`Lang`(Task 1) 贯穿服务端模块(Task 2)、路由(Task 3)、页面(Task 5)；`buildMovesPayload`/`parseInvestorNarrative`/`systemPrompt`/`userPrompt`/`narrativeKey`/`generateAndCacheNarrative`/`getInvestorNarrative` 命名一致。
- **server-only 边界**：纯逻辑模块(investorNarrative.ts)无 server-only/ai/db，可被测试导入；服务端模块(investorNarrativeServer.ts)server-only，仅路由与页面(均服务端)导入。
- **无占位符**：各 step 含真实代码/命令/预期（`DEFAULT_MODEL` slug 显式标注需用 Task 2 Step 2 核出值替换）。
- **降级**：无 `AI_GATEWAY_API_KEY` / 无 Supabase env 时生成抛错(路由记入 results)、读取返回 null、页面只渲染事实层、build 通过。
