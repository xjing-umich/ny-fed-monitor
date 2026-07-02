import type { ReactNode } from "react";
import type { Lang } from "@/lib/nav";
import type { EpvLamp, MoatSignal, PerShareUnavailable, StrikeZoneAssessment, ValuationFloor } from "@/lib/valuation";
import { deriveValuationVerdict } from "@/lib/valuation";
import { isNetNetTriggered } from "@/lib/valuation/netNet";
import type { OeDcfAssessment, MethodReconciliation } from "@/lib/valuation/types";

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

const COPY = {
  en: {
    eyebrow: "Valuation · two methods",
    panelTitle: "Earnings Power & Asset Floor",
    panelIntro: "Two intrinsic-value methods and a tangible asset floor — deterministic, not price forecasts or recommendations.",
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
    capexRamp: "Capex is in a steep ramp (heavy build-ahead investment) — owner earnings carry extra uncertainty, so read the value range with that caveat.",
    assetBelow: (ps: string) => `Price is at or below the reproducible tangible asset base (${ps} / sh) — a rarer, harder floor.`,
    modelCautions: "Model cautions",
    disclaimerSpine: "An observation from two valuation methods — not investment advice, not a buy/sell signal, and not a price target.",
    disclaimerCompact: "Zero-growth intrinsic ranges and a tangible asset floor — not investment advice, not a buy/sell signal, and not a price target.",
    priceAsOf: "Price as of",
    mayBeStale: "may be stale",
    reproductionValue: "Reproduction value",
    moat: "Moat",
    directional: "(directional)",
    oeDcfCompact: (r: string) => `Owner-earnings DCF (Buffett, zero-growth terminal): ${r} / sh.`,
    highLeverageWarning: "High leverage — ranges are a degraded approximation (see method).",
    methodSummary: "Method & numbers",
    perSh: "/ sh",
    netNet: (ps: string) =>
      `⚑ Price is below net current asset value (${ps}/share). A Graham "net-net" — historically rare and usually a sign of business distress; beware the value trap.`,
  },
  zh: {
    eyebrow: "估值 · 两种方法",
    panelTitle: "盈利能力与资产地基",
    panelIntro: "两种内在价值方法加一道有形资产地板 — 确定性计算，非价格预测、非推荐。",
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
    capexRamp: "资本开支处于陡峭爬坡（大额前置投入）— 所有者盈利附带额外不确定性，价值区间须带此保留来读。",
    assetBelow: (ps: string) => `现价已等于或低于可重置的有形资产基础（${ps} / 股）— 一道更罕见、更硬的地板。`,
    modelCautions: "模型警示",
    disclaimerSpine: "源自两种估值方法的一项观察 — 非投资建议、非买卖信号、亦非目标价。",
    disclaimerCompact: "零增长内在价值区间加一道有形资产地板 — 非投资建议、非买卖信号、亦非目标价。",
    priceAsOf: "价格截至",
    mayBeStale: "可能已过时",
    reproductionValue: "重置价值",
    moat: "护城河",
    directional: "（方向性）",
    oeDcfCompact: (r: string) => `所有者盈利 DCF（巴菲特，零增长终值）：${r} / 股。`,
    highLeverageWarning: "高杠杆 — 价值区间为降级近似（见方法）。",
    methodSummary: "方法与数字",
    perSh: "/ 股",
    netNet: (ps: string) =>
      `⚑ 现价低于每股净流动资产（${ps}）。格雷厄姆式"净 net"深度价值,历史极罕见——常伴随经营困境,须警惕价值陷阱。`,
  },
} as const;

