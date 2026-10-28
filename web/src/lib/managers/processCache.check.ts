/**
 * processCached 行为校验。跑法: npx tsx src/lib/managers/processCache.check.ts
 * 无 IO,纯计时与计数。
 */
import { processCached, __clearProcessCache } from "./processCache";

let failed = 0;
function check(name: string, ok: boolean, detail = "") {
  if (ok) return console.log(`  ✓ ${name}`);
  failed++;
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  console.log("processCached");

  // 1) TTL 内只 load 一次 —— 这正是省 egress 的机制。
  __clearProcessCache();
  let calls = 0;
  const get = processCached("k1", 60_000, async () => { calls++; return calls; });
  await get(); await get(); await get();
  check("TTL 内多次调用只 load 一次", calls === 1, `实际 load ${calls} 次`);

  // 2) 并发调用共用同一次在途请求(缓存的是 Promise 不是结果)。
  __clearProcessCache();
  let concurrentCalls = 0;
  const slow = processCached("k2", 60_000, async () => {
    concurrentCalls++;
    await new Promise((r) => setTimeout(r, 20));
    return "v";
  });
  await Promise.all([slow(), slow(), slow(), slow()]);
  check("并发调用共用一次在途请求", concurrentCalls === 1, `实际 load ${concurrentCalls} 次`);

  // 3) TTL 过期后重新 load。
  __clearProcessCache();
  let expiredCalls = 0;
  const shortTtl = processCached("k3", 10, async () => { expiredCalls++; return expiredCalls; });
  await shortTtl();
  await new Promise((r) => setTimeout(r, 25));
  await shortTtl();
  check("TTL 过期后重新 load", expiredCalls === 2, `实际 load ${expiredCalls} 次`);

  // 4) 失败不入缓存 —— 否则一次抖动会被固化整个 TTL。
  __clearProcessCache();
  let attempts = 0;
  const flaky = processCached("k4", 60_000, async () => {
    attempts++;
    if (attempts === 1) throw new Error("瞬时失败");
    return "ok";
  });
  await flaky().then(() => { throw new Error("第一次本应抛出"); }, () => {});
  const second = await flaky();
  check("失败不入缓存,下次重试", attempts === 2 && second === "ok", `attempts=${attempts} second=${second}`);

  // 5) 不同 key 互不干扰。
  __clearProcessCache();
  const a = processCached("ka", 60_000, async () => "A");
  const b = processCached("kb", 60_000, async () => "B");
  check("不同 key 互不串", (await a()) === "A" && (await b()) === "B");

  // 6) 版本变了 → TTL 内也重拉(ingest 写完映射后立刻 revalidate 的场景)。
  __clearProcessCache();
  let ver = "v1";
  let verCalls = 0;
  const versioned = processCached("kv", 60_000, async () => { verCalls++; return ver; }, async () => ver);
  await versioned(); await versioned();
  check("版本不变 → 复用", verCalls === 1, `实际 load ${verCalls} 次`);
  ver = "v2";
  const fresh = await versioned();
  check("版本变了 → TTL 内也重拉", verCalls === 2 && fresh === "v2", `load ${verCalls} 次, 值 ${fresh}`);

  // 7) 版本读失败 / 返回 null → 退回纯 TTL,不因此每次都重拉。
  __clearProcessCache();
  let fallbackCalls = 0;
  let verFails = false;
  const fallback = processCached("kf", 60_000, async () => { fallbackCalls++; return "x"; },
    async () => { if (verFails) throw new Error("版本查询失败"); return "a"; });
  await fallback();
  verFails = true;
  await fallback();
  const nullVer = processCached("kn", 60_000, async () => { fallbackCalls++; return "y"; }, async () => null);
  await nullVer(); await nullVer();
  check("版本读失败 / null → 按 TTL 复用", fallbackCalls === 2, `实际 load ${fallbackCalls} 次`);

  // 8) 并发调用同一版本仍只 load 一次。
  __clearProcessCache();
  let vcCalls = 0;
  const vc = processCached("kvc", 60_000, async () => {
    vcCalls++;
    await new Promise((r) => setTimeout(r, 20));
    return "v";
  }, async () => "same");
  await Promise.all([vc(), vc(), vc()]);
  check("带版本的并发调用共用一次在途请求", vcCalls === 1, `实际 load ${vcCalls} 次`);

  if (failed > 0) { console.error(`\n${failed} 项失败`); process.exit(1); }
  console.log("\n全部通过");
}

void main();
