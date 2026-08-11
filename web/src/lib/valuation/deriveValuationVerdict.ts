// deriveValuationVerdict.ts — 把"现价相对保守价值带的位置档"判定抽成纯函数（零 I/O）。
// 逻辑逐字搬运自 EarningsPowerFloorCard 的 ValueSpine：估值卡与投资人页叠加层共用此函数，
// 保证 bucket 永不漂移。OBSERVATION，非推荐——无 BUY/SELL/目标价。
// 本函数内的护栏(与 isImplausibleBand / assessReliability 并列登记):
//  - isImplausibleBand：价值带与现价严重脱节(坏数据/假深度低估)→ 整条抑制为 null。
//  - assessReliability：引擎自身红旗(高杠杆/ai_capex失真/盈利下滑/DCF不稳/极端OE收益率)→
//    不整条抑制，只把 reliable 标 false（位置仍展示，只是不标"便宜"）。
//  - splitCoverageStale（入参，由 isSplitCoverageStale 算出）：拆股口径陈旧，
//    基本面 as-of 早于最近拆股 → 每股口径与拆股后价格错配 → 整条抑制为 null，语义同 isImplausibleBand。
//  - capitalStructureDistorted（入参，由 floor.moat_reading.capital_structure_distorted 算出）：
//    多年回购把股东权益打成深度负值 → 重置价值/护城河不可从资产端评估 → 整条抑制为 null，语义同上。
//  - fundamentalsCorrupt（入参，由 fundamentalsIntegrityViolated 算出）：基本面口径损坏
//    (opInc>revenue / gross>revenue,物理不可能,通常是 SEC XBRL 营收概念取错)→ 整条抑制为 null。
import type {
  MethodReconciliation,
  OeDcfAssessment,
  PerShareUnavailable,
  StrikeZoneAssessment,
  ValuationFloor,
  ValuePosition,
} from "./types";
import type { ValuationMethods } from "./deriveValuationMethods";
import { isNetNetAssetFloor, isNetNetBuy } from "./netNet";

export type VerdictBucket = "below" | "within" | "above";
export type VerdictCoverage = "full" | "single_lamp";

export type ValuationVerdict = {
  /** 现价相对保守价值带的位置：below=有安全边际 / within=带内 / above=高于。有中枢 IV 时锚 IV；单灯退回零增长底(valueFloor)。 */
  bucket: VerdictBucket;
  /** below 的深折扣子集：有中枢 IV 时 = 现价 ≤ IV×(1−MOS)，MOS 随 growthReliance 在 1/3~45% 间浮动；单灯退回 epv.position === "in_strike_zone"（零增长底 ×2/3，今天行为不变）。引擎权威标志。 */
  inStrikeZone: boolean;
  /** 展示用价值带下沿（每股，= epv.valueFloor 零增长保守底 F；无论是否有中枢 IV 均不变）。 */
  rangeLo: number;
  /** 展示用价值带上沿（每股，= 两法各端的最大值）。 */
  rangeHi: number;
  /** 判定所用现价。 */
  price: number;
  /** 价格 as-of（ISO date）。 */
  priceDate: string;
  /** 安全边际 %：有中枢 IV 时 = (IV−price)/IV（含增长中枢锚）；单灯退回 (valueFloor−price)/valueFloor（零增长底锚，今天行为不变）。仅 below/strike zone 有意义；分母≤0 → null。 */
  marginPct: number | null;
  /** 覆盖度：full=零增长 EPV 与 OE-DCF 均可用；single_lamp=缺其中一法。 */
  coverage: VerdictCoverage;
  /** 本判定采用的估值方法可用性快照。 */
  methods: ValuationMethods;
  /**
   * 估值可靠性：引擎自身诊断无红旗 → true。false 表示"位置可算、但便宜信号不可信"
   * （盈利下滑致滚动均值高估的周期峰值幻觉 / 高杠杆股权值失真 / DCF 模型不稳 / per-share 疑似算错）。
   * 数据本身不算坏（不像 isImplausibleBand 那样整条抑制），故仍展示，只是 strike-zone/below 不据此标"便宜"。
   */
  reliable: boolean;
  /**
   * Graham 净流动资产(net-net)双层信号:assetFloor=现价低于每股 NCAV(识别信号);
   * buy=现价不高于⅔每股 NCAV(安全边际达标的买入线)。平时 undefined(不可评估)或两者 false。
   * 独立于 6 档价值带与 reliable,仅供个股页注脚。
   */
  netNet?: { perShare: number; assetFloor: boolean; buy: boolean };
};