// Model-caution sentences — bilingual; renders the engine's already-computed
// fragility flags in plain language. Observation of model sensitivity, never advice.
const CAUTION = {
  en: {
    terminal: "The estimate leans heavily on the distant future (terminal value over 70% of present value).",
    oeYield: "Owner-earnings yield diverges sharply from the 10-year Treasury (over 300 bps).",
    quickCheck: "The DCF result diverges from a zero-growth sanity check (over 50%).",
    divergence: "The two methods’ midpoints differ materially — growth assumptions warrant review (over 20%).",
    rMinusG: "Growth nearly matches the discount rate — the estimate is sensitive to assumptions.",
  },
  zh: {
    terminal: "估计高度依赖遥远的未来（终值占现值 70% 以上）。",
    oeYield: "所有者盈利收益率与 10 年期美债大幅背离（超过 300 个基点）。",
    quickCheck: "DCF 结果与零增长理智检验出现背离（超过 50%）。",
    divergence: "两种方法的中值差异显著 — 增长假设值得复核（超过 20%）。",
    rMinusG: "增长率几乎等于贴现率 — 估计对假设高度敏感。",
  },
} as const;

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
function growthSummary(floor: ValuationFloor, lang: Lang): string {
  const gv = floor.growth_value;
  if (lang === "zh") {
    if (!gv.assessable) return `增长价值无法评估${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "。"}`;
    if (gv.gated_to_zero) return "增长价值被闸至零 — 无护城河 / ROIIC ≤ WACC，故不计入任何增长价值。";
    const dur = gv.duration_years != null ? `${gv.duration_years} 年` : "建模窗口期";
    const roiic = gv.roiic != null ? `ROIIC ≈ ${pct(gv.roiic)}` : "建模 ROIIC";
    return `增长价值：若护城河在 ${dur} 内维持于 ${roiic}，则 ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / 股（中性 ${perShare(gv.per_share.neutral)}）。保守估计，非预测。`;
  }
  if (!gv.assessable) return `Growth value not assessable${gv.not_assessable_reason ? ` — ${gv.not_assessable_reason}` : "."}`;
  if (gv.gated_to_zero) return "Growth value gated to zero — no moat / ROIIC ≤ WACC, so no growth value is credited.";
  const dur = gv.duration_years != null ? `${gv.duration_years} yr` : "the modeled window";
  const roiic = gv.roiic != null ? `ROIIC ≈ ${pct(gv.roiic)}` : "the modeled ROIIC";
  return `Growth value: if the moat holds for ${dur} at ${roiic}, ${perShare(gv.per_share.pessimistic)}–${perShare(gv.per_share.optimistic)} / sh (neutral ${perShare(gv.per_share.neutral)}). Conservative, not a forecast.`;
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
}: {
  floor: ValuationFloor;
  sz: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  issuer?: string;
  ticker?: string;
  lang: Lang;
}) {
  const t = COPY[lang];
  const epv = sz.epv;
  if (!epv) return null;
  const price = sz.price.close;

  // net-net 独立信号:直接从 floor 自身的 lamp + 现价推导,不经过 verdict。
  // deriveValuationVerdict 在 isImplausibleBand(边际>80%)或无可评估 EPV 灯时会返回 null,
  // 而这恰恰是 Graham net-net 目标股(困境/亏损)的典型区间——不能让主判定的抑制连带
  // 隐藏这条独立注脚(spec 承诺 net-net 独立于 80% 护栏)。
  const nn = floor.net_net;
  const netNetTriggered = isNetNetTriggered(nn, price);

  // Single source of truth: bucket + range come from the shared pure verdict (extracted from
  // this very logic), so the card and the investor-page overlay can never drift apart.
  const verdict = deriveValuationVerdict({ floor, strikeZone: sz, oeDcf, reconciliation });
  if (!verdict) {
    // 主判定被抑制(implausible band / 无可比灯):net-net 若触发仍需独立展示,其余一律不渲染。
    if (!netNetTriggered || !nn.assessable) return null;
    return (
      <p className="text-[13px] leading-snug text-[var(--tt-faint)]">{t.netNet(perShare(nn.per_share))}</p>
    );
  }

  const oeOk = oeDcf?.assessable && finitePositive(oeDcf.per_share_low) && finitePositive(oeDcf.per_share_high);
  const conservative = oeOk ? { lo: oeDcf!.per_share_low!, hi: oeDcf!.per_share_high! } : null;
  const rangeLo = verdict.rangeLo;
  const rangeHi = verdict.rangeHi;
  const bothMethods = !!conservative && !!epv.ceilings;
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  const bucket = verdict.bucket;
  const onMethods = bothMethods ? t.bothMethods : t.thisMethod;

  const status = bucket === "below" ? t.statusBelow : bucket === "within" ? t.statusWithin : t.statusAbove;
  const sub =
    bucket === "below" ? t.subBelow(onMethods) : bucket === "within" ? t.subWithin(onMethods) : t.subAbove;
  const who = issuer ? `${issuer}${ticker ? (lang === "zh" ? `（${ticker}）` : ` (${ticker})`) : ""}${lang === "zh" ? "：" : ": "}` : "";
  const valueRange = `${usd0(rangeLo)}–${usd0(rangeHi)} ${t.perSh}`;
  const asOf = sz.price?.date ? (lang === "zh" ? `（价格 ${usd0(price)} 截至 ${sz.price.date}）` : ` (price ${usd0(price)} as of ${sz.price.date})`) : "";
  const sentence =
    lang === "zh"
      ? bothMethods
        ? `${who}两种方法为该业务估值 — 一为保守的所有者盈利 DCF，一为计入增长的 Greenwald 估计，${valueRange}。今日价格${bucket === "below" ? "低于二者" : bucket === "within" ? "落在二者之间" : "高于二者"}${asOf}。`
        : `${who}一项保守的盈利能力估计，${valueRange}；今日价格${bucket === "below" ? "低于" : bucket === "within" ? "落在其中" : "高于"}它${asOf}。`
      : bothMethods
        ? `${who}Two methods value the business — a conservative owner-earnings DCF and a growth-credited Greenwald estimate, ${valueRange}. Today’s price sits ${bucket === "below" ? "below both" : bucket === "within" ? "inside both" : "above both"}${asOf}.`
        : `${who}A conservative earnings-power estimate, ${valueRange}; today’s price sits ${bucket === "below" ? "below" : bucket === "within" ? "inside" : "above"} it${asOf}.`;

  // gauge: three categorical zones (cheaper · fair · pricier); marker placed within the
  // active zone by how far the price runs through the value range.
  const spanRange = rangeHi - rangeLo || 1;
  const marker =
    bucket === "below"
      ? 33 * clamp(price / (rangeLo || 1), 0, 1)
      : bucket === "within"
        ? 33 + 33 * clamp((price - rangeLo) / spanRange, 0, 1)
        : 66 + 33 * clamp((price - rangeHi) / (rangeHi || 1), 0, 1);
  const markerPct = clamp(marker, 2, 98);
  const zones: { key: Bucket; label: string }[] = [
    { key: "below", label: t.zoneBelow },
    { key: "within", label: t.zoneWithin },
    { key: "above", label: t.zoneAbove },
  ];

  // Model cautions — surface the engine's already-computed fragility flags in plain language.
  // Renders only when ≥1 fires. Observation of model sensitivity, never advice.
  const cautions: string[] = [];
  if (oeDcf?.terminal_dependency_flag) cautions.push(CAUTION[lang].terminal);
  if (oeDcf?.diagnostics?.oe_yield_flag) cautions.push(CAUTION[lang].oeYield);
  if (oeDcf?.diagnostics?.quick_check_flag) cautions.push(CAUTION[lang].quickCheck);
  if (reconciliation?.divergence_flag) cautions.push(CAUTION[lang].divergence);
  if (oeDcf?.diagnostics?.r_minus_g_flag) cautions.push(CAUTION[lang].rMinusG);

  return (
    <div className="space-y-3">
      {/* status */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-muted)_8%,transparent)] px-2.5 py-1 text-sm font-medium text-[var(--tt-text)]">
          {status}
        </span>
        <span className="text-sm text-[var(--tt-muted)]">{sub}</span>
      </div>

      {/* neutral cheaper → pricier gauge */}
      <div>
        <div className="relative pt-4">
          <div className="flex h-7 overflow-hidden rounded-md">
            {zones.map((z) => {
              const active = z.key === bucket;
              return (
                <div
                  key={z.key}
                  className="flex flex-1 items-center justify-center text-[10px]"
                  style={{
                    backgroundColor: `color-mix(in srgb, var(--tt-faint) ${active ? 16 : 7}%, transparent)`,
                    color: active ? "var(--tt-text)" : "var(--tt-faint)",
                  }}
                >
                  {z.label}
                </div>
              );
            })}
          </div>
          {/* price marker */}
          <div className="absolute bottom-0 top-3 w-0.5 bg-[var(--tt-accent)]" style={{ left: `${markerPct}%` }} title={`${t.priceAsOf} ${perShare(price)}`} />
          <span className="absolute top-0 -translate-x-1/2 font-mono text-[10px] text-[var(--tt-text)]" style={{ left: `${markerPct}%` }}>{usd0(price)}</span>
        </div>
        <div className="mt-1 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
          <span>{t.cheaper}</span>
          <span>{t.valueEstimate(`${usd0(rangeLo)} – ${usd0(rangeHi)}`)}</span>
          <span>{t.pricier}</span>
        </div>
      </div>

      <p className="text-sm text-[var(--tt-text)]">{sentence}</p>

      {floor.buffett_epv.method.simplifications.some((s) => s.includes("AI-hog")) ? (
        <p className="text-sm text-[var(--tt-warn)]">{t.capexRamp}</p>
      ) : null}

      {sz.assetFloor?.priceBelow ? (
        <p className="text-sm text-[var(--tt-muted)]">{t.assetBelow(usd0(sz.assetFloor.perShare))}</p>
      ) : null}

      {netNetTriggered && nn.assessable ? (
        <p className="mt-2 text-[13px] leading-snug text-[var(--tt-faint)]">
          {t.netNet(perShare(nn.per_share))}
        </p>
      ) : null}

      {cautions.length > 0 ? (
        <div className="rounded-md border border-[var(--tt-border)] bg-[color-mix(in_srgb,var(--tt-warn)_6%,transparent)] px-3 py-2">
          <p className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-warn)]">
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

      <p className="text-xs text-[var(--tt-muted)]">{t.disclaimerSpine}</p>

      <p className="text-[10px] text-[var(--tt-faint)]">
        {t.priceAsOf} {sz.price.date}
        {sz.price.source ? ` · ${sz.price.source}` : ""}
        {sz.stale ? ` · ${t.mayBeStale}` : ""}
        {oeDcf?.discount?.dgs10_date ? ` · DGS10 ${oeDcf.discount.dgs10_value != null ? pct1(oeDcf.discount.dgs10_value) : ""} @ ${oeDcf.discount.dgs10_date}` : ""}.
      </p>
    </div>
  );
}

