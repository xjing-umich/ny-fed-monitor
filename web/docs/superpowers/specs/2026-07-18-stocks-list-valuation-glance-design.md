# Stocks 列表页注入估值一瞥（Approach A「稀有便宜」高亮）

**Date:** 2026-07-18
**Status:** Design approved（待用户复核 spec）
**Scope:** `web/` — `/[lang]/stocks` 主列表页 + 一个新读取器
**Out of scope:** screener（不动）、估值排序、Position 全列、数据层/迁移/ingest、macro/investor 列表

## 问题

`/stocks` 主列表是纯规模视图（Security / Holders / Total value，按持有机构数排），
看不出这些"最多人持有"的股票里哪些其实便宜。站点签名是 13F × 估值 × 基本面
（[[frontend-optimization-thread]] 读法层三部曲），列表页却零估值。

真数据实测（`valuation_snapshot` 988 行）：最多人持有 top-50 里 37 只有判定，
**桶分布 = 高于价值 33 / 处合理区间 3 / 低于价值 1**，全站击球区仅 24 只。
即："人群最爱几乎清一色被保守引擎判太贵"——正是北极星句
*"一堆基金持有 ≠ 便宜，可能正因热门才贵。"*

## 决定：只高亮稀有便宜，不铺满桶

**不**在主列表铺 Position 全列（会是一面倒的"高于价值"墙 + 与 screener 重复）。
只给**落在击球区 / 低于价值带**的少数共识股加绿色标记；高于价值 / 处合理区间 /
无判定的行**一律不显**。让人一眼扫出罕见的真便宜。

### 前景规则（复用详情页 masthead 同一闸，永不漂移）

一行显示绿标 ⟺
```
verdict.reliable && (verdict.inStrikeZone || verdict.bucket === "below") && verdict.marginPct != null && verdict.marginPct > 0
```
- 击球区行：小绿描边 chip「击球区 / Strike zone」+ 安全边际 `+X%`（mono）。
- 低于价值带但非严格击球区（reliable）：只显绿色 `+X%`，不挂 chip。
- 其余（above / within / 无判定 / unreliable / 坏数据行）：不显任何东西。

该闸与 `stocks/[ticker]/page.tsx` 的 `marginShown`、screener strike/below 视图同源。
无判定行与"高于价值"行呈现一致（都空），天然绕开 26% 覆盖缺口，无难看空列。

## 架构（零部署）

三个改动单元，边界清晰：

### 单元 1 — 新读取器 `readBargainVerdicts()`

**文件：** `web/src/lib/valuation/valuationSnapshot.ts`（追加导出，紧邻现有读取器）

```ts
export type BargainVerdict = { inStrikeZone: boolean; marginPct: number };

/**
 * 读"便宜"票(击球区 或 低于价值带, reliable)的按-ticker map, 供 /stocks 列表高亮。
 * 行数有界(击球区 24 + 低于价值 91, 去重后 ≤~110), 无 IN 巨列表 → 无 URL 超长风险。
 * 任何异常/表未迁移(42P01/PGRST205)→ 空 Map 优雅降级(列表零标记, 不抛)。
 */
export const readBargainVerdicts = cache(
  async (): Promise<Map<string, BargainVerdict>> => {
    const out = new Map<string, BargainVerdict>();
    if (!hasSupabaseEnv()) return out;
    const isMissingTable = (e: unknown) => {
      const code = (e as { code?: string }).code;
      return code === "42P01" || code === "PGRST205";
    };
    try {
      const { data, error } = await withRetry(() =>
        getDb()
          .from("valuation_snapshot")
          .select("ticker,range_lo,range_hi,price,margin_pct,in_strike_zone,verdict_bucket")
          .eq("reliable", true)
          .or("in_strike_zone.eq.true,verdict_bucket.eq.below")
          .limit(500), // 安全上限, 远高于真实 ~110
      );
      if (error) {
        if (!isMissingTable(error))
          console.error(`readBargainVerdicts 失败: ${(error as Error).message}`);
        return out;
      }
      for (const r of (data ?? []) as Record<string, unknown>[]) {
        const marginPct = r.margin_pct == null ? null : Number(r.margin_pct);
        const v = {
          rangeLo: Number(r.range_lo),
          rangeHi: Number(r.range_hi),
          price: Number(r.price),
          marginPct,
        };
        // 与 readValuationVerdicts / readStrikeZoneLeaders 同一坏数据防御
        if (isImplausibleBand(v)) continue;
        if (marginPct == null || marginPct <= 0) continue; // 前景闸: 只留正边际
        out.set(String(r.ticker).toUpperCase(), {
          inStrikeZone: Boolean(r.in_strike_zone),
          marginPct,
        });
      }
      return out;
    } catch (err) {
      console.error(`readBargainVerdicts 异常: ${err instanceof Error ? err.message : String(err)}`);
      return out;
    }
  },
);
```

**为何不复用 `readValuationVerdicts(tickers)`：** 它把 tickers 拼进 `.in()` → URL query。
consensus 最多 5000 ticker → 30KB+ URL → 414 / 截断（真 bug）。且 `select("*")` 拉
`payload` JSON 无用。新读取器一条有界查询、只选必要列，性能与正确性双赢。

### 单元 2 — `stocks/page.tsx` 数据 join

**文件：** `web/src/app/[lang]/stocks/page.tsx`