function finitePositive(n: number | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

/** OE 收益率上限：>33%(≈P/OE<3x) 几乎必是 per-share/ADR 口径错（如 ADS:普通股比例未对齐）。 */
export const EXTREME_OE_YIELD = 0.33;

/** Phase 3.7:结构性置信分 ≥ 此阈值 → ai_capex 敞口不再一票否决可靠性(高置信结构性盈利,非顺周期脉冲)。 */
export const S_RELIABLE = 0.8;

/**
 * 估值可靠性：把引擎**已经算出**的红旗收口成一个布尔。任一触发 → 不可靠：
 *  - high_leverage_warning(仅金融股)：结构性杠杆未被股权成本溢价覆盖，便宜信号不可信。
 *    非金融的杠杆已由 leverage_premium 定价，不再走此闸。
 *  - ai_capex_distortion_warning：资本开支两年翻倍（AI-hog）→ 维持性 CapEx / OE 口径失真。
 *  - declined：盈利下滑 → 滚动均值高估其盈利力（周期峰值幻觉，#2 深修前的护栏）。
 *  - quick_check_flag：DCF 与同增长假设的 H-model 闭式解偏离>50% → 模型对分档/贴现异常敏感、不稳。
 *  - 极端 OE 收益率：>33% ≈ 每股算错（ADR 比例/股数）。
 * 守 [[valuation-philosophy-constraint]]：不可靠的便宜信号宁可不标，也不误导。
 */
export function assessReliability(input: { floor?: ValuationFloor; oeDcf?: OeDcfAssessment }): boolean {
  const { floor, oeDcf } = input;
  // 杠杆:非金融已由股权成本溢价定价(leveragePremium.ts),此闸的原始理由——「9–11% 单率
  // 股权桥失真」——已不成立,故摘除。金融股(银行/保险)结构性高杠杆未被该溢价覆盖
  // (netDebt/OE 对存款型资产负债表无意义),保留原闸,不放开 —— 见 spec D7。
  if (floor?.high_leverage_warning && floor?.is_financial) return false;
  // Phase 3.7:ai_capex 只在**未达结构性高置信**时才杀可靠性;s≥S_RELIABLE(如 GOOGL,结构性盈利、
  // 非顺周期脉冲)推翻否决。NVDA 型 s≈0.5<0.8 仍被挡在聚合面(个股页 IV 已按 s 半抬,互不冲突)。
  if (floor?.ai_capex_distortion_warning && !(floor?.structural_confidence != null && floor.structural_confidence >= S_RELIABLE))
    return false;
  if (oeDcf?.declined) return false;
  if (oeDcf?.diagnostics?.quick_check_flag) return false;
  const oeY = oeDcf?.diagnostics?.oe_yield;
  if (oeY != null && oeY > EXTREME_OE_YIELD) return false;
  return true;
}

/**
 * 数据健壮性上限:保守引擎正常不该出现 >80% 安全边际(≈现价 < 价值带下沿 1/5)。
 * 超过它几乎必是坏数据——缺/错 shares_diluted、或拆股调整后的价格与 SEC 股数不一致
 * (典型:Yahoo 拆股价 vs 申报老股数 → per-share 带被抬高 10×)。
 */
export const SANE_MARGIN_MAX = 0.8;

/** Graham 经典折价(纯价值股，growthReliance≈0 时的安全边际)。 */
export const MOS_BASE = 1 / 3;
/** 重增长/长 CAP 依赖时折价上限(growthReliance→1 时的安全边际，Graham 随激进度浮动)。 */
export const MOS_MAX = 0.45;

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

/**
 * 价值带与现价严重脱节 = 坏数据,判定应整条抑制(返回 null,即"无可信判定")。
 * 守 [[valuation-philosophy-constraint]]:宁可诚实空缺,也不把"打一折"的算崩当真实
 * 安全边际推到最敏感的面(strike zone / below)。screener/卡片/投资人页共用此判据。
 */
export function isImplausibleBand(v: {
  rangeLo: number;
  rangeHi: number;
  price: number;
  marginPct: number | null;
}): boolean {
  if (!(v.price > 0) || !(v.rangeLo > 0) || !(v.rangeHi >= v.rangeLo)) return true; // 退化带
  if (v.marginPct != null && v.marginPct > SANE_MARGIN_MAX) return true; // 假深度低估
  return false;
}
// 逐字搬运自卡片：两法 consistency → bucket。
function bucketFromConsistency(c?: string): VerdictBucket | null {
  if (c === "both_margin_of_safety") return "below";
  if (c === "within_value_range") return "within";
  if (c === "above_both_values") return "above";
  return null;
}
// 逐字搬运自卡片：单法 position → bucket。
function bucketFromPosition(p: ValuePosition): VerdictBucket {
  if (p === "in_strike_zone" || p === "approaching") return "below";
  if (p === "above_optimistic" || p === "above_zero_growth") return "above";
  return "within";
}

export function deriveValuationVerdict(input: {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone?: StrikeZoneAssessment;
  oeDcf?: OeDcfAssessment;
  reconciliation?: MethodReconciliation;
  methods: ValuationMethods;
  /** 拆股口径陈旧(基本面 as-of 早于最近拆股)→ 每股口径与拆股后价格错配,整条抑制为无判定。
   *  语义同 isImplausibleBand,由调用方经 isSplitCoverageStale 算出后传入。 */
  splitCoverageStale?: boolean;
  /** 资本结构被回购扭曲(深度负权益,AV 与 ROIC 双不可评估)→ 护城河不可评估,不判 above/太贵,整条抑制。
   *  语义同 splitCoverageStale,由调用方从 floor.moat_reading.capital_structure_distorted 传入。 */
  capitalStructureDistorted?: boolean;
  /** 基本面口径损坏(opInc>revenue / gross>revenue,物理不可能)→ 每股口径不可信,整条抑制。
   *  语义同 splitCoverageStale/capitalStructureDistorted,由调用方经 fundamentalsIntegrityViolated 算出后传入。 */
  fundamentalsCorrupt?: boolean;
}): ValuationVerdict | null {
  const { floor, strikeZone, oeDcf, reconciliation, methods, splitCoverageStale, capitalStructureDistorted, fundamentalsCorrupt } = input;
  if (splitCoverageStale) return null; // 拆股口径错配 → 无可信判定(每股带被放大 ~拆股比例倍)
  if (capitalStructureDistorted) return null; // 资本结构扭曲 → 无可信判定(护城河/成长价值不可评估,零增长底会假判太贵)
  if (fundamentalsCorrupt) return null; // 口径损坏(opInc/gross>revenue)→ 无可信判定
  if (!floor || floor.kind !== "floor") return null; // thin data / per_share_unavailable
  if (floor.holdco_not_assessable) {
    // 件⑤:有 SOTP 就用它的价值带判定,没有才退回件④的整条抑制。
    const sotp = floor.holdco_sotp;
    const sotpPrice = strikeZone?.price.close;
    if (!sotp || sotpPrice == null || !(sotpPrice > 0)) return null;
    const { pessimistic, base, optimistic } = sotp.per_share;
    if (!(pessimistic > 0) || !(optimistic >= pessimistic) || !(base > 0)) return null;
    return {
      bucket: sotpPrice < pessimistic ? "below" : sotpPrice <= optimistic ? "within" : "above",
      // 击球区沿用全站口径:相对中枢(基础档)留出 MOS_BASE=1/3 的安全边际。
      inStrikeZone: sotpPrice <= base * (1 - MOS_BASE),
      rangeLo: pessimistic,
      rangeHi: optimistic,
      price: sotpPrice,
      priceDate: strikeZone!.price.date,
      marginPct: (base - sotpPrice) / base,
      // SOTP 是分部拆解的单一路径,不存在两法夹逼 → single_lamp。
      coverage: "single_lamp",
      methods,
      // 可靠性由件⑤自己的四闸承担(≥3 年 / 对账 ≤10% / 归属 / 闭合),不走 assessReliability
      // —— 后者的输入(OE-DCF 稳定性、周期峰值等)对这条分部路径没有意义,套用它只会引入
      //    与本判定无关的否决。四闸不过时上面已经 return null,能走到这里就是可信的。
      reliable: true,
      // net-net 是清算口径的独立信号,对投资主导型控股集团没有解释力,不发布。
      netNet: undefined,
    };
  }
  // 件④:投资主导型控股集团,合并层面测试不适用 → 上面 SOTP 不可得时已 return null(fail-closed 兜底)
  const epv = strikeZone?.epv;
  if (!epv) return null; // 无价格 / 货币不匹配 / 无可比地板 → 无判定
  const price = strikeZone!.price.close;

  // 与卡片 ValueSpine 同源：conservative=OE-DCF 区间，growth=Greenwald 增长带或零增长点。
  const oeOk = oeDcf?.assessable && finitePositive(oeDcf.per_share_low) && finitePositive(oeDcf.per_share_high);
  const conservative = oeOk ? { lo: oeDcf!.per_share_low!, hi: oeDcf!.per_share_high! } : null;
  const growth = epv.ceilings
    ? { lo: epv.ceilings.pessimistic, hi: epv.ceilings.optimistic }
    : { lo: epv.base, hi: epv.base };
  const ends = [conservative?.lo, conservative?.hi, growth.lo, growth.hi].filter(
    (n): n is number => typeof n === "number" && Number.isFinite(n),
  );
  if (ends.length === 0) return null;
  // 展示价值带下沿 = 保守底 valueFloor（与 inStrikeZone/position/marginPct 同底），
  // 而非两法端点最小值 —— 后者对单灯发散名会塌到近零(HLX $0.61)/塌成点，令"价值带"与
  // "安全边际"参照不同底、三处展示自相矛盾(GCO 带 $5–$50 却标 33%)。rangeHi 仍是乐观上沿。
  const rangeHi = Math.max(...ends);
  const rangeLo = epv.valueFloor;
  const canReconcile = methods.oeDcf && methods.greenwaldGrowthCeilings;
  const coverage: VerdictCoverage = methods.oeDcf && methods.zeroGrowthEpv ? "full" : "single_lamp";

  // 判定锚:有含增长中枢的 IV(oeDcf 中枢档 per_share)时,bucket/inStrikeZone/marginPct 锚 IV,
  // 安全边际随 growthReliance(IV 相对零增长底 F 的增量占比)在 MOS_BASE~MOS_MAX 间浮动
  // (纯价值股 IV≈F → MOS≈1/3;重增长/长 CAP 依赖股 IV≫F → MOS 抬高，防止用远期增长自我合理化买点)。
  // 无 IV(oeDcf 不可评估/tiers 缺)→ 单灯兜底,逐字保留今天基于零增长底 F 的判定(见 else 分支)。
  const F = epv.valueFloor;
  const ivRaw = oeDcf?.assessable ? oeDcf.tiers?.neutral.per_share : undefined;
  const hasIv = ivRaw != null && Number.isFinite(ivRaw) && ivRaw > 0;
  const IV = hasIv ? (ivRaw as number) : undefined;

  let bucket: VerdictBucket;
  let inStrikeZone: boolean;
  let marginPct: number | null;
  if (IV != null) {
    const growthReliance = IV > F ? clamp01((IV - F) / IV) : 0;
    const mos = MOS_BASE + (MOS_MAX - MOS_BASE) * growthReliance;
    bucket = price < IV ? "below" : price <= rangeHi ? "within" : "above";
    inStrikeZone = price <= IV * (1 - mos);
    marginPct = IV > 0 ? (IV - price) / IV : null;
  } else {
    // 单灯兜底:无含增长中枢 IV → 退回今天的 EPV 锚(零增长底 F，逐字保留)。
    bucket =
      (canReconcile ? bucketFromConsistency(reconciliation?.consistency) : null) ?? bucketFromPosition(epv.position);
    inStrikeZone = epv.position === "in_strike_zone";
    const valueFloor = epv.valueFloor;
    marginPct = valueFloor > 0 ? (valueFloor - price) / valueFloor : null;
  }

  // 数据健壮性闸:价值带与现价严重脱节(坏 shares / 拆股不一致)→ 无可信判定,不污染最敏感的面。
  if (isImplausibleBand({ rangeLo, rangeHi, price, marginPct })) return null;

  // 可靠性:位置可算但便宜信号是否可信(周期峰值/高杠杆/模型不稳/per-share疑错)。floor 此处已窄化为 ValuationFloor。
  const reliable = assessReliability({ floor, oeDcf });

  // net-net:现价 < 每股 NCAV → 触发(独立信号,不入 bucket、不入 reliable)。
  const nn = floor.net_net;
  const netNet =
    nn.assessable && Number.isFinite(nn.per_share) && nn.per_share > 0
      ? { perShare: nn.per_share, assetFloor: isNetNetAssetFloor(nn, price), buy: isNetNetBuy(nn, price) }
      : undefined;

  return { bucket, inStrikeZone, rangeLo, rangeHi, price, priceDate: strikeZone!.price.date, marginPct, coverage, methods, reliable, netNet };
}
