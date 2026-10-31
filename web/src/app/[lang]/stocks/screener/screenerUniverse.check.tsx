// 真实读取层 → 页面回归:候选超过 200/1000 时不漏行,完整 join 后再排序。
// 运行: npx tsx --tsconfig scripts/tsconfig.json 'src/app/[lang]/stocks/screener/screenerUniverse.check.tsx'
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ScreenerPage } from "./_screenerPage";
import { readConvictionScreen } from "@/lib/valuation/valuationSnapshot";

import { VALUATION_MODEL_VERSION } from "@/lib/valuation/modelVersion";

const expectations = { assessable: false as const, reason: "fixture" };

const snapshots = Array.from({ length: 1205 }, (_, i) => ({
  ticker: i === 1204 ? "CHEAP" : i === 1203 ? "CROWD" : `T${String(i).padStart(4, "0")}`,
  verdict_bucket: i === 1204 ? "below" : "above", in_strike_zone: i === 1204,
  range_lo: 80, range_hi: 150, price: 100, price_date: "2026-10-28",
  margin_pct: i === 1204 ? 0.5 : -i / 2000, coverage: "full", reliable: true,
  computed_at: "2026-10-29T12:00:00Z",
  payload: { model_version: VALUATION_MODEL_VERSION, assessment_status: "valid", ...(i === 1204 ? { expectations } : {}) },
}));
const quarantined = { ...snapshots[0], ticker: "SATS", margin_pct: 0.5 };
const legacy = { ...snapshots[0], ticker: "LEGACY", payload: { model_version: "old" } };
const solo = { ...snapshots[0], ticker: "SOLO" };
const corrupt = { ...snapshots[0], ticker: "BAD", margin_pct: 0.99 };
const zeroPrice = { ...snapshots[0], ticker: "ZEROP", price: 0 };
const holdings = [...snapshots, solo, corrupt, zeroPrice, legacy, quarantined].map((r) => ({
  ticker: r.ticker, issuer: `Issuer ${r.ticker}`,
  holder_count: r.ticker === "CROWD" ? 99 : r.ticker === "CHEAP" ? 5 : r.ticker === "SOLO" ? 1 : 10,
}));
holdings.push({ ticker: "NOQ", issuer: "Missing valuation", holder_count: 100 });

