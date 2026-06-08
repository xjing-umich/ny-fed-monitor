// 数据健康看门狗——纯判定逻辑。无 DB、无 server-only → 可独立 tsx 自检。
// 取数装配在 gather.ts，本文件只接收已取好的数据做判断。
// 用相对路径(而非 @/ 别名)导入,确保 npx tsx 自检时路径解析万无一失。
import { mostRecentDueQuarter, parseUTC } from "../freshness/derive";

export type HealthProblem = {
  pipeline: "13f" | "macro";
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

// 宏观判定的最小输入(由 gather.ts 从 MarketFreshnessStatusRow 映射而来,
// 故纯函数不依赖 server-only 类型)。id===0 表示 getFreshnessStatus 合成的
// "该源无真实状态记录"占位行。
export type MacroStatusInput = {
  id: number;
  name: string;
  isManual: boolean;
  freshnessStatus: string;
  latestObservationDate: string | null;
  checkedAt: string;
};

const MACRO_ALERT_STATUSES = new Set(["failed", "empty"]); // 真失败才告警;stale(天然滞后)仅作参考
const MACRO_STALE_CHECKED_DAYS = 2;

// UTC 日历天差(向下取整)。from 为空 → Infinity(视为极陈)。
function daysBetweenUTC(from: Date | null, to: Date): number {
  if (!from) return Infinity;
  const a = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const b = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.floor((b - a) / 86400000);
}

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

// 宏观判定。信号1: 真实行(id!==0)的 max(checkedAt) 超阈 → 停跑;
// 信号2: 非手动源 freshnessStatus ∈ {failed,empty} → 报; stale → 进 info(天然滞后,不告警)。
export function evaluateMacro(rows: MacroStatusInput[], today: Date): { problems: HealthProblem[]; info: string[] } {
  const problems: HealthProblem[] = [];
  const info: string[] = [];
  const real = rows.filter((r) => r.id !== 0);
  if (real.length === 0) {
    problems.push({ pipeline: "macro", source: "宏观整体", message: "freshness 从未写入(管道或未跑过)", asOf: null, expected: "应有每日刷新" });
  } else {
    const maxChecked = real.reduce((m, r) => (r.checkedAt > m ? r.checkedAt : m), real[0].checkedAt);
    const days = daysBetweenUTC(parseUTC(maxChecked), today);
    if (days > MACRO_STALE_CHECKED_DAYS) {
      problems.push({ pipeline: "macro", source: "宏观整体", message: `管道可能停跑: 状态 ${days} 天未刷新`, asOf: maxChecked.slice(0, 10), expected: `应 ≤ ${MACRO_STALE_CHECKED_DAYS} 天` });
    }
  }
  const staleSrc: string[] = [];
  for (const r of rows) {
    if (r.isManual) continue;
    if (MACRO_ALERT_STATUSES.has(r.freshnessStatus)) {
      problems.push({ pipeline: "macro", source: r.name, message: `状态 ${r.freshnessStatus}`, asOf: r.latestObservationDate, expected: "应 fresh" });
    } else if (r.freshnessStatus === "stale") {
      staleSrc.push(`${r.name}(${r.latestObservationDate ?? "—"})`);
    }
  }
  if (staleSrc.length) info.push(`宏观滞后(参考,不告警): ${staleSrc.join(", ")}`);
  return { problems, info };
}
