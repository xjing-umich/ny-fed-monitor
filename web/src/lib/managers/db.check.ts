/**
 * selectAllPages 行为校验。跑法: npx tsx src/lib/managers/db.check.ts
 * 无 IO:用假查询模拟 PostgREST「超出 max-rows 静默截断」。
 */
import { selectAllPages, PAGE_SIZE } from "./db";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return console.log(`  ✓ ${name}`);
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

type Row = { id: number };
const rows = (n: number): Row[] => Array.from({ length: n }, (_, i) => ({ id: i }));

/** 假查询:像 PostgREST 一样每次最多回 PAGE_SIZE 行;failAt 指定的 offset 返回 error。 */
function fakeTable(all: Row[], opts: { failAt?: number; failTimes?: number } = {}) {
  const calls: number[] = [];
  let failuresLeft = opts.failTimes ?? Infinity;
  const build = () => ({
    range(from: number, to: number) {
      calls.push(from);
      if (opts.failAt === from && failuresLeft > 0) {
        failuresLeft--;
        return Promise.resolve({ data: null, error: { message: "boom" } });
      }
      return Promise.resolve({ data: all.slice(from, Math.min(to + 1, from + PAGE_SIZE)), error: null });
    },
  });
  return { build, calls };
}

async function main() {
  console.log("selectAllPages");

  // 1) 回归:Bridgewater 8 季 6757 行。单次查询只拿得到 1000 行,分页必须拿全。
  const bw = fakeTable(rows(6757));
  const r1 = await selectAllPages<Row>(bw.build);
  check("超过 1000 行时读全(6757 行)", r1.data.length === 6757 && r1.error === null, `实际 ${r1.data.length}`);
  check("行不重不漏", new Set(r1.data.map((r) => r.id)).size === 6757);

  // 2) 恰好整页的边界:1000 行要多问一页确认已到底,不能少行也不能死循环。
  const exact = fakeTable(rows(1000));
  const r2 = await selectAllPages<Row>(exact.build);
  check("恰好 1000 行读全", r2.data.length === 1000, `实际 ${r2.data.length}`);
  check("整页边界多探一页后停止", exact.calls.join(",") === "0,1000", `offset 序列 ${exact.calls.join(",")}`);

  // 3) 小结果单页即停。
  const small = fakeTable(rows(42));
  const r3 = await selectAllPages<Row>(small.build);
  check("不足一页只查一次", r3.data.length === 42 && small.calls.length === 1);

  // 4) 中间页持续失败 → 返回 error 且不给半截数据(半截数据正是本次要消灭的静默缺数)。
  const broken = fakeTable(rows(2500), { failAt: 1000 });
  const r4 = await selectAllPages<Row>(broken.build);
  check("中间页失败时返回 error", r4.error?.message === "boom");
  check("失败时不返回半截数据", r4.data.length === 0, `实际 ${r4.data.length}`);

  // 5) 单页瞬时抖动被 withRetry 吸收。
  const flaky = fakeTable(rows(2500), { failAt: 1000, failTimes: 1 });
  const r5 = await selectAllPages<Row>(flaky.build);
  check("单页抖动重试后读全", r5.error === null && r5.data.length === 2500, `实际 ${r5.data.length}`);

  if (failed) {
    console.error(`\ndb.check: ${failed} 项失败`);
    process.exit(1);
  }
  console.log("\ndb.check OK");
}

main();
