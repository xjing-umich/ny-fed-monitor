import type { FC } from "react";
import type { Lang } from "@/lib/nav";
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZoneAssessment, ValuationFloor } from "@/lib/valuation";
import { deriveValuationMethods, deriveValuationVerdict, type ValuationVerdict } from "@/lib/valuation";
import { isNetNetAssetFloor, isNetNetBuy } from "@/lib/valuation/netNet";
import type { OeDcfAssessment, MethodReconciliation, MoatCapAssessment } from "@/lib/valuation/types";
import { fmtValueBand } from "@/lib/format";
import { Display } from "@/components/common/Display";

// USD amounts use a fixed en-US grouping in BOTH locales — financial convention,
// and "en-US" (not undefined) keeps server/client output deterministic (zh-CN groups
// identically, so no visible difference). Locale only swaps the surrounding prose.
function perShare(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
// Whole-dollar form for the readable main view (precise cents live in the fold).
function usd0(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `$${Math.round(value).toLocaleString("en-US")}`;
}
function range(low: number | undefined, high: number | undefined): string {
  if (low == null || high == null) return "—";
  return `${perShare(low)} – ${perShare(high)}`;
}
function pct(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(0)}%`;
}
function pct1(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(1)}%`;
}
function usd(value: number | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

// ── Localized copy ────────────────────────────────────────────────────────────
// Compliance-sensitive: deterministic valuation observations only. Mirrors the
// established zh voice (eyebrow「估值 · 地基层」, 免责「非投资建议、非买卖信号、亦非目标价」).
const MOAT_SHORT: Record<Lang, Record<MoatSignal, string>> = {
  en: {
    franchise: "Franchise (moat)",
    commodity: "Commodity-like",
    value_destruction: "Below asset base",
    not_assessable: "Not assessable",
  },
  zh: {
    franchise: "特许经营（护城河）",
    commodity: "商品化",
    value_destruction: "低于资产基础",
    not_assessable: "无法评估",
  },
};

const MOAT_VIA_GROWTH: Record<Lang, string> = {
  en: "Franchise (via earnings growth)",
  zh: "特许经营（凭盈利增长）",
};

const COPY = {
  en: {
    statusBelow: "Margin of safety",
    statusWithin: "In fair-value range",
    statusAbove: "Above fair value",
    bothMethods: "both methods",
    thisMethod: "this method",
    subBelow: (m: string) => `Price sits below ${m}’ value estimate.`,
    subWithin: (m: string) => `Price sits within ${m}’ value estimate.`,
    subAbove: "Little to no margin of safety today.",
    zoneBelow: "margin of safety",
    zoneWithin: "fair value",
    zoneAbove: "above fair value",
    cheaper: "cheaper",
    pricier: "pricier",
    valueEstimate: (r: string) => `${r} value estimate`,
    capexRamp: "Capex doubled within two years: maintenance is floored then capped at D&A (OE may look optimistic); Greenwald growth value is closed — growth credit stays in the owner-earnings DCF only.",
    capexRampShort: "Capex doubled in two years, so maintenance is hard to pin down — read the band conservatively.",
    earningsDeclinedShort: "Recent earnings are below the multi-year average, so the band uses the lower run-rate.",
    modelSensitiveShort: "The DCF is sensitive to its staging assumptions — treat the band as a range, not a point.",
    highLeverageShort: "High financial leverage: the equity value here is a degraded approximation.",
    lowConfidenceFallback: "Inputs look fragile this year — we won't mark this as confirmed cheap.",
    bandHowToRead: "The middle figure is the main read. The right end is the optimistic case under the same conservative caps — not an absolute ceiling.",
    legendFloor: "Zero-growth floor",
    legendIv: "Central IV",
    legendHi: "Optimistic top",
    assetBelow: (ps: string) => `Price is at or below the reproducible tangible asset base (${ps} / sh) — a rarer, harder floor.`,
    modelCautions: "Model cautions",
    methodDisclaimer: "A conservative intrinsic-value band (zero-growth floor to growth-capped DCF) plus a tangible asset floor — not investment advice, not a buy/sell signal, and not a price target.",
    priceUnavailable: "No usable market price is available, so this page does not place price on the value gauge.",
    priceAsOf: "Price as of",
    mayBeStale: "may be stale",
    reproductionValue: "Reproduction value",
    moat: "Moat",
    directional: "(directional)",
    oeDcfCompact: (r: string) => `Owner-earnings DCF (Buffett): ${r} / sh. Floor keeps a zero-growth terminal; the upper end caps perpetual growth at min(10-year treasury, 3% nominal GDP).`,
    highLeverageWarning: "High leverage — ranges are a degraded approximation (see method).",
    methodSummary: "Method & numbers",
    perSh: "/ sh",
    ivHeadline: "growth-anchored intrinsic value",
    zeroGrowthHeadline: "zero-growth intrinsic value",
    netNet: (ps: string) =>
      `⚑ Price is below net current asset value (${ps}/share) — a Graham "net-net". Historically rare and usually a sign of business distress; beware the value trap.`,
    netNetBuy: (ps: string) =>
      `⚑ Price is at or below two-thirds of net current asset value (${ps}/share) — Graham's classic net-net threshold with a full margin of safety. Historically rare and usually a sign of business distress; beware the value trap.`,
    buybackOffsetsSbc: "Buybacks over the years shown roughly only offset stock-based-compensation dilution — read them as maintaining the share count, not a net return of capital.",
  },
  zh: {
    statusBelow: "安全边际",
    statusWithin: "处于合理价值区间",
    statusAbove: "高于合理价值",
    bothMethods: "两种方法",
    thisMethod: "该方法",
    subBelow: (m: string) => `现价低于${m}的价值估计。`,
    subWithin: (m: string) => `现价落在${m}的价值估计区间内。`,
    subAbove: "当前几乎没有安全边际。",
    zoneBelow: "安全边际",
    zoneWithin: "合理价值",
    zoneAbove: "高于合理价值",
    cheaper: "更便宜",
    pricier: "更贵",
    valueEstimate: (r: string) => `${r} 价值估计`,
    capexRamp: "资本开支两年翻倍：维持性 CapEx 下限后按 D&A 封顶（OE 可能偏乐观）；Greenwald 增长价值已关闭 — 成长只留在所有者盈利 DCF。",
    capexRampShort: "资本开支两年翻倍，维持性投入难分清，价值带按保守口径读。",
    earningsDeclinedShort: "最新盈利低于多年均值，价值带按更低的运行率计。",
    modelSensitiveShort: "DCF 对分档假设敏感 — 当作区间读，不要当成一个点。",
    highLeverageShort: "金融股高杠杆：这里的股权价值是降级近似。",
    lowConfidenceFallback: "今年输入偏脆，不把便宜当成确认信号。",
    bandHowToRead: "中间是主读数；右侧上沿是同一套保守假设下的乐观档，不是绝对上限。",
    legendFloor: "零增长底",
    legendIv: "中枢 IV",
    legendHi: "乐观上沿",
    assetBelow: (ps: string) => `现价已等于或低于可重置的有形资产基础（${ps} / 股）— 一道更罕见、更硬的地板。`,
    modelCautions: "模型警示",
    methodDisclaimer: "保守内在价值带（零增长底到增速封顶的 DCF）加一道有形资产地板 — 非投资建议、非买卖信号、亦非目标价。",
    priceUnavailable: "缺少可用市场价格，因此不把现价放进价值带位置条。",
    priceAsOf: "价格截至",
    mayBeStale: "可能已过时",
    reproductionValue: "重置价值",
    moat: "护城河",
    directional: "（方向性）",
    oeDcfCompact: (r: string) => `所有者盈利 DCF（巴菲特）：${r} / 股。下限保留零增长终值；上限的永续增长封顶在「10 年期国债」与「3% 名义 GDP」两者的较低值。`,
    highLeverageWarning: "高杠杆 — 价值区间为降级近似（见方法）。",
    methodSummary: "方法与数字",
    perSh: "/ 股",
    netNet: (ps: string) =>
      `⚑ 现价低于每股净流动资产（${ps}）。格雷厄姆式深度价值信号，历史极罕见——常伴随经营困境，须警惕价值陷阱。`,
    netNetBuy: (ps: string) =>
      `⚑ 现价已跌至每股净流动资产的三分之二以下（${ps}）— 格雷厄姆经典买入线，安全边际充分。历史极罕见，常伴随经营困境，须警惕价值陷阱。`,
    buybackOffsetsSbc: "所示年度的回购大体只抵消了股权激励（SBC）造成的稀释 — 应视为维持股本、而非净额回馈股东。",
    ivHeadline: "含增长中枢内在价值",
    zeroGrowthHeadline: "零增长内在价值",
  },
} as const;

/** 首屏可见的低信心原因（最多 2 条）；折叠区保留完整模型警示。 */
function confidenceCallouts(
  floor: ValuationFloor,
  oeDcf: OeDcfAssessment | undefined,
  lang: Lang,
): string[] {
  const t = COPY[lang];
  const out: string[] = [];
  if (floor.ai_capex_distortion_warning) out.push(t.capexRampShort);
  if (oeDcf?.declined) out.push(t.earningsDeclinedShort);
  if (oeDcf?.diagnostics?.quick_check_flag) out.push(t.modelSensitiveShort);
  if (floor.high_leverage_warning && floor.is_financial) out.push(t.highLeverageShort);
  if (out.length === 0) out.push(t.lowConfidenceFallback);
  return out.slice(0, 2);
}

// 假设明示行:头条 IV 的依据一次说清 —— 增长率来源(历史/基本面较小值·护城河封顶)、
// 护城河年数、折现率、零增长下行(F)。无中枢 IV(单灯兜底)时只显零增长口径,不虚构增长假设。
function assumptionsLine(
  oeDcf: OeDcfAssessment | undefined,
  rangeLo: number,
  lang: Lang,
  hasIv: boolean,
): string {
  const zh = lang === "zh";
  const floorPart = zh ? `零增长下行 ${usd0(rangeLo)}` : `Zero-growth downside ${usd0(rangeLo)}`;
  if (!hasIv || !oeDcf?.assessable) return floorPart;

  const g1 = oeDcf.growth_g1;
  const growthPart = oeDcf.declined
    ? zh
      ? "营收增 0%（历史下滑，封顶为零）"
      : "Revenue growth 0% (history declining, capped at zero)"
    : g1 != null
      ? zh
        ? `营收增 ${pct(g1)}（历史增长与基本面上限的较小值，受护城河封顶）`
        : `Revenue growth ${pct(g1)} (lower of historical trend and fundamental cap, capped by moat)`
      : null;
  const moatPart =
    oeDcf.moatCap?.capYears != null ? (zh ? `护城河 ${oeDcf.moatCap.capYears} 年` : `moat ${oeDcf.moatCap.capYears} yr`) : null;
  const discountPart =
    oeDcf.discount?.midpoint != null
      ? zh
        ? `折现 ${pct1(oeDcf.discount.midpoint)}`
        : `discount ${pct1(oeDcf.discount.midpoint)}`
      : null;
  return [growthPart, moatPart, discountPart, floorPart].filter((p): p is string => !!p).join(" · ");
}

// Model-caution sentences — bilingual; renders the engine's already-computed
// fragility flags in plain language. Observation of model sensitivity, never advice.
const CAUTION = {
  en: {
    terminal: "The estimate leans heavily on the distant future (terminal value over 70% of present value).",
    oeYield: "Owner-earnings yield diverges sharply from the 10-year Treasury (over 300 bps).",
    quickCheck: "The DCF result diverges sharply from a matched-growth benchmark (over 50%) — the model is sensitive to its staging.",
    divergence: "The two methods’ midpoints differ materially — growth assumptions warrant review (over 20%).",
    rMinusG: "Growth nearly matches the discount rate — the estimate is sensitive to assumptions.",
  },
  zh: {
    terminal: "估计高度依赖遥远的未来（终值占现值 70% 以上）。",
    oeYield: "所有者盈利收益率与 10 年期美债大幅背离（超过 300 个基点）。",
    quickCheck: "DCF 结果与同增长基准显著背离（超过 50%）— 模型对分档假设敏感。",
    divergence: "两种方法的中值差异显著 — 增长假设值得复核（超过 20%）。",
    rMinusG: "增长率几乎等于贴现率 — 估计对假设高度敏感。",
  },
} as const;

// 杠杆 → 股权成本溢价披露(Task 7):折现率不再全站同一个数,必须说清这只票为什么被多收。
// 只用结构化数字(leverage_premium / net_debt_to_owner_earnings)按 locale 各自拼句——
// 禁用 leverage_premium_basis(引擎层英文 prose,拼进 buffett_epv.method.simplifications 供
// 内部消费,不是本地化来源)。净现金 / 数据缺失 → premium 恒为 0,函数返回 null(无噪音)。
function leveragePremiumDisclosure(floor: ValuationFloor, lang: Lang): string | null {
  const premium = floor.leverage_premium;
  if (premium == null || !(premium > 0)) return null;
  const [baseLo, baseHi] = floor.provenance.discount_rate_band;
  const actualLo = floor.buffett_epv.method.discount_rate_low;
  const actualHi = floor.buffett_epv.method.discount_rate_high;
  const L = floor.net_debt_to_owner_earnings;
  const years = L != null && Number.isFinite(L) ? L.toFixed(1) : "—";
  const pp = (premium * 100).toFixed(1);
  // 精度对齐引擎 method.denominator(Buffett 灯自己拼的句子,epvFloor.ts 用 toFixed(1))：
  // 基线 9%/11% 本身是整数常量,pct()(0位小数)原样显示不失真;但 baseline+premium 之和
  // 只有在「实际」也按 1 位小数四舍五入时才等式成立 —— 否则 9+2.6=11.6 被现实中的 pct()
  // 圆整成 12,句子自证不了自己的加法。改用 pct1 让「实际」与引擎同一精度、同一份数字。
  return lang === "zh"
    ? `基线 ${pct(baseLo)}–${pct(baseHi)}，净债务约 ${years} 年所有者盈利 → 加 ${pp} 个百分点风险溢价 → 实际 ${pct1(actualLo)}–${pct1(actualHi)}。`
    : `Baseline ${pct(baseLo)}–${pct(baseHi)}, net debt ≈ ${years} years of owner earnings → +${pp}pp cost-of-equity premium → effective ${pct1(actualLo)}–${pct1(actualHi)}.`;
}

function valuationCautions(
  oeDcf: OeDcfAssessment | undefined,
  reconciliation: MethodReconciliation | undefined,
  lang: Lang,
  floor?: ValuationFloor,
): string[] {
  const cautions: string[] = [];
  if (floor?.ai_capex_distortion_warning) cautions.push(COPY[lang].capexRamp);
  if (oeDcf?.terminal_dependency_flag) cautions.push(CAUTION[lang].terminal);
  if (oeDcf?.diagnostics?.oe_yield_flag) cautions.push(CAUTION[lang].oeYield);
  if (oeDcf?.diagnostics?.quick_check_flag) cautions.push(CAUTION[lang].quickCheck);
  if (reconciliation?.divergence_flag) cautions.push(CAUTION[lang].divergence);
  if (oeDcf?.diagnostics?.r_minus_g_flag) cautions.push(CAUTION[lang].rMinusG);
  return cautions;
}

// Full method note for one lamp — rendered only inside the collapsible details.
function LampMethod({ lamp, lang }: { lamp: EpvLamp; lang: Lang }) {
  const t = COPY[lang];
  return (
    <div>
      <p className="font-medium text-[var(--tt-faint)]">
        {lamp.label}
        {lamp.assessable ? <span className="ml-1 font-mono text-[var(--tt-muted)]">{range(lamp.per_share_low, lamp.per_share_high)} {t.perSh}</span> : null}
      </p>
      {!lamp.assessable && lamp.not_assessable_reason ? <p>{lamp.not_assessable_reason}</p> : null}
      <p>
        {lamp.method.earnings_basis} {lamp.method.leverage_treatment} {lamp.method.denominator} {lamp.method.bridge}
      </p>
      <p>{lang === "zh" ? "年份：" : "Years: "}{lamp.method.years_used.join(", ")}</p>
      {lamp.method.simplifications.length > 0 ? <p>{lang === "zh" ? "v1 简化：" : "v1 simplifications: "}{lamp.method.simplifications.join(" ")}</p> : null}
    </div>
  );
}

// Compact growth-value provenance for the folded method section (assumptions externalized).
// gated_to_zero 按结构化原因本地化（AI-hog / moat_via_growth / 无护城河），禁止写死错因。
function growthSummary(floor: ValuationFloor, lang: Lang): string {
  const gv = floor.growth_value;
  const zh = lang === "zh";
  if (!gv.assessable) {
    return zh
      ? `增长价值无法评估${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "。"}`
      : `Growth value not assessable${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "."}`;
  }
  if (gv.gated_to_zero) {
    if (floor.ai_capex_distortion_warning) {
      return zh
        ? "增长价值被闸至零 — 资本开支两年翻倍（AI-hog），成长只留在所有者盈利 DCF，避免双重计入。"
        : "Growth value gated to zero — capex doubled within two years (AI-hog); growth credit stays in the owner-earnings DCF only.";
    }
    if (floor.moat_reading.moat_via_growth) {
      return zh
        ? "增长价值被闸至零 — 护城河来自盈利增长旁路，成长只留在所有者盈利 DCF。"
        : "Growth value gated to zero — franchise via earnings-growth bypass; growth credit stays in the owner-earnings DCF only.";
    }
    return zh
      ? "增长价值被闸至零 — 无护城河或 ROIIC ≤ WACC，故不计入增长价值。"
      : "Growth value gated to zero — no moat or ROIIC ≤ WACC, so no growth value is credited.";
  }
  const dur = gv.duration_years != null ? (zh ? `${gv.duration_years} 年` : `${gv.duration_years} yr`) : zh ? "建模窗口期" : "the modeled window";
  const roiic = gv.roiic != null ? `ROIIC ≈ ${pct(gv.roiic)}` : zh ? "建模 ROIIC" : "the modeled ROIIC";
  return zh
    ? `增长价值：若护城河在 ${dur} 内维持于 ${roiic}，则 ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / 股（中性 ${perShare(gv.per_share.neutral)}）。保守估计，非预测。`
    : `Growth value: if the moat holds for ${dur} at ${roiic}, ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / sh (neutral ${perShare(gv.per_share.neutral)}). Conservative, not a forecast.`;
}

// moat → 竞争优势期（CAP，Phase 2）披露：仅 grade!=="none" 渲染。文案在组件内按 locale 构建
// ——禁用 moatCap.basis（那是中文单语判据串，直接塞进 en 会串味）。无买卖/目标价。
function capDisclosure(moatCap: MoatCapAssessment | undefined, lang: Lang): string | null {
  if (!moatCap || moatCap.grade === "none") return null;
  const y = moatCap.capYears;
  if (moatCap.grade === "strong") {
    return lang === "zh"
      ? `假设宽护城河 · 竞争优势期约 ${y} 年（盈利未衰退、ROIC 历史稳定）。`
      : `Assumes a wide moat · competitive-advantage period ≈ ${y} years (earnings intact, ROIC stable over history).`;
  }
  return lang === "zh"
    ? `假设一般护城河 · 竞争优势期约 ${y} 年。`
    : `Assumes a narrow moat · competitive-advantage period ≈ ${y} years.`;
}

// Where the price sits relative to the combined value range — three plain buckets.
// (bucket derivation lives in the shared deriveValuationVerdict pure fn — single source of truth.)
type Bucket = "below" | "within" | "above";

// The readable read: a plain status (margin of safety / fair value / above fair value),
// a neutral cheaper→pricier gauge with the price marker, one sentence. Every precise
// number lives in the folded method section. Renders only with a price-aware assessment.
function ValueSpine({
  floor,
  sz,
  oeDcf,
  reconciliation,
  issuer,
  ticker,
  lang,
  showStatus = true,
  verdict: suppliedVerdict,
}: {
  floor: ValuationFloor;
  sz: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  issuer?: string;
  ticker?: string;
  lang: Lang;
  /** 结论状态(安全边际/合理区间/高于价值)是否在卡内渲染。个股页把结论上提到区块 Fraunces
   *  标题时传 false, 避免与标题重复 —— 位置带与句子仍留在卡内。 */
  showStatus?: boolean;
  /** undefined 保留遗留自算；null 或对象使用编排层的权威结论。 */
  verdict?: ValuationVerdict | null;
}) {
  const t = COPY[lang];
  const epv = sz.epv;
  if (!epv) return null;
  const price = sz.price.close;

  // Single source of truth: bucket + range come from the shared pure verdict (extracted from
  // this very logic), so the card and the investor-page overlay can never drift apart.
  const verdict =
    suppliedVerdict === undefined
      ? deriveValuationVerdict({
          floor,
          strikeZone: sz,
          oeDcf,
          reconciliation,
          methods: deriveValuationMethods({ floor, strikeZone: sz, oeDcf }),
        })
      : suppliedVerdict;
  if (!verdict) return null;

  const oeOk = verdict.methods.oeDcf;
  const conservative = oeOk ? { lo: oeDcf!.per_share_low!, hi: oeDcf!.per_share_high! } : null;
  const rangeLo = verdict.rangeLo;
  const rangeHi = verdict.rangeHi;
  const bothMethods = verdict.methods.oeDcf && verdict.methods.greenwaldGrowthCeilings;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  // Growth-anchored intrinsic value (headline number) — mirrors deriveValuationVerdict's own
  // hasIv/IV derivation so the headline can never disagree with the bucket it's inside of.
  // No IV (oeDcf not assessable / tiers missing) → single-lamp fallback, headline drops to the
  // zero-growth floor F (today's number), same as the verdict's own fallback anchor.
  const ivRaw = oeDcf?.assessable ? oeDcf.tiers?.neutral.per_share : undefined;
  const hasIv = ivRaw != null && Number.isFinite(ivRaw) && ivRaw > 0;
  const IV = hasIv ? (ivRaw as number) : undefined;
  const headline = hasIv ? IV! : rangeLo;

  const bucket = verdict.bucket;
  // OE-DCF 可评估但 Greenwald GV 被闸（如 AI-hog）→ 仍是「含增长价值带」，勿写成单灯一项估计。
  const hasGrowthBand = !!conservative;
  const onMethods = bothMethods ? t.bothMethods : t.thisMethod;

  const status = bucket === "below" ? t.statusBelow : bucket === "within" ? t.statusWithin : t.statusAbove;
  const sub =
    bucket === "below" ? t.subBelow(onMethods) : bucket === "within" ? t.subWithin(onMethods) : t.subAbove;
  const who = issuer ? `${issuer}${ticker ? (lang === "zh" ? `（${ticker}）` : ` (${ticker})`) : ""}${lang === "zh" ? "：" : ": "}` : "";
  const valueRange = `${fmtValueBand(rangeLo, rangeHi, usd0)} ${t.perSh}`;
  const asOf = sz.price?.date ? (lang === "zh" ? `（价格 ${usd0(price)} 截至 ${sz.price.date}）` : ` (price ${usd0(price)} as of ${sz.price.date})`) : "";
  const posZh =
    bucket === "below" ? "低于" : bucket === "within" ? "落在" : "高于";
  const posEn =
    bucket === "below" ? "below" : bucket === "within" ? "inside" : "above";
  const sentence =
    lang === "zh"
      ? bothMethods
        ? `${who}两种方法为该业务估值 — 一为保守的所有者盈利 DCF，一为计入增长的 Greenwald 估计，${valueRange}。今日价格${bucket === "below" ? "低于二者" : bucket === "within" ? "落在二者之间" : "高于二者"}${asOf}。`
        : hasGrowthBand && hasIv
          ? `${who}保守价值带 ${valueRange}（零增长底到增速封顶的乐观上沿），中枢约 ${usd0(IV)}。今日价格${bucket === "within" ? "落在这条带内" : `${posZh}这条带`}${asOf}。`
          : `${who}一项保守的盈利能力估计，${valueRange}；今日价格${posZh}${bucket === "within" ? "其中" : "它"}${asOf}。`
      : bothMethods
        ? `${who}Two methods value the business — a conservative owner-earnings DCF and a growth-credited Greenwald estimate, ${valueRange}. Today’s price sits ${bucket === "below" ? "below both" : bucket === "within" ? "inside both" : "above both"}${asOf}.`
        : hasGrowthBand && hasIv
          ? `${who}A conservative value band ${valueRange} (zero-growth floor to growth-capped optimistic top); central read about ${usd0(IV)}. Today’s price sits ${posEn} that band${asOf}.`
          : `${who}A conservative earnings-power estimate, ${valueRange}; today’s price sits ${posEn} it${asOf}.`;

  const callouts = !verdict.reliable ? confidenceCallouts(floor, oeDcf, lang) : [];

  // gauge: three categorical zones (cheaper · fair · pricier); marker placed within the
  // active zone by how far the price runs through the value range. The below/within split
  // is the IV boundary when a growth-anchored IV exists (matches the verdict's own bucket
  // logic) — falls back to the zero-growth floor F when there's no IV (single-lamp path,
  // identical to today's placement).
  const belowBoundary = hasIv ? IV! : rangeLo;
  const spanWithin = rangeHi - belowBoundary || 1;
  const marker =
    bucket === "below"
      ? 33 * clamp(price / (belowBoundary || 1), 0, 1)
      : bucket === "within"
        ? 33 + 33 * clamp((price - belowBoundary) / spanWithin, 0, 1)
        : 66 + 33 * clamp((price - rangeHi) / (rangeHi || 1), 0, 1);
  const markerPct = clamp(marker, 2, 98);
  const zones: { key: Bucket; label: string }[] = [
    { key: "below", label: t.zoneBelow },
    { key: "within", label: t.zoneWithin },
    { key: "above", label: t.zoneAbove },
  ];

  return (
    <div className="space-y-3">
      {/* headline — single anchor number for this card. Growth-anchored IV when assessable,
          otherwise the zero-growth floor F (single-lamp fallback, today's number). */}
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tracking-tight text-[var(--tt-text)]">{usd0(headline)}</span>
        <span className="text-xs text-[var(--tt-muted)]">{t.perSh} · {hasIv ? t.ivHeadline : t.zeroGrowthHeadline}</span>
      </div>

      {/* status — 个股页把结论上提到区块标题时(showStatus=false)不再在卡内重复 */}
      {showStatus && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-muted)_8%,transparent)] px-2.5 py-1 text-sm font-medium text-[var(--tt-text)]">
            {status}
          </span>
          <span className="text-sm text-[var(--tt-muted)]">{sub}</span>
        </div>
      )}

      {/* neutral cheaper → pricier gauge — instrument-dial signature render:
          击球区段绿底描边 + 发光价格游标 + Display 大号读数。 */}
      <div>
        <div className="relative pt-12 sm:pt-14">
          <div className="flex h-8 overflow-hidden rounded-md sm:h-7">
            {zones.map((z) => {
              const active = z.key === bucket;
              // 击球区段(below=安全边际,与 deriveValuationVerdict.inStrikeZone 同侧):
              // var(--tt-positive) 15% 底 + 1px 边缘 50%,刻度盘上的"可行动区"。
              const strike = z.key === "below";
              return (
                <div
                  key={z.key}
                  className="flex flex-1 items-center justify-center px-0.5 text-[10px] leading-tight sm:text-[11px]"
                  style={{
                    backgroundColor: strike
                      ? "color-mix(in srgb, var(--tt-positive) 15%, transparent)"
                      : `color-mix(in srgb, var(--tt-faint) ${active ? 16 : 7}%, transparent)`,
                    color: active ? "var(--tt-text)" : "var(--tt-faint)",
                    ...(strike
                      ? {
                          borderLeft:
                            "1px solid color-mix(in srgb, var(--tt-positive) 50%, transparent)",
                          borderRight:
                            "1px solid color-mix(in srgb, var(--tt-positive) 50%, transparent)",
                        }
                      : null),
                  }}
                >
                  {z.label}
                </div>
              );
            })}
          </div>
          {/* IV marker — the below/within boundary; only drawn when a growth-anchored IV exists. */}
          {hasIv ? (
            <div
              className="absolute bottom-0 top-10 w-px border-l border-dashed border-[var(--tt-faint)] sm:top-12"
              style={{ left: "33%" }}
              title={`IV ${perShare(IV)}`}
            />
          ) : null}
          {/* price cursor — 全站唯一 glow(box-shadow: var(--glow-primary))落点;
              动效白名单:仅 left 过渡(var(--tt-dur) var(--tt-ease)),无循环/关键帧。 */}
          <div
            className="absolute bottom-0 top-10 w-0.5 bg-[var(--tt-accent)] sm:top-12"
            style={{
              left: `${markerPct}%`,
              boxShadow: "var(--glow-primary)",
              transition: "left var(--tt-dur) var(--tt-ease)",
            }}
            title={`${t.priceAsOf} ${perShare(price)}`}
          />
          {/* 价格读数:Display xl 刻度盘读数窗,跟随游标;max/min 钳制防贴边溢出。 */}
          <span
            className="absolute top-0 -translate-x-1/2"
            style={{ left: `max(4.5rem, min(calc(100% - 4.5rem), ${markerPct}%))` }}
          >
            <Display as="span" size="xl">{usd0(price)}</Display>
          </span>
        </div>
        <div className="mt-1.5 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
          <span>{t.cheaper}</span>
          <span>{t.pricier}</span>
        </div>
        {/* 三锚点图例：H5 三列等宽，避免一条长破折号在窄屏挤成一团。 */}
        {hasIv ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-[10px] leading-tight text-[var(--tt-faint)]">{t.legendFloor}</p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--tt-muted)] sm:text-sm">{usd0(rangeLo)}</p>
            </div>
            <div>
              <p className="text-[10px] leading-tight text-[var(--tt-faint)]">{t.legendIv}</p>
              <p className="mt-0.5 font-mono text-xs font-semibold tabular-nums text-[var(--tt-text)] sm:text-sm">{usd0(IV)}</p>
            </div>
            <div>
              <p className="text-[10px] leading-tight text-[var(--tt-faint)]">{t.legendHi}</p>
              <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--tt-muted)] sm:text-sm">{usd0(rangeHi)}</p>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-center font-mono text-[11px] text-[var(--tt-faint)]">
            {t.valueEstimate(fmtValueBand(rangeLo, rangeHi, usd0))}
          </p>
        )}
      </div>

      <p className="text-sm leading-relaxed text-[var(--tt-text)]">{sentence}</p>

      {/* 首屏可读：价值带怎么读 + 低信心具体原因（不进折叠）。 */}
      {hasIv ? <p className="text-sm leading-relaxed text-[var(--tt-muted)]">{t.bandHowToRead}</p> : null}
      {callouts.length > 0 ? (
        <ul className="space-y-1.5 border-l-2 border-[color-mix(in_srgb,var(--tt-warn)_55%,transparent)] pl-3">
          {callouts.map((line) => (
            <li key={line} className="text-sm leading-relaxed text-[var(--tt-warn)]">
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      {/* assumptions — what the headline IV rests on: growth source, moat CAP, discount, and
          the zero-growth downside if growth doesn't show up. */}
      <p className="text-xs leading-relaxed text-[var(--tt-muted)]">{assumptionsLine(oeDcf, rangeLo, lang, hasIv)}</p>

      <p className="text-[11px] leading-relaxed text-[var(--tt-faint)]">
        {t.priceAsOf} {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? ` · ${t.mayBeStale}` : ""}
        {oeDcf?.discount?.dgs10_date ? ` · DGS10 ${oeDcf.discount.dgs10_value != null ? pct1(oeDcf.discount.dgs10_value) : ""} @ ${oeDcf.discount.dgs10_date}` : ""}.
      </p>
    </div>
  );
}

// Price-free fallback: no axis is meaningful without a price, so keep the public
// read to one sentence and leave numbers in MethodDetails.
function CompactFloor({ suppressedReason, lang }: { suppressedReason?: string; lang: Lang }) {
  const t = COPY[lang];
  return (
    <div className="space-y-2">
      {suppressedReason ? <p className="text-sm text-[var(--tt-muted)]">{suppressedReason}</p> : null}
      <p className="text-sm text-[var(--tt-text)]">{t.priceUnavailable}</p>
    </div>
  );
}

// Everything precise and secondary, collapsed by default: a one-line numbers summary,
// then per-lamp method notes, asset/moat basis, growth value, the window/tax/shares
// provenance, and the owner-earnings DCF assumptions.
function MethodDetails({
  floor,
  sz,
  oeDcf,
  reconciliation,
  lang,
}: {
  floor: ValuationFloor;
  sz?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  lang: Lang;
}) {
  const t = COPY[lang];
  const zh = lang === "zh";
  const { graham_epv, buffett_epv, asset_floor, moat_reading, provenance } = floor;
  const epv = sz?.epv;
  const netNetAssetFloor = sz?.price ? isNetNetAssetFloor(floor.net_net, sz.price.close) : false;
  const netNetBuy = sz?.price ? isNetNetBuy(floor.net_net, sz.price.close) : false;
  const cautions = valuationCautions(oeDcf, reconciliation, lang, floor);
  const capNote = oeDcf?.assessable ? capDisclosure(oeDcf.moatCap, lang) : null;
  const leverageNote = leveragePremiumDisclosure(floor, lang);
  return (
    <details className="text-xs text-[var(--tt-muted)]">
      <summary className="cursor-pointer text-[var(--tt-faint)] max-sm:min-h-[44px] max-sm:py-1">{t.methodSummary}</summary>
      <div className="mt-2 space-y-2">
        {/* Fix 2(Task 8 whole-branch review):非金融股的高杠杆现已由 leverage_premium 定价进折现带
            (spec D4/D7,见下方 leverageNote),不再是"降级近似";这条警示只对金融股仍成立
            (金融股豁免溢价,9–11% 带对它们仍是未定价的低杠杆近似)。*/}
        {floor.high_leverage_warning && floor.is_financial ? (
          <p className="text-[var(--tt-warn)]">{t.highLeverageWarning}</p>
        ) : null}
        {!(graham_epv.assessable && buffett_epv.assessable) && provenance.earnings_basis_note ? (
          <p>{provenance.earnings_basis_note}</p>
        ) : null}
        {sz?.assetFloor?.priceBelow ? <p>{t.assetBelow(usd0(sz.assetFloor.perShare))}</p> : null}
        {floor.net_net.assessable && netNetBuy ? (
          <p>{t.netNetBuy(perShare(floor.net_net.per_share))}</p>
        ) : floor.net_net.assessable && netNetAssetFloor ? (
          <p>{t.netNet(perShare(floor.net_net.per_share))}</p>
        ) : null}
        {buffett_epv.buyback_offsets_sbc ? <p>{t.buybackOffsetsSbc}</p> : null}
        {cautions.length > 0 ? (
          <div className="rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-warn)_6%,transparent)] px-3 py-2">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-warn)]">
              {t.modelCautions}
            </p>
            <ul className="mt-1.5 space-y-1">
              {cautions.map((c, i) => (
                <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-[var(--tt-muted)]">
                  <span aria-hidden className="text-[var(--tt-warn)]">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <p>{t.methodDisclaimer}</p>
        {/* precise numbers summary */}
        <p className="font-mono text-[var(--tt-text)]">
          {oeDcf?.assessable && oeDcf.per_share_low != null ? `${zh ? "所有者盈利 DCF" : "Owner-earnings DCF"} ${range(oeDcf.per_share_low, oeDcf.per_share_high)}` : null}
          {epv?.ceilings ? ` · Greenwald ${range(epv.ceilings.pessimistic, epv.ceilings.optimistic)} (${zh ? "中性" : "neutral"} ${perShare(epv.ceilings.neutral)})` : epv ? ` · Greenwald ${zh ? "零增长" : "zero-growth"} ${perShare(epv.base)}` : null}
          {epv ? ` · ${zh ? "零增长基准" : "zero-growth base"} ${perShare(epv.base)}` : null}
          {sz?.assetFloor ? ` · ${zh ? "重置" : "reproduction"} ${perShare(sz.assetFloor.perShare)}` : null}
        </p>
        <p>
          {t.moat} {moat_reading.signal === "franchise" && moat_reading.moat_via_growth === true ? MOAT_VIA_GROWTH[lang] : MOAT_SHORT[lang][moat_reading.signal]}
          {oeDcf?.assessable && oeDcf.terminal_share_pct != null ? ` · ${zh ? "终值占现值" : "terminal value"} ${pct(oeDcf.terminal_share_pct)}${zh ? "" : " of present value"}${oeDcf.terminal_dependency_flag ? (zh ? "（>70% — 依赖遥远未来）" : " (>70% — leans on the distant future)") : ""}` : ""}
          {oeDcf?.diagnostics?.oe_yield != null ? ` · ${zh ? "所有者盈利收益率" : "owner-earnings yield"} ${pct(oeDcf.diagnostics.oe_yield)}${oeDcf.discount?.dgs10_value != null ? ` ${zh ? "对 10Y" : "vs 10Y"} ${pct1(oeDcf.discount.dgs10_value)}` : ""}` : ""}.
        </p>
        <LampMethod lamp={graham_epv} lang={lang} />
        <LampMethod lamp={buffett_epv} lang={lang} />
        {asset_floor.assessable && (finitePositive(asset_floor.tangible_net_assets) || finitePositive(asset_floor.capitalized_rd)) ? (
          <p>
            {zh ? "重置价值 = 有形净资产 " : "Reproduction value = tangible net assets "}{usd(asset_floor.tangible_net_assets)}
            {finitePositive(asset_floor.capitalized_rd)
              ? `${zh ? " + 资本化研发 " : " + capitalized R&D "}${usd(asset_floor.capitalized_rd)}${asset_floor.rd_years_used?.length ? `（FY ${asset_floor.rd_years_used.join(", ")}）` : ""}`
              : ""}
            {` = ${perShare(asset_floor.per_share)} ${t.perSh}`}. {asset_floor.basis}
          </p>
        ) : (
          <p>{zh ? "资产地板：" : "Asset floor: "}{asset_floor.basis}</p>
        )}
        <p>{zh ? "护城河读数：" : "Moat reading: "}{moat_reading.basis_note}</p>
        {capNote ? <p>{capNote}</p> : null}
        <p>{growthSummary(floor, lang)}</p>
        <p>
          {zh ? "窗口 FY " : "Window FY "}{provenance.years_used.join(", ")}{zh ? " · 贴现带 " : " · discount band "}{pct(provenance.discount_rate_band[0])}–
          {pct(provenance.discount_rate_band[1])}{zh ? " · 正常化税率 " : " · normalized tax "}{pct(provenance.normalized_tax_rate)} (
          {provenance.normalized_tax_rate_basis}){zh ? " · 股数 " : " · "}{provenance.share_count_basis}{zh ? "" : " shares"}.
        </p>
        {leverageNote ? <p>{leverageNote}</p> : null}
        {oeDcf?.assessable ? (
          <p>
            {zh ? "所有者盈利 DCF：增长 g₁ " : "Owner-earnings DCF: growth g₁ "}{pct(oeDcf.growth_g1)}
            {oeDcf.declined ? (zh ? "（历史下滑 → 封顶为 0）" : " (history declining → capped at 0)") : ""}{zh ? " · OE FY " : " · OE FY "}{oeDcf.oe_fiscal_years?.join(", ")} ·{" "}
            {oeDcf.discount?.note} {oeDcf.no_bridge_note}
            {reconciliation?.comparable && reconciliation.divergence_pct != null
              ? (zh ? ` 两法中值差 ${pct(reconciliation.divergence_pct)}。` : ` Two-method midpoint gap ${pct(reconciliation.divergence_pct)}.`)
              : ""}
          </p>
        ) : null}
        {floor.high_leverage_note ? <p>{floor.high_leverage_note}</p> : null}
      </div>
    </details>
  );
}

export const EarningsPowerFloorCard: FC<{
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  /** `undefined` keeps legacy self-derivation; `null` suppresses the value spine. */
  verdict?: ValuationVerdict | null;
  issuer?: string;
  ticker?: string;
  lang: Lang;
  /** false → 卡内不渲染结论状态行(个股页把结论上提到区块 Fraunces 标题)。 */
  showStatus?: boolean;
}> = ({
  floor,
  strikeZone,
  oeDcf,
  reconciliation,
  verdict,
  issuer,
  ticker,
  lang,
  showStatus = true,
}) => {
  if (!floor) return null;
  const t = COPY[lang];
  if (floor.kind === "per_share_unavailable") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-[var(--tt-muted)]">{floor.reason}</p>
        <details className="text-xs text-[var(--tt-muted)]">
          <summary className="cursor-pointer text-[var(--tt-faint)] max-sm:min-h-[44px] max-sm:py-1">
            {t.methodSummary}
          </summary>
          <p className="mt-2">{t.methodDisclaimer}</p>
        </details>
      </div>
    );
  }

  const hasSpine = verdict !== null && !!strikeZone?.epv && !strikeZone.currencyMismatch;

  return (
    <div className="space-y-3">
      {hasSpine ? (
        <ValueSpine floor={floor} sz={strikeZone!} oeDcf={oeDcf} reconciliation={reconciliation} issuer={issuer} ticker={ticker} lang={lang} showStatus={showStatus} verdict={verdict} />
      ) : (
        <CompactFloor
          suppressedReason={strikeZone?.currencyMismatch ? strikeZone.suppressedReason : undefined}
          lang={lang}
        />
      )}

      <MethodDetails floor={floor} sz={strikeZone} oeDcf={oeDcf} reconciliation={reconciliation} lang={lang} />
    </div>
  );
};