- `Promise.all` 追加 `readBargainVerdicts()`（与 `consensusHeld/getCusipMap/getManagerIndex` 并发）。
- 塑形 `tableRows` 时对每行 `bargains.get(ticker)` 做 **O(1) 内存 join**（≤5000 次 Map.get，microseconds）。
- `StockRow` 增可序列化字段 `bargain: { inStrikeZone: boolean; marginPct: number } | null`。
- intro 文案各加一句（见下）。
- `revalidate = 86400` 不变：额外查询只在日级 ISR 生成跑一次；egress 可忽略。

### 单元 3 — `StocksTable.tsx` 渲染绿标

**文件：** `web/src/app/[lang]/stocks/StocksTable.tsx`

- `StockRow` type 加 `bargain`（同上）。
- Security（primary）列 cell：`<EntityName/>` 后条件渲染 `<BargainMark bargain={r.bargain} lang={lang} />`：
  ```tsx
  cell: (r) => (
    <span className="inline-flex items-baseline gap-2">
      <EntityName issuer={r.issuer} ticker={r.ticker} />
      {r.bargain ? <BargainMark bargain={r.bargain} lang={lang} /> : null}
    </span>
  ),
  ```
- 长尾折叠清单：命中行在 ticker span 后补 `<span className="ml-1.5 font-mono text-[11px] text-[var(--tt-positive)]">{fmtMarginPct(r.bargain.marginPct)}</span>`（与 screener 尾部同款）。
- Holders / Total value 两列不动；不加列、不加排序。

**`BargainMark`（定为 `StocksTable.tsx` 文件内局部小组件——仅此一处用，不预先抽到 `components/`，YAGNI；将来第二处复用再抽）：**
```tsx
function BargainMark({ bargain, lang }: { bargain: { inStrikeZone: boolean; marginPct: number }; lang: Lang }) {
  const isZh = lang === "zh";
  const pct = fmtMarginPct(bargain.marginPct);
  const label = bargain.inStrikeZone
    ? (isZh ? `击球区，安全边际 ${pct}` : `In strike zone, margin of safety ${pct}`)
    : (isZh ? `低于价值带，安全边际 ${pct}` : `Below value band, margin of safety ${pct}`);
  return (
    <span className="inline-flex items-baseline gap-1.5" aria-label={label}>
      {bargain.inStrikeZone && (
        <span aria-hidden className="rounded-sm border border-[var(--tt-accent)] px-1 py-px font-mono text-[9px] uppercase tracking-[0.08em] leading-none text-[var(--tt-accent)]">
          {isZh ? "击球区" : "Strike zone"}
        </span>
      )}
      <span aria-hidden className="font-mono text-[11px] tabular-nums text-[var(--tt-positive)]">{pct}</span>
    </span>
  );
}
```
- 绿标用 `--tt-accent`(chip 描边)/`--tt-positive`(数字)；`rounded-sm` 同 screener 视图钮；mono。
- 颜色不单独承义：整体 `aria-label` 念全"击球区，安全边际 +X%"，chip/数字 `aria-hidden`。

## 文案（copy-voice 干净，「击球区」为既定术语）

intro 各追加一句（现有句尾）：
- **en:** `The few in the strike zone — price below our conservative value band — are marked in green.`
- **zh:** `少数落在击球区（现价低于保守价值带）的以绿色标出。`

em-dash 用于澄清（copy-voice 第 6 条允许）。每 locale 纯单语。

## 数据流

```
consensusHeld() ─┐
getCusipMap() ───┼─ Promise.all ─→ tableRows.map: bargain = bargains.get(ticker) ?? null
getManagerIndex()┤                                   │
readBargainVerdicts() ─ Map<ticker,BargainVerdict> ──┘
                                                      ↓
                              StocksTable → Security cell 绿标 / 尾部绿 %
```

## 降级与边界

- 无 Supabase env / 表未迁移 / 查询错 → 空 Map → 全列表零标记（列表本体不受影响，SEO 核心页安全）。
- unreliable / above / within / 无判定 / 坏数据行 → 不显（前景闸 + isImplausibleBand 双保险）。
- 快照与共识可能不同季/不同票池 → join 未命中即 null，正常。

## 验收

1. `/en/stocks` 与 `/zh/stocks`：多数行无标记；少数击球区行显绿 chip「击球区/Strike zone」+ `+X%`；低于价值带 reliable 行显绿 `+X%` 无 chip。
2. 高于价值（如 AAPL）/ 处合理区间 / 无判定行**无任何绿标**。
3. 长尾折叠清单命中行 ticker 后有绿 `+X%`。
4. 明暗双模：绿标解析到 `--tt-accent`/`--tt-positive` 令牌值，无漂移。
5. 移动 375px：primary 格内联绿标不撑破行、无横向溢出。
6. a11y：绿标有完整 `aria-label`，不靠颜色单独承义。
7. 性能：仅新增一条有界查询（≤500 行硬顶，真实 ~110）；无 5000-IN；`revalidate=86400` 不变。
8. `npx tsc --noEmit` = 0。
9. 降级：模拟空 Map（或表缺）时列表零标记且不报错。

## 实现顺序（供 plan）

1. 单元 1 读取器 + 其纯度（可 node 探针验行数/形状）。
2. 单元 3 `BargainMark` + `StocksTable` 渲染（可先用假数据 preview）。
3. 单元 2 页面 join + intro 文案。
4. preview 真渲染四态（en/zh × 明暗）+ 移动 375 + 降级态；tsc。

## 相关

[[frontend-design-language]]（Option B 排版 / --tt 令牌 / 绿色克制）、
[[frontend-optimization-thread]]（读法层主线）、
[[valuation-broad-universe-guardrails]]（reliable 信心闸 / isImplausibleBand 口径）、
[[supabase-usage-egress]]（日级 ISR 护栏，本设计遵守）。
