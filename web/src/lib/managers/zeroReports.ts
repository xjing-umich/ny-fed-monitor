/**
 * 零持仓申报(filings.holding_count = 0、无 holdings 行,如 Olstein 2026Q2)覆盖到索引行上。
 * manager_index RPC 用 inner join holdings 取"最新一期",零持仓季没有 holdings 行会被跳过,
 * 索引就退回上一季 —— 投资人列表、共识页"未计入"名单会把交了申报的人当成逾期。
 * 仅当零持仓季比 RPC 给的那期更新时覆盖。ingest 不写仅含期权的 filing,故 holding_count = 0 只来自零持仓申报。
 */
export type ZeroFilingRow = { cik: string; period: string; filed_at: string | null };
type IndexRowLike = { cik: string; period: string; filed_at: string | null; total_value: number; holding_count: number; top_holding: string };
export function overlayZeroReports<T extends IndexRowLike>(rows: T[], zeros: ZeroFilingRow[]): T[] {
  const latestZero = new Map<string, ZeroFilingRow>();
  for (const z of zeros) {
    const prev = latestZero.get(z.cik);
    if (!prev || z.period > prev.period) latestZero.set(z.cik, z);
  }
  return rows.map((r) => {
    const z = latestZero.get(r.cik);
    if (!z || !(z.period > r.period)) return r;
    return { ...r, period: z.period, filed_at: z.filed_at ?? null, total_value: 0, holding_count: 0, top_holding: "" };
  });
}
