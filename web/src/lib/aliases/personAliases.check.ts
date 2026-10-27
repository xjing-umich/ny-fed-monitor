import managers from "../../../config/managers.json";
import { personNameAliases } from "./config";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}
const eq = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

// 巴菲特页:只留本人中文名;接班人/芒格/票代/伯克希尔/EDGAR 曾用名都不算巴菲特的别名。
const brk = personNameAliases("berkshire-hathaway", "Warren Buffett");
assert(eq(brk, ["巴菲特", "沃伦巴菲特"]), `berkshire → ${JSON.stringify(brk)}`);
// 无 people[] 的投资人:INVESTOR_ALIASES 首词作锚,包含它的全名保留,基金名去掉;名家清单的中文全名也算。
const ps = personNameAliases("pershing-square", "Bill Ackman");
assert(eq(ps, ["阿克曼", "比尔阿克曼", "比尔·阿克曼"]), `pershing → ${JSON.stringify(ps)}`);
const hk = personNameAliases("southeastern-asset", "Mason Hawkins");
assert(eq(hk, ["霍金斯", "梅森霍金斯"]), `southeastern → ${JSON.stringify(hk)}`);
// 以姓开头或以姓结尾的基金名不算本人别名。
assert(eq(personNameAliases("gates-foundation-trust", "Bill Gates"), ["盖茨", "比尔盖茨"]), "gates foundation excluded");
assert(eq(personNameAliases("gardner-russo", "Thomas Russo"), ["鲁索", "托马斯鲁索"]), "gardner russo excluded");
assert(eq(personNameAliases("lindsell-train", "Nick Train"), ["特雷恩", "尼克特雷恩"]), "lindsell train excluded");
// 没有任何中文别名的投资人 → 空。
const none = personNameAliases("ancient-art", "Quincy Lee");
assert(none.length === 0, `ancient-art → ${JSON.stringify(none)}`);

// 全量打印,人工过目。
for (const m of managers as { slug: string; person: string }[]) {
  const a = personNameAliases(m.slug, m.person);
  if (a.length) console.log(`${m.person}: ${a.join(" / ")}`);
}
console.log("OK");
