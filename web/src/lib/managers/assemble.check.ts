import { computeChanges, assembleManagerDetail, tickerCanon } from "./assemble";
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
// 换 CUSIP 归并(XOM 2026-07 控股重组 30231G102→30233Q108,Matrix Q2→Q3 3,749→3,521 股):
// 不传 canon → 旧行为"清仓旧 + 新建新";传 tickerCanon → 同 ticker 合并比对,记一条减持。
{
  const tick: Record<string, string> = { "30231G102": "XOM", "30233Q108": "XOM", "438516106": "HON", "43849R105": "HONA", "BAD000001": "9.2e+106", "BAD000002": "9.2e+106" };
  const canon = tickerCanon((c) => tick[c]);
  const q2 = [{ cusip: "30231G102", issuer: "EXXON MOBIL CORP", value: 400_000, shares: 3_749 }] as any;
  const q3 = [{ cusip: "30233Q108", issuer: "EXXONMOBIL HOLDINGS CORP", value: 380_000, shares: 3_521 }] as any;
  const raw = computeChanges(q3, q2);
  assert(raw.length === 2 && raw.some((c) => c.kind === "new") && raw.some((c) => c.kind === "exited"), "no canon → exit + new (old behaviour)");
  const merged = computeChanges(q3, q2, canon);
  assert(merged.length === 1 && merged[0].kind === "decreased" && merged[0].prevShares === 3_749 && merged[0].shares === 3_521, `canon → one decrease, got ${JSON.stringify(merged)}`);
  assert(merged[0].cusip === "30233Q108", "representative cusip = latest cusip");
  // 不同 ticker(分拆出的 HONA)仍独立:HON 不变、HONA 新建。
  const hon = computeChanges(
    [{ cusip: "438516106", issuer: "HONEYWELL", value: 1, shares: 100 }, { cusip: "43849R105", issuer: "HONEYWELL AEROSPACE", value: 1, shares: 50 }] as any,
    [{ cusip: "438516106", issuer: "HONEYWELL", value: 1, shares: 100 }] as any,
    canon,
  );
  assert(hon.length === 1 && hon[0].kind === "new" && hon[0].cusip === "43849R105", "spin-off ticker stays separate");
  // 脏 ticker(非 ticker 形态)不参与归并:两个不相干 CUSIP 不能因同一脏值合并。
  const bad = computeChanges([{ cusip: "BAD000002", issuer: "B", value: 1, shares: 1 }] as any, [{ cusip: "BAD000001", issuer: "A", value: 1, shares: 1 }] as any, canon);
  assert(bad.length === 2, "garbage ticker → fall back to cusip keys");
  // 正股与期权仍分开(同 ticker 不同 putCall)。
  const opt = computeChanges([{ cusip: "30233Q108", issuer: "X", value: 1, shares: 10, putCall: "Call" }] as any, [{ cusip: "30231G102", issuer: "X", value: 1, shares: 10 }] as any, canon);
  assert(opt.length === 2, "call on new cusip ≠ long on old cusip");
}
console.log("assemble.check OK");
