// 数据健康看门狗——纯判定逻辑。无 DB、无 server-only → 可独立 tsx 自检。
// 取数装配在 gather.ts，本文件只接收已取好的数据做判断。
// 用相对路径(而非 @/ 别名)导入,确保 npx tsx 自检时路径解析万无一失。
import { effectiveFilingDeadline, mostRecentDueQuarter, parseUTC } from "../freshness/derive";

export type HealthProblem = {
  pipeline: "13f" | "prices" | "fundamentals" | "cost" | "report";
  source: string;
  message: string;
  asOf: string | null;
  expected: string;
};

export type HealthReport = {
  ok: boolean;
  checkedAt: string;
  problems: HealthProblem[];
  info: string[];
};

// 13F「整体落后」判定。latestPeriod=库内最新季度; perManagerPeriods=每户最新季度。
export function evaluate13F(
  latestPeriod: string | null,
  perManagerPeriods: string[],
  today: Date
): { problems: HealthProblem[]; info: string[] } {
  const due = mostRecentDueQuarter(today);
  const dueStr = due.toISOString().slice(0, 10);
  if (!latestPeriod) {
    return {
      problems: [{ pipeline: "13f", source: "13F 整体", message: "库内无任何 filing", asOf: null, expected: `应到 ${dueStr}` }],
      info: [],
    };
  }
  const atDue = perManagerPeriods.filter((p) => p === dueStr).length;
  const info = [`13F 覆盖率: ${atDue}/${perManagerPeriods.length} 户已到 ${dueStr}`];
  const latest = parseUTC(latestPeriod);
  if (latest && latest < due) {
    return {
      problems: [{ pipeline: "13f", source: "13F 整体", message: "整体落后,管道可能漏了一整季", asOf: latestPeriod, expected: `应到 ${dueStr}` }],
      info,
    };
  }
  return { problems: [], info };
}

/**
 * Supabase DB 体积早警(纯判定)。usedBytes=null → 降级 info(取数不可用,不告警)。
 * 达到/超过 limitMb×warnFraction → cost problem;否则 info 报当前占用。
 * 平台原生告警只在超额粗报,此处提供 80% 早警窗口。
 */
export function evaluateDbSize(
  usedBytes: number | null,
  limitMb: number,
  warnFraction: number,
): { problems: HealthProblem[]; info: string[] } {
  if (usedBytes == null) {
    return { problems: [], info: ["DB 体积: 取数不可用，跳过"] };
  }
  const usedMb = usedBytes / 1_048_576;
  const pct = usedMb / limitMb;
  const pctStr = `${Math.round(pct * 100)}%`;
  if (pct >= warnFraction) {
    return {
      problems: [{
        pipeline: "cost",
        source: "Supabase DB 体积",
        message: `已用 ${Math.round(usedMb)} MB / ${limitMb} MB (${pctStr})`,
        asOf: null,
        expected: `应 < ${Math.round(warnFraction * 100)}%`,
      }],
      info: [],
    };
  }
  return { problems: [], info: [`DB 体积 ${Math.round(usedMb)} MB / ${limitMb} MB (${pctStr})`] };
}

export const REPORT_FINALIZE_GRACE_DAYS = 10;

/** 季度报告:实际截止日(周末顺延到周一)+ 10 天(含当天)过后仍未定稿 → 提醒站长。 */
export function evaluateReport(
  row: { period: string; status: "live" | "final" } | null,
  today: Date,
): { problems: HealthProblem[]; info: string[] } {
  if (!row) return { problems: [], info: ["季度报告: 当前季度尚无报告行"] };
  if (row.status === "final") return { problems: [], info: [`季度报告: ${row.period} 已定稿`] };
  const deadline = effectiveFilingDeadline(row.period);
  if (!deadline) return { problems: [], info: [] };
  // 宽限期最后一天 = 截止日 + 10 天;到其次日 0 点(UTC)才告警,与 reportReadiness 的“当天仍算”一致。
  const alertFrom = deadline.getTime() + (REPORT_FINALIZE_GRACE_DAYS + 1) * 86_400_000;
  if (today.getTime() < alertFrom) return { problems: [], info: [`季度报告: ${row.period} 申报中`] };
  return {
    problems: [{
      pipeline: "report",
      source: "季度报告",
      message: `截止日已过 ${REPORT_FINALIZE_GRACE_DAYS} 天,报告仍未定稿`,
      asOf: row.period,
      expected: "若已收到预览：运行 Report finalize & send；若没有预览（覆盖率不足）：先运行 action=preview 或检查覆盖率",
    }],
    info: [],
  };
}

/** 基本面滞后的容忍比例:超过这一比例的公司「库里落后于已提交申报」即告警。 */
export const FUNDAMENTALS_LAG_MAX_FRACTION = 0.02;

/**
 * 基本面滞后(纯判定)。filedReport=该公司已提交 ≥ 宽限期的最新 10-Q/10-K 报告期;
 * stored=库里该公司最新一期(10-Q/10-K 期末)。filedReport > stored 即「库里落后于 SEC」。
 *
 * 为什么要有:2026-10 审计发现 ~200 家公司 Q2 季报 7–8 月就交了,库里仍停在 Q1,
 * 每周任务却一直报 success —— 上游漏收不报错,只有拿「已交申报」对照「库里最新」才看得见。
 */
export function evaluateFundamentalsLag(
  companies: { ticker: string; filedReport: string; stored: string | null }[],
): { problems: HealthProblem[]; info: string[] } {
  if (companies.length === 0) return { problems: [], info: ["基本面滞后: 无可比对公司,跳过"] };
  const lagging = companies.filter((c) => !c.stored || c.filedReport > c.stored);
  const frac = lagging.length / companies.length;
  const sample = lagging.slice(0, 8).map((c) => `${c.ticker}(${c.stored ?? "无"}→${c.filedReport})`).join(", ");
  if (frac > FUNDAMENTALS_LAG_MAX_FRACTION) {
    return {
      problems: [{
        pipeline: "fundamentals",
        source: "SEC 基本面",
        message: `${lagging.length}/${companies.length} 家库里落后于已提交申报,如 ${sample}`,
        asOf: null,
        expected: `落后比例应 ≤ ${Math.round(FUNDAMENTALS_LAG_MAX_FRACTION * 100)}%`,
      }],
      info: [],
    };
  }
  return { problems: [], info: [`基本面: ${companies.length - lagging.length}/${companies.length} 家跟上最新申报${lagging.length ? `(落后: ${sample})` : ""}`] };
}
