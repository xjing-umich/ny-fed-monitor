# Compounder 成本自付计划（营收纲领的可执行版）

- 日期：2026-06-30
- 性质：挂在[北斗星纲领](./2026-06-30-north-star-strategy.md) **§3 柱④营收** 与 **§4 自运转骨架** 之下的可执行计划。
- 命题：1–2 年做到**成本自付**，过程中零污染可信度。**这是成本题，不是营收题。**
- 锚定（与用户确认 2026-06-30）：月度开销量级 = **$20–50/月**；产出 = **成本自付计划**（非增收计划）。

---

## 0. 为什么这是成本题

纲领对营收有三条硬约束：①封顶=覆盖成本（排除做生意）；②是 1–2 年里程碑、不是 6 月目标、**永不当记分牌**；③手段=克制展示广告 + 轻赞助，**不做付费墙/订阅/账号**。

在 $20–50/月量级下推出两个反直觉但关键的结论：

1. **"等 2–3 万 PV 开广告"不是最优解。** 广告在 2–3 万 PV 约 $60–240/月，能覆盖；但一个克制的 Support 入口在**远低于该流量**时就能覆盖 $50，且不碰广告对"机构级、不像流量农场"的折损。→ 赞助应排在广告**之前**。
2. **成本不是固定线，它随流量一起爬（移动靶）。** 流量既是营收的自变量，**也是成本的自变量**（Supabase egress）。你越成功，靶越往上跑。→ **压低成本分母 > 抬高营收分子**，既安全又符合"作者能放手"。

---

## 1. 成本盘点实盘（2026-06-30 查代码所得，把 $50 靶坐实）

### ISR / egress 友好度 —— 优秀（已结构性抑制）
- 全部页面 + sitemap：`export const revalidate = 86400`（日级再生）。每页每天最多再生一次，egress 被结构性压住，符合 [[supabase-usage-egress]] 打法。

### 两套 cron（成本来源）
- **GitHub Actions 6 条**（`ingest`/`prices`/`valuation`/`fundamentals`/`macro`/`prices-cleanup`）= **免费**，不占 Vercel 额度，重活都在这。
- **Vercel crons 3 条**（`market-ingest` 工作日 / `health-watchdog` 每日 / `sec-fundamentals` 周日，见 `web/vercel.json`）= **基本坐实 Vercel Pro（~$20/月）**，是 $50 靶的固定大头。

### 各项随流量敏感度

| 项 | 当前态 | 随流量涨？ |
|---|---|---|
| Vercel Pro | ~$20/月固定 | 否（除非 bandwidth/函数调用越 Pro 含量） |
| **Supabase egress / DB size** | ISR 日级 + 24 个月滚动删 prices（`prices-cleanup.yml`）双重抑制 | **是 —— 唯一会爬的线，移动靶所在** |
| DeepSeek（AI 叙述） | ISR 缓存，非每请求 | 几乎不（被缓存挡住） |
| Resend（联系表单 + 告警） | 免费档 3000 封/月 | 否 |
| 域名 thecompounder.fyi | 年付摊销极小 | 否 |

**结论**：固定盘 ≈ Vercel Pro $20 + 域名摊销；唯一会随成功爬的是 **Supabase egress/DB size**。靶 = ~$50/月封顶。

---

## 2. 成本护栏（主杠杆 · 现在唯一该投入的工程）

### 关键修正：可观测性缺口已合一半
纲领 §4 称"唯一缺口=可观测性"，但实盘发现 `health-watchdog`（`web/src/app/api/cron/health-watchdog/route.ts`，每日 13:00 UTC，走 Resend）**已在跑**：

- ✅ **静默失败那半已闭合**：`gatherHealth` 查 13F 落后 / macro 失败 / 价格管道停跑（>3 天），并防 PostgREST 1000 行静默截断（纠错工具不能被自己骗）。正是纲领点名的 `former_names` 类 bug 的解药。
- ❌ **成本/配额那半仍开口**：watchdog **只查数据健康，不查 Supabase DB size / egress / Vercel 用量**。

### 待做（小、复用现成管道）
**给现成 watchdog 加一个"成本/配额"检查项**，不是从零造：

1. 在 `gatherHealth` 旁加 `gatherUsage(today)`：查 Supabase DB size（`pg_database_size` 或 platform API）、prices 表行数（egress 代理指标），可选 Vercel 用量。
2. 进 `checks.ts` 加纯函数 `evaluateUsage`：DB size / egress 逼近配额阈值（如 free 档 80%）→ 产 `HealthProblem`。
3. 复用 `sendHealthAlert`（Resend 通路已验证），逼近线时主动戳人。

**出关**：流量翻几倍时成本仍在 $50 靶内不失控，且你先于配额被告警。这也补齐纲领 §4 让作品"配叫代表作、作者能放手"的最后一块。

---

## 3. 营收侧：轻赞助优先于广告（顺序调整，仍守纲领）

- **更早可行**：覆盖 $50 不需 2–3 万 PV，几个真实读者小额支持即可。
- **更低折损**：GitHub Sponsors / Ko-fi 风格的克制入口，比第三方广告脚本对品牌伤害小一个量级。
- **合规更干净**：赞助入口无荐股/博彩素材风险（广告位有，见 [[promotion-and-compliance]]）。
- **形态约束**（守 landing 机构级定调）：About / Footer 一行"支持这个公共品"，非悬浮按钮、非 modal、不挡内容；措辞走"支持公共品"不走"打赏"。

---

## 4. 广告：只做"账户就绪"那半，不露出

- 现在可做、本来就该有：**ads.txt + 隐私政策页 + AdSense 审核脚本**（审核硬要求，做了≠露广告）。
- publisher ID 已备：`ca-pub-8607745366742609`（见 [[ads-deferred-foundation-first]]）。
- 露出条件不变：月 ~2–3 万 PV 才真放，**永不上 Auto Ads**，只手动克制单元位。
- 优先级低于 §2、§3——除非顺手，等流量信号再做。

---

## 5. 真正的限速器仍是流量（点名，不在本计划范围）

营收完全下游。成本自付的真自变量是**柱②流量**（修收录 [[seo-indexing-404-rootcause]] / GEO 可引用 / 外链弹药）。本计划不抢流量线的活，但诚实写明：**§2–4 全做完，没流量照样自付不了。流量是 1，营收是后面的 0。**

---

## 6. 落地排序（本 thread 可执行清单）

1. ✅ **成本盘点**（本 doc §1，已完成）—— $50 靶坐实，最危险项 = Supabase egress/DB size。
2. **成本护栏**（§2）= 给 `health-watchdog` 加 `gatherUsage`/`evaluateUsage` 检查项 + Resend 告警。**唯一现在该投入的工程，补齐纲领 §4。**
3. **轻赞助入口**（§3）—— 小，晚于护栏，可另起 spec。
4. **广告账户就绪那半**（§4）—— 顺手再做，不急。

---

## 7. 度量（守纲领 §7：营收不进记分牌）
- 成功标准 = **成本自付 + 可信度零折损**，不是"赚了多少"。
- 护栏指标：月成本 vs $50 靶、Supabase/Vercel 用量 vs 配额、广告/赞助收入 vs 成本。
- 北极星仍是信任与手艺（AI 引用 / 回访 / 收录 / 正确性零回退），**PV 与营收只是"能不能活下去"**。
