// 纯映射(无 "server-only", 可被 .check.ts 裸 `npx tsx` 跑): consensus_holdings 行 →
// ticker(大写)→holder_count Map。从 consensusRead.ts 抽出, 让纯逻辑脱离 server-only 边界
// (server-only 模块经 tsx 加载会运行期崩, 见 tsx-ingest-server-only-stub)。

export type HolderCountDbRow = { ticker: string; holder_count: number };

/** 纯映射(单测): consensus_holdings 行 → ticker(大写)→holder_count Map。 */
export function mapHolderCountRows(rows: HolderCountDbRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.ticker.toUpperCase(), Number(r.holder_count));
  return out;
}
