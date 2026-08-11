import { getDb } from "@/lib/managers/db";
import type { FundamentalPeriod } from "@/lib/sec/normalize-facts";
import { needsHoldcoSotp } from "@/lib/sec/holdco-gate";
import { resolveFloorShares } from "./epvFloor";
import type { ValuationFloorInput } from "./types";
import {
  computeHoldcoSotp,
  type HoldcoSotp,
  type HoldcoSotpInput,
  type HoldcoSotpUnavailable,
} from "./holdcoSotp";

/**
 * 件⑤ 读取侧:两张新表 → HoldcoSotpInput → computeHoldcoSotp → 挂进 ValuationFloorInput。
 *
 * ★ 这是整条线的生产接口。引擎、取数、页面都建好之后,一度**没有任何调用方**给
 *   `ValuationFloorInput.holdcoSotp` 传过值 —— 于是 epvFloor 里那个 holdco_sotp 恒为
 *   undefined、verdict 恒 null、页面恒走件④的整条抑制,整条线是带 check 的死代码。
 *
 * 三条硬纪律:
 *  1. **两个调用方都接**(个股页 + valuation-ingest)。只接一个会让个股页与 screener/首页榜
 *     口径分裂,那是本项目出过的事故类型。
 *  2. **股数与 floorInput 同源**:走 resolveFloorShares,不在这里另算一套(件①的分股类回退让
 *     BRK.A/BRK.B 各有各的口径,自己算必然对不上 1:1500)。
 *  3. **静默降级**:窄闸不开、库读不到、表还没 apply、任一闸不过 —— 一律返回 undefined,让该票
 *     退回件④的抑制,绝不带崩个股页或 ingest。
 *
 * 零漂移:第一行就是件④触发集的窄闸(needsHoldcoSotp)。未被抑制的票在这里直接返回 undefined,
 * floorInput 对象逐字段原样不动;即便万一漏进来,epvFloor 还有 holdcoNotAssessable 那道短路。
 */

/** company_holdco_investments 的读取形状(只取引擎与闸要用的列)。 */
export type HoldcoInvestmentsRow = {
  period_end: string;
  total: number | null;
  unrealized_gain: number | null;
  gate_attribution_ok: boolean | null;
  gate_closure_ok: boolean | null;
  gate_upper_bound_ok: boolean | null;
};

/** company_segment_years 的读取形状。 */
export type HoldcoSegmentYearRow = {
  period_end: string;
  total_pretax: number | null;
  total_tax: number | null;
  insurance_pretax: number | null;
  insurance_tax: number | null;
  underwriting_pretax: number | null;
  segments_pretax_sum: number | null;
};