// Price-free fallback: no axis is meaningful without a price, so show the two
// zero-growth lenses, the asset floor and moat, and the owner-earnings DCF range
// as compact text.
function CompactFloor({ floor, oeDcf, suppressedReason, lang }: { floor: ValuationFloor; oeDcf?: OeDcfAssessment; suppressedReason?: string; lang: Lang }) {
  const t = COPY[lang];
  const { graham_epv, buffett_epv, asset_floor, moat_reading } = floor;
  const lampText = (lamp: EpvLamp) =>
    lamp.assessable ? range(lamp.per_share_low, lamp.per_share_high) : (lamp.not_assessable_reason ?? (lang === "zh" ? "无法评估" : "not assessable"));
  return (
    <div className="space-y-2">
      {suppressedReason ? <p className="text-sm text-[var(--tt-muted)]">{suppressedReason}</p> : null}
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--tt-text)]">
        <span><span className="text-[var(--tt-faint)]">{graham_epv.label} </span>{lampText(graham_epv)}</span>
        <span><span className="text-[var(--tt-faint)]">{buffett_epv.label} </span>{lampText(buffett_epv)}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-[var(--tt-text)]">
        <span>
          <span className="text-[var(--tt-faint)]">{t.reproductionValue} </span>
          {asset_floor.assessable ? `${perShare(asset_floor.per_share)} ${t.perSh}` : "—"}
        </span>
        <span><span className="text-[var(--tt-faint)]">{t.moat} </span>{MOAT_SHORT[lang][moat_reading.signal]} <span className="text-[var(--tt-faint)]">{t.directional}</span></span>
      </div>
      {oeDcf?.assessable && oeDcf.per_share_low != null && oeDcf.per_share_high != null ? (
        <p className="text-sm text-[var(--tt-muted)]">{t.oeDcfCompact(range(oeDcf.per_share_low, oeDcf.per_share_high))}</p>
      ) : null}
      <p className="text-xs text-[var(--tt-muted)]">{t.disclaimerCompact}</p>
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
  return (
    <details className="text-xs text-[var(--tt-muted)]">
      <summary className="cursor-pointer text-[var(--tt-faint)] max-sm:min-h-[44px] max-sm:py-1">{t.methodSummary}</summary>
      <div className="mt-2 space-y-2">
        {/* precise numbers summary */}
        <p className="font-mono text-[var(--tt-text)]">
          {oeDcf?.assessable && oeDcf.per_share_low != null ? `${zh ? "所有者盈利 DCF" : "Owner-earnings DCF"} ${range(oeDcf.per_share_low, oeDcf.per_share_high)}` : null}
          {epv?.ceilings ? ` · Greenwald ${range(epv.ceilings.pessimistic, epv.ceilings.optimistic)} (${zh ? "中性" : "neutral"} ${perShare(epv.ceilings.neutral)})` : epv ? ` · Greenwald ${zh ? "零增长" : "zero-growth"} ${perShare(epv.base)}` : null}
          {epv ? ` · ${zh ? "零增长基准" : "zero-growth base"} ${perShare(epv.base)}` : null}
          {sz?.assetFloor ? ` · ${zh ? "重置" : "reproduction"} ${perShare(sz.assetFloor.perShare)}` : null}
        </p>
        <p>
          {t.moat} {MOAT_SHORT[lang][moat_reading.signal]}
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
        <p>{growthSummary(floor, lang)}</p>
        <p>
          {zh ? "窗口 FY " : "Window FY "}{provenance.years_used.join(", ")}{zh ? " · 贴现带 " : " · discount band "}{pct(provenance.discount_rate_band[0])}–
          {pct(provenance.discount_rate_band[1])}{zh ? " · 正常化税率 " : " · normalized tax "}{pct(provenance.normalized_tax_rate)} (
          {provenance.normalized_tax_rate_basis}){zh ? " · 股数 " : " · "}{provenance.share_count_basis}{zh ? "" : " shares"}.
        </p>
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

// Editorial panel shell — replaces the shadcn Card (which leaned on drifting
// bg-card / ring-foreground / font-heading tokens). Green-mono eyebrow → Fraunces
// title, hairline rule, matching the home-panel rhythm (StrikeLeadersCard et al.).
function Panel({ children, lang }: { children: ReactNode; lang: Lang }) {
  const t = COPY[lang];
  return (
    <section className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">
      <header className="border-b border-[var(--tt-border-strong)] pb-3">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">
          {t.eyebrow}
        </p>
        <h2 className="mt-1.5 font-display text-lg font-medium leading-tight tracking-tight text-[var(--tt-text)]">
          {t.panelTitle}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--tt-muted)]">
          {t.panelIntro}
        </p>
      </header>
      <div className="mt-4 space-y-3">{children}</div>
    </section>
  );
}

