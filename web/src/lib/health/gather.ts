import "server-only";
import { getDb } from "@/lib/managers/db";
import {
  evaluate13F,
  type HealthProblem,
  type HealthReport,
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

// 读最近一次成功的 daily 价格摄取, 超 3 天没成功 → 告警(管道疑似停跑)。
async function gatherPrices(today: Date): Promise<{ problems: HealthProblem[]; info: string[] }> {
  try {
    const { data, error } = await getDb()
      .from("price_ingest_runs")
      .select("finished_at,rows_written")
      .eq("run_type", "daily").eq("status", "success")
      .order("finished_at", { ascending: false }).limit(1);
    if (error) throw error;
    const last = (data ?? [])[0] as { finished_at: string; rows_written: number } | undefined;
    if (!last) {
      return { problems: [{ pipeline: "prices", source: "价格整体", message: "价格从未成功摄取", asOf: null, expected: "应有每日刷新" }], info: [] };
    }
    const days = Math.floor((today.getTime() - new Date(last.finished_at).getTime()) / 86_400_000);
    if (days > 3) {
      return { problems: [{ pipeline: "prices", source: "价格整体", message: `价格管道可能停跑: ${days} 天未成功摄取`, asOf: last.finished_at.slice(0, 10), expected: "应 ≤ 3 天" }], info: [] };
    }
    return { problems: [], info: [`价格最近成功摄取 ${last.finished_at.slice(0, 10)} (写入 ${last.rows_written})`] };
  } catch (e) {
    return { problems: [{ pipeline: "prices", source: "价格核查", message: `核查自身出错: ${e instanceof Error ? e.message : String(e)}`, asOf: null, expected: "核查应成功" }], info: [] };
  }
}

export async function gatherHealth(today: Date): Promise<HealthReport> {
  const [r13, rPrices] = await Promise.all([gather13F(today), gatherPrices(today)]);
  const problems = [...r13.problems, ...rPrices.problems];
  const info = [...r13.info, ...rPrices.info];
  return { ok: problems.length === 0, checkedAt: today.toISOString(), problems, info };
}