const num = (v: unknown): number | null => {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/** 最新一个 FY 期末(fundamentals 侧)。第一栏必须与它同期,否则就是拿旧年的投资配今天的价。 */
function latestFyPeriodEnd(annual: FundamentalPeriod[]): string | null {
  const ends = annual
    .filter((r) => r.fiscal_period === "FY" && r.period_end)
    .map((r) => r.period_end as string)
    .sort((a, b) => b.localeCompare(a));
  return ends[0] ?? null;
}

/**
 * 纯函数装配:两张表的行 + fundamentals → 引擎输入。任一必要条件不满足返回 null。
 * 与库解耦,便于 check 直接喂 fixture。
 */
export function buildHoldcoSotpInput(args: {
  investments: HoldcoInvestmentsRow[];
  years: HoldcoSegmentYearRow[];
  annual: FundamentalPeriod[];
  floorInput: ValuationFloorInput;
}): HoldcoSotpInput | null {
  const { investments, years, annual, floorInput } = args;
  const shares = resolveFloorShares(floorInput);
  if (shares == null || !(shares > 0)) return null;

  const latestEnd = latestFyPeriodEnd(annual);
  if (!latestEnd) return null;

  // 第一栏:只认与最新 FY 同期、且三闸都在库里记为通过的那一行。取数侧本就 fail-closed
  // (闸不过不写行),这里再验一次是防「表被手工改过 / 旧口径遗留行」。
  const invRow = investments.find(
    (r) =>
      r.period_end === latestEnd &&
      r.gate_attribution_ok === true &&
      r.gate_closure_ok === true &&
      r.gate_upper_bound_ok === true,
  );
  const total = invRow ? num(invRow.total) : null;
  const invInput =
    invRow && total != null && total > 0
      ? { total, unrealized_gain: num(invRow.unrealized_gain) }
      : null;

  // 对账闸②-2 的右边:合并**经营**口径税前 = 合并税前 − 投资重估损益(件③同源口径)。
  // 分部口径不含证券重估,直接拿 GAAP 合并税前去比会差出几百亿,那不是数据错误而是口径不同。
  const consolidatedPretaxByYear: Record<string, number | null> = {};
  for (const r of annual) {
    if (r.fiscal_period !== "FY" || !r.period_end) continue;
    const pretax = num(r.pretax_income);
    const marks = num(r.investment_fv_gain_loss);
    consolidatedPretaxByYear[r.period_end] = pretax != null && marks != null ? pretax - marks : null;
  }

  return {
    shares,
    investments: invInput,
    years: years.map((y) => ({
      period_end: y.period_end,
      total_pretax: num(y.total_pretax),
      total_tax: num(y.total_tax),
      insurance_pretax: num(y.insurance_pretax),
      insurance_tax: num(y.insurance_tax),
      underwriting_pretax: num(y.underwriting_pretax),
      segments_pretax_sum: num(y.segments_pretax_sum),
    })),
    consolidatedPretaxByYear,
  };
}

/** 装配 + 计算。装配失败时给出与引擎同族的不可评估结果,便于探针打印裁决依据。 */
export function computeHoldcoSotpFromRows(args: {
  investments: HoldcoInvestmentsRow[];
  years: HoldcoSegmentYearRow[];
  annual: FundamentalPeriod[];
  floorInput: ValuationFloorInput;
}): HoldcoSotp | HoldcoSotpUnavailable {
  const input = buildHoldcoSotpInput(args);
  if (!input) return { assessable: false, reason: "shares_unavailable" };
  return computeHoldcoSotp(input);
}

/**
 * 生产入口。窄闸不开 / 读库失败 / 四闸任一不过 → undefined(该票退回件④抑制)。
 */
export async function readHoldcoSotp(args: {
  ticker: string;
  annual: FundamentalPeriod[];
  floorInput: ValuationFloorInput;
}): Promise<HoldcoSotp | undefined> {
  const { ticker, annual, floorInput } = args;
  if (!needsHoldcoSotp(annual)) return undefined; // 零漂移第一道:非件④触发集,一步都不往下走
  try {
    const db = getDb();
    const upper = ticker.toUpperCase();
    const [{ data: inv, error: invErr }, { data: yrs, error: yrErr }] = await Promise.all([
      db
        .from("company_holdco_investments")
        .select("period_end,total,unrealized_gain,gate_attribution_ok,gate_closure_ok,gate_upper_bound_ok")
        .eq("ticker", upper)
        .eq("fiscal_period", "FY")
        .order("period_end", { ascending: false })
        .limit(8),
      db
        .from("company_segment_years")
        .select("period_end,total_pretax,total_tax,insurance_pretax,insurance_tax,underwriting_pretax,segments_pretax_sum")
        .eq("ticker", upper)
        .eq("fiscal_period", "FY")
        .order("period_end", { ascending: false })
        .limit(8),
    ]);
    // 表还没 apply / 权限不足 / 无行:都退回件④抑制,不是异常路径。
    if (invErr || yrErr || !inv?.length || !yrs?.length) return undefined;
    const result = computeHoldcoSotpFromRows({
      investments: inv as HoldcoInvestmentsRow[],
      years: yrs as HoldcoSegmentYearRow[],
      annual,
      floorInput,
    });
    return result.assessable ? result : undefined;
  } catch {
    return undefined; // 读库抛错绝不带崩个股页或 ingest
  }
}