export function EarningsPowerFloorCard({
  floor,
  strikeZone,
  oeDcf,
  reconciliation,
  issuer,
  ticker,
  lang,
}: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  issuer?: string;
  ticker?: string;
  lang: Lang;
}) {
  if (!floor) return null;
  if (floor.kind === "per_share_unavailable") {
    return (
      <Panel lang={lang}>
        <p className="text-sm text-[var(--tt-muted)]">{floor.reason}</p>
      </Panel>
    );
  }

  const t = COPY[lang];
  const { graham_epv, buffett_epv, provenance } = floor;
  const hasSpine = !!strikeZone?.epv && !strikeZone.currencyMismatch;

  return (
    <Panel lang={lang}>
        {floor.high_leverage_warning ? (
          <p className="text-xs text-[var(--tt-warn)]">{t.highLeverageWarning}</p>
        ) : null}

        {!(graham_epv.assessable && buffett_epv.assessable) && provenance.earnings_basis_note ? (
          <p className="text-xs text-[var(--tt-muted)]">{provenance.earnings_basis_note}</p>
        ) : null}

        {hasSpine ? (
          <ValueSpine floor={floor} sz={strikeZone!} oeDcf={oeDcf} reconciliation={reconciliation} issuer={issuer} ticker={ticker} lang={lang} />
        ) : (
          <CompactFloor
            floor={floor}
            oeDcf={oeDcf}
            suppressedReason={strikeZone?.currencyMismatch ? strikeZone.suppressedReason : undefined}
            lang={lang}
          />
        )}

        <MethodDetails floor={floor} sz={strikeZone} oeDcf={oeDcf} reconciliation={reconciliation} lang={lang} />
    </Panel>
  );
}
