import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import HeroMasthead from "./HeroMasthead";

const row = { cusip: "TEST", issuer: "Synthetic Company", count: 2, value: 1000, dominantKind: "increased" as const };
for (const lang of ["zh", "en"] as const) {
  const html = renderToStaticMarkup(<HeroMasthead lang={lang} period="2026-06-30" movesPeriod="2026-06-30" investorCount={3} availableStocks={new Set(['TEST'])} moves={{ mostBought: [row], mostSold: [{ ...row, dominantKind: "decreased" }] }} />);
  const counts = [...html.matchAll(/<span([^>]*class="[^"]*tabular-nums[^"]*"[^>]*)>([\s\S]*?)<\/span>/g)];
  assert.equal(counts.length, 2, "夹具应包含买卖两个动作数量");
  for (const count of counts) {
    assert.ok(!/var\(--tt-(?:positive|negative)\)/.test(count[1]), "首页动作数量不能继续表达红绿买卖信号");
  }
  const text = html.replace(/<[^>]+>/g, "");
  assert.ok(text.includes(lang === "zh" ? "▲ 增持" : "▲ Added"));
  assert.ok(text.includes(lang === "zh" ? "▼ 减持" : "▼ Trimmed"));
  const exited = renderToStaticMarkup(<HeroMasthead lang={lang} period="2026-06-30" movesPeriod="2026-06-30" availableStocks={new Set()} moves={{ mostBought: [], mostSold: [{ ...row, dominantKind: 'exited' }] }} />);
  assert.ok(exited.includes('Synthetic Company'), 'exit remains readable');
  assert.ok(!exited.includes('/stocks/TEST'), 'last-holder exit must not link to an unavailable detail');
}
console.log("HeroMasthead.check OK");
