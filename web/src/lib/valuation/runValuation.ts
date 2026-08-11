import { deriveExpectations } from "./impliedExpectations";
import { deriveValuationMethods, type ValuationMethods } from "./deriveValuationMethods";
import { deriveValuationVerdict, type ValuationVerdict } from "./deriveValuationVerdict";
import { computeValuationFloor, workingYears } from "./epvFloor";
import { fundamentalsIntegrityViolated } from "./fundamentalsIntegrity";
import { historicalGrowthBaseRate } from "./growthBaseRate";
import { deriveOeDcf, reconcileMethods } from "./ownerEarningsDcf";
import { deriveStrikeZone } from "./strikeZone";
import type {
  ExpectationsAssessment,
  LatestPrice,
  MethodReconciliation,
  OeDcfAssessment,
  PerShareUnavailable,
  StrikeZoneAssessment,
  ValuationFloor,
  ValuationFloorInput,
} from "./types";

export type SuppressedReason =
  | "ads_suppressed"
  | "fundamentals_stale"
  | "per_share_unavailable"
  | "thin_or_unvaluable_floor"
  | "no_price"
  | "price_stale"
  | "currency_mismatch"
  | "split_coverage_stale"
  | "capital_structure_distorted"
  | "fundamentals_corrupt"
  | "holdco_not_assessable";

export type RunValuationInput = {
  floorInput: ValuationFloorInput;
  price: LatestPrice | null;
  dgs10: { value: number; date: string } | null;
  guards: {
    adsSuppressed: boolean;
    fundamentalsStale: boolean;
    priceStale: boolean;
    splitCoverageStale: boolean;
    fundamentalsCorrupt?: boolean;
  };
  suppressExpectations?: boolean;
};

export type ValuationRun = {
  floor: ValuationFloor | PerShareUnavailable | undefined;
  strikeZone: StrikeZoneAssessment | undefined;
  oeDcf: OeDcfAssessment | undefined;
  reconciliation: MethodReconciliation | undefined;
  verdict: ValuationVerdict | null;
  expectations: ExpectationsAssessment;
  methods: ValuationMethods;
  suppressedReason?: SuppressedReason;
};

const NO_METHODS: ValuationMethods = {
  zeroGrowthEpv: false,
  oeDcf: false,
  greenwaldGrowthCeilings: false,
};

function unassessable(reason: string): ExpectationsAssessment {
  return { assessable: false, reason };
}

function suppressedReason(input: {
  verdict: ValuationVerdict | null;
  strikeZone?: StrikeZoneAssessment;
  guards: RunValuationInput["guards"];
  floor: ValuationFloor;
  price: LatestPrice | null;
}): SuppressedReason | undefined {
  if (input.verdict) return undefined;
  if (input.guards.fundamentalsCorrupt) return "fundamentals_corrupt";
  // 件⑤:SOTP 可得时 verdict 非空,上面 `if (input.verdict) return undefined;` 已短路到此不会执行;
  // 这里只在 SOTP 不可得(仍整条抑制、verdict 为 null)时保留原因标签,加 `&& !holdco_sotp` 让
  // "为什么是这个原因"的注释与件⑤新增的字段显式对齐,不改变既有行为。
  if (input.floor.holdco_not_assessable && !input.floor.holdco_sotp) return "holdco_not_assessable";
  if (input.floor.moat_reading.capital_structure_distorted) return "capital_structure_distorted";
  if (input.guards.splitCoverageStale) return "split_coverage_stale";
  if (input.strikeZone?.currencyMismatch) return "currency_mismatch";
  if (input.guards.priceStale) return "price_stale";
  if (!input.price) return "no_price";
  return undefined;
}

export function runValuation(input: RunValuationInput): ValuationRun {
  const { floorInput, price, dgs10, guards, suppressExpectations = false } = input;

  if (guards.adsSuppressed) {
    return {
      floor: undefined,
      strikeZone: undefined,
      oeDcf: undefined,
      reconciliation: undefined,
      verdict: null,
      expectations: unassessable("suppressed_ads"),
      methods: NO_METHODS,
      suppressedReason: "ads_suppressed",
    };
  }

  if (guards.fundamentalsStale) {
    return {
      floor: undefined,
      strikeZone: undefined,
      oeDcf: undefined,
      reconciliation: undefined,
      verdict: null,
      expectations: unassessable("fundamentals_stale"),
      methods: NO_METHODS,
      suppressedReason: "fundamentals_stale",
    };
  }

  const floor = computeValuationFloor(floorInput);
  if (!floor) {
    return {
      floor,
      strikeZone: undefined,
      oeDcf: undefined,
      reconciliation: undefined,
      verdict: null,
      expectations: unassessable("no_oe_dcf"),
      methods: NO_METHODS,
      suppressedReason: "thin_or_unvaluable_floor",
    };
  }

  if (floor.kind === "per_share_unavailable") {
    return {
      floor,
      strikeZone: undefined,
      oeDcf: undefined,
      reconciliation: undefined,
      verdict: null,
      expectations: unassessable("no_oe_dcf"),
      methods: NO_METHODS,
      suppressedReason: "per_share_unavailable",
    };
  }

  const strikeZone = deriveStrikeZone(floor, price);
  // 增长窗(oe0 窗口/cagr/declined)须与 oe0 吃同一批年份(spec §5):TTM 生效时序列头是 TTM
  // (标签 FY0+1),用纯 floorInput.years 与 workYears 标签集取交集会丢 FY0 又不含 TTM。
  // gRaw 增长回归则恒吃纯 floorInput.years(锁定 decision #2)—— 两口径分别传入。
  const oeDcf = deriveOeDcf(floor, workingYears(floorInput), dgs10, price, floorInput.years);
  const reconciliation = reconcileMethods(strikeZone?.epv?.ceilings, oeDcf, price);
  const methods = deriveValuationMethods({ floor, strikeZone, oeDcf });
  const fundamentalsCorrupt = guards.fundamentalsCorrupt ?? fundamentalsIntegrityViolated(floorInput.years);
  const verdict = deriveValuationVerdict({
    floor,
    strikeZone,
    oeDcf,
    reconciliation,
    methods,
    splitCoverageStale: guards.splitCoverageStale,
    capitalStructureDistorted: floor.moat_reading.capital_structure_distorted,
    fundamentalsCorrupt,
  });
  const expectations =
    !oeDcf.assessable || !oeDcf.expectations_inputs
      ? unassessable("no_oe_dcf")
      : !verdict
      ? unassessable("no_verdict")
      : deriveExpectations({
          ...oeDcf.expectations_inputs,
          price: verdict.price,
          historicalGrowth: historicalGrowthBaseRate(floorInput.years),
          suppressed: suppressExpectations,
        });

  return {
    floor,
    strikeZone,
    oeDcf,
    reconciliation,
    verdict,
    expectations,
    methods,
    suppressedReason: suppressedReason({ verdict, strikeZone, guards: { ...guards, fundamentalsCorrupt }, floor, price }),
  };
}
