// 运行: npx tsx --tsconfig scripts/tsconfig.json 'src/app/[lang]/stocks/screener/screenerCounts.check.tsx'
// 用本地快照夹具验证真实读取层 → 页面文案;不连接生产数据库。
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ScreenerPage } from "./_screenerPage";
import { readStrikeZoneLeaders } from "@/lib/valuation/valuationSnapshot";

import { projectPublicationFixture, publicationFixture, fixtureDate } from "../../../../../scripts/tests/publication-fixture";
import { date } from "@/lib/i18n/format";

const snapshot = [
  { ticker: "AAA", reliable: true, in_strike_zone: true },
  { ticker: "BBB", reliable: false, in_strike_zone: true },
  { ticker: "CCC", reliable: false, in_strike_zone: true },
  { ticker: "DDD", reliable: false, in_strike_zone: false },
].map((r) => ({
  ...r, verdict_bucket: "below", range_lo: 80, range_hi: 150, price: 50,
  price_date: "2026-10-27", margin_pct: 0.5, coverage: "full", computed_at: "2026-10-28T12:00:00Z",
}));

async function main() {
  const savedEnv = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_KEY };
  const savedFetch = globalThis.fetch;
  let confirmed = true;

  let noSnapshots = false;
  process.env.SUPABASE_URL = "http://127.0.0.1:54321";
  process.env.SUPABASE_SERVICE_KEY = "local-test-only";
  globalThis.fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    assert.equal(url.origin, "http://127.0.0.1:54321", "检查不得访问外部服务");
    if (url.pathname === "/rest/v1/securities") return Response.json(snapshot.map(r => ({ ticker: r.ticker, security_type: "Common Stock" })));
    if (url.pathname === "/rest/v1/consensus_stock_holders") return Response.json([]);
    if (url.pathname === "/rest/v1/consensus_holdings") return Response.json([]);
    assert.equal(url.pathname, "/rest/v1/tracking_securities");
    const rows = snapshot.filter((r) => {
      if (noSnapshots) return false;
      if (!confirmed && r.reliable) return false;
      for (const key of ["in_strike_zone", "reliable"] as const) {
        const filter = url.searchParams.get(key);
        if (filter && filter !== `eq.${r[key]}`) return false;
      }
      return true;
    });
    if ((init?.method ?? (input instanceof Request ? input.method : "GET")) === "HEAD") {
      return new Response(null, { headers: { "content-range": `*/${rows.length}` } });
    }
    return Response.json(rows.map((row,index)=>projectPublicationFixture(publicationFixture(row,index+1),url.searchParams.get("select"))).slice(0, Number(url.searchParams.get("limit") ?? rows.length)));
  };
  try {
    const home = await readStrikeZoneLeaders(5);
    assert.deepEqual([home.total, home.pending], [1, 2], "首页区分已确认和待确认,区间外不计入");
    for (const lang of ["zh", "en"] as const) {
      for (const view of ["strike_zone", "below", "all"] as const) {
        const text = renderToStaticMarkup(await ScreenerPage({ lang, view, sort: "margin" })).replace(/<[^>]+>/g, "");
        assert.match(text, lang === "zh" ? /1 只.*击球区.*另 2 只待确认/ : /1 valued stock.*strike zone.*2 more pending review/, `${lang}/${view}: 两数与首页一致`);
        assert.ok(text.includes(date(fixtureDate,lang)), "计数修复也保留 #249 的日期本地化");
      }
    }
    confirmed = false;

    for (const lang of ["zh", "en"] as const) {
      const text = renderToStaticMarkup(await ScreenerPage({ lang, view: "strike_zone", sort: "margin" })).replace(/<[^>]+>/g, "");
      assert.match(text, lang === "zh" ? /另 2 只待确认/ : /2 more pending review/, `${lang}: 没有已确认行仍应显示全表待确认数`);
    }
    noSnapshots = true;
    for (const lang of ["zh", "en"] as const) {
      for (const view of ["all", "below", "strike_zone", "conviction"] as const) {
        const html = renderToStaticMarkup(await ScreenerPage({ lang, view, sort: "margin" }));
        const text = html.replace(/<[^>]+>/g, "");
        assert.ok(!text.includes(lang === "zh" ? "当前没有已确认的击球区股票" : "No valued stocks are confirmed"), "缺少结果不能作为没有击球区的证据");
        assert.ok(!text.includes(lang === "zh" ? "刷新中" : "refreshing"), "无任务证据不承诺刷新中");
        if (view === "conviction") assert.ok(!text.includes(lang === "zh" ? "0 只被" : "0 stocks held"), "缺少结果不虚构持仓宇宙为零");
        assert.ok(html.includes(`href="${lang === "zh" ? "/zh" : ""}/stocks"`), "空结果仍能按持仓浏览");
      }
    }
  } finally {
    globalThis.fetch = savedFetch;
    for (const [name, value] of [["SUPABASE_URL", savedEnv.url], ["SUPABASE_SERVICE_KEY", savedEnv.key]] as const) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
  console.log("screenerCounts.check OK");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
