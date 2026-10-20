import { computeChanges, assembleManagerDetail } from "./assemble";
import { overlayZeroReports } from "./zeroReports";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
const prior = [{ cusip: "A", issuer: "AAA", value: 5_000_000_000, shares: 100, weight: 0.5 }] as any;
const latest = [] as any;
const ch = computeChanges(latest, prior);
const exited = ch.find((c) => c.kind === "exited");
assert(!!exited, "exited change emitted");
assert(exited!.value === 5_000_000_000, `exited value = prior value, got ${exited!.value}`);

// 零持仓申报(Olstein 2026Q2 形态):最新一期 holdings 为空 → changes 为空,不把上季全部仓位记成清仓。
{
  const mgr = { cik: "0000947996", slug: "olstein-capital", name: "Olstein", person: "Robert Olstein" };
  const d = assembleManagerDetail(mgr, [
    { period: "2026-03-31", filedAt: "2026-04-21", accession: "Q1", totalValue: 5e9, holdings: prior },
    { period: "2026-06-30", filedAt: "2026-07-07", accession: "Q2", totalValue: 0, holdings: [] },
  ]);
  assert(d.latest.period === "2026-06-30" && d.latest.holdings.length === 0, "zero-report quarter is latest");
  assert(d.prior?.period === "2026-03-31", "prior kept for context");
  assert(d.changes.length === 0, `zero-report latest → no changes, got ${d.changes.length}`);
}

// manager_index RPC 跳过零持仓季 → overlayZeroReports 把更新的零持仓季盖上去;更旧的零持仓季不动。
{
  const base = { cik: "0000947996", period: "2026-03-31", filed_at: "2026-04-21", total_value: 458067000, holding_count: 99, top_holding: "X" };
  const other = { ...base, cik: "0001", period: "2026-06-30" };
  const out = overlayZeroReports([base, other], [
    { cik: "0000947996", period: "2026-06-30", filed_at: "2026-07-07" },
    { cik: "0001", period: "2025-12-31", filed_at: "2026-02-01" },
  ]);
  assert(out[0].period === "2026-06-30" && out[0].holding_count === 0 && out[0].total_value === 0 && out[0].top_holding === "" && out[0].filed_at === "2026-07-07", "newer zero report overrides index row");
  assert(out[1] === other, "older zero report leaves row untouched");
}
console.log("assemble.check OK");
