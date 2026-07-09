# ADR/ADS 比例归一化 — 设计 spec

日期：2026-07-08
分支基线：`db-foundation`
诊断起点：用户问「PDD 现金这么多，为什么估值显示如此低估」→ 拉真数据发现 PDD 被判 `above`（现价 $82.53 vs 价值带 $13–28），根因是 ADS 换股比例未归一化。

## 1. 问题

SEC 20-F 里外国发行人的 `shares_diluted` / `shares_outstanding` 是**标的普通股（ordinary shares）**数；而市场价（Yahoo）是**每份 ADS** 的价。多数 ADR 满足 `1 ADS = N 股普通股`（N≠1）。

估值引擎用「总内在价值 ÷ 普通股数」得到**每普通股**价值带，却直接拿它跟**每 ADS** 价比较，两边差 N 倍：

- PDD（N=4）：每普通股带 $13–28 → 每 ADS 应为 $53–114；现价 $82 本落带内，却被压成"高估 above"。
- 方向双向：N>1 → 假高估（PDD/JD/NTES/EDU…）；N<1 → 假**便宜**（FMS 当前误进 strike zone，危险方向）。

同一根因还污染研究页的 `market_cap = 每ADS价 × 普通股数`（PDD 算成 ~$470B，实际 ~$115B），连累 P/E、P/S、EV、各类收益率。

现有护栏（`deriveValuationVerdict.ts:51`，OE 收益率 >33% 判 ADR 口径错→reliable=false）只挡"算得太便宜"一侧，PDD 这类"算得太贵"方向漏掉。

### 币种不是问题（已核）
PDD 20-F 数字是 USD convenience-translation（FY2024 净利 $15.4B × 7.30 = RMB 112B，与真实年报吻合）。现金 $15.6B + 短投 $44.8B ≈ $60B 净现金，几乎无债——用户直觉正确。

## 2. 范围

**受影响对象** = `securities.security_type = 'ADR'` 且当前有基本面、在产出估值判定的 **19 只**：

```
FMS QFIN WB EDU FINV HDB ATAT JD JOYY NICE NOAH NTES PDD BEKE ARM SIMO TCOM HTHT VALE
```

其中带 STRIKE 信号（危险方向，优先验收）：**FMS / QFIN / WB**。

**不碰**：非 ADR 的外国普通股上市（`Common Stock` / `NY Reg Shrs`：STM/CHKP/ICLR/DOX/INMD…）天然 1:1，回归须证明其值一字不变。universe 内另有 ~139 只 ADR 因无基本面已是 no-floor，不受影响。

**注意**：ADR 里也有 1:1 的（WB、NICE、VALE、TCOM、ARM、HTHT 疑似）。因此不能"是 ADR 就抑制/统一处理"，必须逐票真实比例（可能=1）。

## 3. 架构

### 3.1 数据模型
`securities` 加列 `ads_ratio numeric`（含义：每 1 ADS 折合几股标的普通股；`NULL` = 未策展/未知）。仅 `security_type='ADR'` 行读它；非 ADR 永不读，默认 1。

### 3.2 归一化注入点（唯一）
`fundamentalsToFloorInput(ticker, companyName, rows, adsRatio = 1)` 新增末位参数，把每年 `shares_diluted` 改为 `shares_diluted / adsRatio`（= ADS 张数）。

下游 EPV / 资产底（AV）/ net-net / OE-DCF / 增长价值（GV）的每股全部自动变成「每 ADS」，与每 ADS 价天然对齐。**一处除法，全链自洽**；OE 收益率 >33% 护栏也随之回到正确行为。缺省 1 → 非 ADR 及所有既有调用零行为变化。

### 3.3 抑制闸（永不显示错带）
`security_type='ADR'` 且 `ads_ratio IS NULL` → 该票**不产出估值判定**：
- `valuation-ingest.ts`：循环内跳过（读取侧缺行 = " —"）。
- 个股页 `page.tsx` / `EarningsPowerFloorCard`：显示"暂无可靠每股估值"，与 BABA/TSM 的 no-floor 同待遇。

19 只全部策展后不命中此闸；它只兜未来新进、尚未核定比例的 ADR。宁可留白，绝不拿未归一化的带比价。

### 3.4 研究页市值口径（同源，一并修）
`src/lib/research/valuation/calculateValuation.ts` 的 `sharesOutstanding()` 返回 `shares / adsRatio`（ADS 张数），则 `market_cap = 每ADS价 × ADS张数` 正确，P/E、P/S、EV、收益率全套随之自洽。`adsRatio` 由调用方 `/api/research/[ticker]/route.ts` 加载 `securities.ads_ratio` 后传入 `ValuationInput`。

