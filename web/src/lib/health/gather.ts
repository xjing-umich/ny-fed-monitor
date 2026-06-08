import "server-only";
import { getDb } from "@/lib/managers/db";
import { getFreshnessStatus } from "@/lib/db/freshness";
import {
  evaluate13F,
  evaluateMacro,
  type HealthProblem,
  type HealthReport,
  type MacroStatusInput,
} from "./checks";

// 读 filings,算库内最新季度 + 每户最新季度。
async function gather13F(today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    // .range 上限远高于现实行数(filings≈managers×季度);防 PostgREST 默认 1000 行
    // 静默截断——否则丢失 manager 会让看门狗误报"13F 整体落后"(纠错工具不能被自己骗)。
    const { data, error } = await getDb().from("filings").select("cik,period").range(0, 99999);
    if (error) throw error;
    const rows = (data ?? []) as { cik: string; period: string }[];
    const maxByCik = new Map<string, string>();
    for (const r of rows) {
      const cur = maxByCik.get(r.cik);
      if (!cur || r.period > cur) maxByCik.set(r.cik, r.period);
    }
    const perManagerPeriods = [...maxByCik.values()];
    const latestPeriod = perManagerPeriods.reduce<string | null>((m, p) => (!m || p > m ? p : m), null);
    return evaluate13F(latestPeriod, perManagerPeriods, today);
  } catch (e) {
    return {
      problems: [{ pipeline: "13f", source: "13F 核查", message: `核查自身出错: ${e instanceof Error ? e.message : String(e)}`, asOf: null, expected: "核查应成功" }],
      info: [],
    };
  }
}

// 读 market_freshness_status(含 source 关联),映射成纯函数输入。
async function gatherMacro(today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    const rows = await getFreshnessStatus();
    const inputs: MacroStatusInput[] = rows.map((r) => ({
      id: r.id,
      name: r.source?.name ?? `source#${r.source_id}`,
      isManual: r.source?.is_manual ?? false,
      freshnessStatus: r.freshness_status,
      latestObservationDate: r.latest_observation_date,
      checkedAt: r.checked_at,
    }));
    return evaluateMacro(inputs, today);
  } catch (e) {
    return { problems: [{ pipeline: "macro", source: "宏观核查", message: `核查自身出错: ${e instanceof Error ? e.message : String(e)}`, asOf: null, expected: "核查应成功" }], info: [] };
  }
}

export async function gatherHealth(today: Date): Promise<HealthReport> {
  const [r13, rMacro] = await Promise.all([gather13F(today), gatherMacro(today)]);
  const problems = [...r13.problems, ...rMacro.problems];
  const info = [...r13.info, ...rMacro.info];
  return { ok: problems.length === 0, checkedAt: today.toISOString(), problems, info };
}
