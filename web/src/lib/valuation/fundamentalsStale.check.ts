import { isFundamentalsStale, FUNDAMENTALS_MAX_AGE_MONTHS } from "./fundamentalsStale";

function assert(c: boolean, m: string) {
  if (!c) {
    console.error("FAIL:", m);
    process.exit(1);
  }
}

const ASOF = "2026-07-10";

// 阈值就是 18 个月(契约固定,防误改)
assert(FUNDAMENTALS_MAX_AGE_MONTHS === 18, "阈值 18 个月");

// 新鲜:最新 FY ~10 月前(2025-09-30)→ 不过期
assert(!isFundamentalsStale("2025-09-30", ASOF), "10 月前年报不过期");

// 刚跨年度周期:~15 月前(2025-03-31,India ADR 待下份 20-F)→ 仍不过期(3 月宽限)
assert(!isFundamentalsStale("2025-03-31", ASOF), "15 月前年报在宽限内不过期");

// 掉队:~25 月前(2024-06-30)→ 过期
assert(isFundamentalsStale("2024-06-30", ASOF), "25 月前年报过期");

// 外股 ADR 僵尸:2012 年 → 过期
assert(isFundamentalsStale("2012-12-31", ASOF), "十年前年报过期(VALE 式外股 ADR)");

// 边界:恰好 18 月前(2025-01-10)附近 —— 略早于此过期,略晚于此不过期
assert(isFundamentalsStale("2024-12-01", ASOF), "19 月前过期(边界外侧)");
assert(!isFundamentalsStale("2025-02-01", ASOF), "约 17 月前不过期(边界内侧)");

// 无年报数据 → 视为过期(无法背书新鲜度)
assert(isFundamentalsStale(null, ASOF), "null 年报视为过期");
assert(isFundamentalsStale(undefined, ASOF), "undefined 年报视为过期");

console.log("fundamentalsStale.check OK");