## 4. 比例策展与核定

**风险**：比例反直觉且离散（PDD=4、JD=2、NTES=5、EDU=10、BEKE=3、SIMO=4、WB=1、NICE=1、VALE=1、JOYY 疑似大比例…），猜错=换个数字重犯 bug。故每只**双源交叉核定**才落库：

1. **权威源**：公司 ADR 存托条款 / 20-F 封面「each ADS represents N shares」（实施时逐票查证）。
2. **数据自检**：`隐含比例 = SEC 普通股 shares_outstanding ÷ 市场 ADS 张数`，或 `市场每ADS EPS ÷ SEC每股 EPS`。PDD 实测 5.69B÷1.4B=4.06 ✓；EPS $9.4÷$2.36=3.98 ✓。

两源收敛到同一"干净比例"才写入；不收敛 → 留 `NULL` → 走抑制闸，等人工核。数据自检仅一次性策展用，**不进构建期**，不碰"禁实时外抓"红线。

**落库**：`scripts/backfill-ads-ratio.ts`（幂等，写 `securities.ads_ratio`），与 `backfill-security-type.ts` 同模式。

## 5. 改动清单

| # | 文件 | 改动 |
|---|---|---|
| 1 | `supabase/migrations/20260708_add_ads_ratio.sql` + `schema.sql` | `securities` 加 `ads_ratio numeric`；DDL 由用户在 SQL Editor 跑 |
| 2 | `src/lib/valuation/fundamentalsToFloorInput.ts` | 加 `adsRatio = 1` 末参，`shares_diluted / adsRatio` |
| 3 | `scripts/valuation-ingest.ts:103` | 读 `ads_ratio`+`security_type`；ADR&NULL→跳过；否则传 ratio |
| 4 | `src/app/[lang]/stocks/[ticker]/page.tsx:359` | 同上：加载 ratio、传参、命中抑制闸时不渲染卡片 |
| 5 | `src/lib/research/valuation/calculateValuation.ts` + `/api/research/[ticker]/route.ts` | `sharesOutstanding()` 除以 ratio；route 加载并传入 |
| 6 | `scripts/backfill-ads-ratio.ts`（新） | 19 只核定比例回填 |

调用点仅两处（`page.tsx:359`、`valuation-ingest.ts:103`）+ 研究页一处，边界收敛。

## 6. 测试（无测试框架，走 `.check.ts` + tsc + 真数据）

- `fundamentalsToFloorInput.check.ts`：ratio=4 → shares 减为 1/4、每股带 ×4；ratio=1 不变；缺省=1。
- `deriveValuationVerdict.check.ts`：ADR & ratio=NULL → 抑制（无判定）用例。
- `tsc` 全绿。

## 7. 验收（重跑 ingest 后真数据对拍）

| 票 | 现状(错) | 归一化后(预期) | 判据 |
|---|---|---|---|
| PDD | above，带 $13–28 | 带 $53–114，价 $82 落带内 | bucket≠above，margin 由 −517% 收敛 |
| WB | strike，带 $17（1:1） | 不变，仍 strike | ratio=1 恒等，值不动 |
| **FMS** | **strike**，带 $37–48 | ratio<1 下修，脱离 strike | in_strike_zone=false |
| JD | above，带 $12 | 带 $24（×2），价 $26 | 落带内/近带 |
| 全 19 只 | — | 每股带 × ratio 与价同口径 | 无一 bucket 因 N× 假高估/假低估 |
| 非 ADR（STM/CHKP…） | — | 一字不变 | 回归：值完全不动 |
| PDD 研究页 | market_cap ~$470B | ~$115B（$82×1.4B ADS） | P/E、EV 随之收敛 |

## 8. 上线步骤

1. 用户在 Supabase SQL Editor 跑 migration DDL（本机无 DB 密码，service key 走 PostgREST 跑不了 DDL）。
2. 逐票查证 19 只比例，写入 `backfill-ads-ratio.ts`。
3. `npm run backfill:ads-ratio` 回填 `securities.ads_ratio`。
4. `npm run valuation:ingest` 重刷快照。
5. 对拍验收表（§7），重点 FMS 脱离 strike、PDD 落带内、非 ADR 零变化。

## 9. 关联
[[valuation-broad-universe-guardrails]]（本条是其"外股 ADR 归一化"遗留的落地）、[[valuation-data-coverage]]、[[sec-valuation-ingest-ops]]、[[build-no-live-external-fetch]]。
