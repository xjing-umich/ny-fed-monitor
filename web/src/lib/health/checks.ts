// 数据健康看门狗——纯判定逻辑。无 DB、无 server-only → 可独立 tsx 自检。
// 取数装配在 gather.ts，本文件只接收已取好的数据做判断。
// 用相对路径(而非 @/ 别名)导入,确保 npx tsx 自检时路径解析万无一失。
import { mostRecentDueQuarter, parseUTC } from "../freshness/derive";

export type HealthProblem = {
  pipeline: "13f" | "prices" | "cost";
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
