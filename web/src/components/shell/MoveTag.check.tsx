import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import MoveTag from "./MoveTag";

for (const [kind, zh, en] of [
  ["new", "● 新进", "● New"],
  ["increased", "▲ 增持", "▲ Added"],
  ["decreased", "▼ 减持", "▼ Trimmed"],
  ["exited", "○ 清仓", "○ Exited"],
] as const) {
  for (const lang of ["zh", "en"] as const) {
    const html = renderToStaticMarkup(<MoveTag kind={kind} lang={lang} />);
    assert.equal(html.replace(/<[^>]+>/g, ""), lang === "zh" ? zh : en, "首页动作与持有人表共享字形和词表");
    assert.ok(!/tt-positive|tt-negative|primary-foreground|uppercase/.test(html), "动作不能沿用红绿信号或英文缩写样式");
  }
}
console.log("MoveTag.check OK");