async function main() {
  const savedFetch = globalThis.fetch;
  const savedError = console.error;
  const savedEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  const requests: URL[] = [];
  let snapshotMode: "normal" | "none" | "no-cheap" = "normal";
  let broken: "snapshot-page" | "holder-join" | "snapshot-join" | null = null;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_KEY = "local-test-only";
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "http://127.0.0.1:54321", "禁止访问外部服务");
    requests.push(url);
    const table = url.pathname.split("/").at(-1);
    if (table === "consensus_stock_holders") return Response.json([]);
    assert.ok(table === "valuation_snapshot" || table === "consensus_holdings" || table === "securities");
    let rows: Record<string, unknown>[] = table === "securities" ? [...snapshots, solo].map(r => ({ ticker: r.ticker, security_type: r.ticker === "CHEAP" ? "ADR" : "Common Stock" })) : table === "valuation_snapshot" ? [...snapshots, solo, corrupt, zeroPrice, legacy, quarantined] : [...holdings];
    if (table === "valuation_snapshot" && snapshotMode === "none") rows = [];
    if (table === "valuation_snapshot" && snapshotMode === "no-cheap") rows = rows.map(r => ({...r, in_strike_zone: false, verdict_bucket: "above"}));
    const tickerFilter = url.searchParams.getAll("ticker").find(f=>f.startsWith("in.("));
    const tickerKeys = tickerFilter?.startsWith("in.(") ? tickerFilter.slice(4, -1).split(",") : null;
    for (const [field, filter] of url.searchParams) {
      if (filter.startsWith("eq.")) rows = rows.filter((r) => String(field.startsWith("payload->>") ? (r.payload as Record<string, unknown> | null)?.[field.slice(10)] : r[field]) === filter.slice(3));
      if (filter.startsWith("not.in.(")) rows = rows.filter(r=>!filter.slice(8,-1).split(",").includes(String(r[field])));
      if (filter.startsWith("gte.")) rows = rows.filter((r) => Number(r[field]) >= Number(filter.slice(4)));
    }
    if (tickerKeys) rows = rows.filter((r) => tickerKeys.includes(String(r.ticker)));
    if ((init?.method ?? (input instanceof Request ? input.method : "GET")) === "HEAD") {
      return new Response(null, { headers: { "content-range": `*/${rows.length}` } });
    }
    const from = Number(url.searchParams.get("offset") ?? 0);
    if ((broken === "snapshot-page" && table === "valuation_snapshot" && !tickerKeys && from >= 1000)
      || (broken === "holder-join" && table === "consensus_holdings" && tickerKeys?.includes("CROWD"))
      || (broken === "snapshot-join" && table === "valuation_snapshot" && tickerKeys?.includes("CHEAP"))) {
      return Response.json({ code: "TEST", message: "expected page/batch failure" }, { status: 500 });
    }
    const order = url.searchParams.get("order")?.split(",") ?? [];
    rows.sort((a, b) => {
      for (const item of order) {
        const [key, direction] = item.split(".");
        const av = a[key], bv = b[key];
        const result = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
        if (result) return direction === "desc" ? -result : result;
      }
      return 0;
    });
    // 模拟真实 PostgREST 单次最多 1000 行,即使请求 limit=5000 也不能拿全。
    const requested = Number(url.searchParams.get("limit") ?? 1000);
    if (url.searchParams.get("select")?.includes("expectations:payload->expectations")) {
      rows = rows.map((r) => ({ ...r, expectations: r.ticker === "CHEAP" ? expectations : null }));
    }
    return Response.json(rows.slice(from, from + Math.min(requested, 1000)));
  };
  const page = async (view: "all" | "conviction" | "strike_zone", sort: "margin" | "holders" = "margin") =>
    renderToStaticMarkup(await ScreenerPage({ lang: "en", view, sort })).replace(/<[^>]+>/g, "");
  try {
    const all = await page("all");
    for (const r of [...snapshots, solo]) assert.ok(all.includes(r.ticker), `全部可估值不得漏掉 ${r.ticker}`);
    assert.ok(!all.includes("BAD") && !all.includes("ZEROP"), "异常估值剔除后不截掉后续合法行");
    assert.ok(!all.includes("SATS"), "quarantined identities are excluded before pagination and counts");
    assert.ok(!all.includes("LEGACY"), "old-model rows are excluded before pagination and counts");
    assert.ok(!all.includes("NOQ"), "没有估值的持仓不伪造快照");

    const byHolders = await page("all", "holders");
    assert.ok(byHolders.indexOf("CROWD") < byHolders.indexOf("T0000"), "全体按持有人数排序,原 margin 前 200 之外也能置顶");
    const conviction = await page("conviction");
    assert.ok(conviction.indexOf("CHEAP") >= 0 && conviction.indexOf("CHEAP") < conviction.indexOf("CROWD"), "原持有人数前 200 之外的便宜票参与估值排序");
    assert.match(conviction, /1205 stocks held by 5\+ managers/, "总数来自全部合法且可估值的高共识票");
    assert.ok(!conviction.includes("SOLO") && !conviction.includes("NOQ") && !conviction.includes("BAD") && !conviction.includes("ZEROP"), "低共识/缺快照/异常值均剔除");
    const projected = await readConvictionScreen();
    assert.equal(projected.rows.find((r) => r.ticker === "CHEAP")?.securityUnit, "ADS", "row-level traded unit comes from security metadata");
    assert.deepEqual(projected.rows.find((r) => r.ticker === "CHEAP")?.expectations, expectations, "JSON 子字段投影保留原来的预期数据");
    assert.equal(projected.rows.find((r) => r.ticker === "CROWD")?.expectations, undefined, "没有预期字段时沿用 undefined");
    assert.ok(requests.some((u) => Number(u.searchParams.get("offset")) >= 1000), "实际跨过 1000 行服务端上限");
    for (const request of requests) {
      const keys = request.searchParams.get("ticker");
      if (keys?.startsWith("in.(")) assert.ok(keys.slice(4, -1).split(",").length <= (request.pathname.endsWith("/consensus_stock_holders") ? 200 : 100), "IN 查询分批,避免超长 URL 和单次截断");
      if (request.searchParams.has("offset")) assert.match(request.searchParams.get("order") ?? "", /(?:^|,)ticker\./, "分页排序以唯一 ticker 保证稳定");
    }

    console.error = () => {}; // 以下为预期故障;断言页面结果,不把日志输出当作测试成功。
    snapshotMode = "none";
    const unpublished = await page("all");
    assert.match(unpublished, /Results for the current valuation model are not available yet/, "no current-model rows is unpublished, not a zero-opportunity claim");
    assert.doesNotMatch(unpublished, /No valued stocks are confirmed|refreshing/i);
    assert.match(await page("conviction"), /Results for the current valuation model are not available yet/);
    snapshotMode = "no-cheap";
    assert.match(await page("strike_zone"), /No stocks match this view/, "successful query with a current universe can honestly report an empty filter");
    snapshotMode = "normal";
    broken = "snapshot-page";
    assert.ok(!(await page("all")).includes("T0000"), "后续快照页失败不返回半张榜单");
    assert.match(await page("all"), /temporarily unavailable/, "read failure must not look like a successful empty filter");
    broken = "holder-join";
    assert.ok(!(await page("all", "holders")).includes("T0000"), "持有人批次失败不拿残缺计数排序");
    broken = "snapshot-join";
    assert.ok(!(await page("conviction")).includes("T0000"), "估值 join 批次失败不返回半张共识榜");
  } finally {
    globalThis.fetch = savedFetch;
    console.error = savedError;
    for (const [name, value] of [["SUPABASE_URL", savedEnv.url], ["SUPABASE_SERVICE_KEY", savedEnv.key]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
  console.log("screenerUniverse.check OK (1205 consensus + 1 solo; pagination, ranking, batch failures)");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
