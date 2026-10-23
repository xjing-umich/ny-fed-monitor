/** Run: cd web && npx tsx src/app/api/subscribe/lang.check.ts */
import { normalizeLang } from "./lang";
function assert(c: boolean, m: string) { if (!c) { console.error("FAIL:", m); process.exit(1); } }
assert(normalizeLang("zh") === "zh", "zh");
assert(normalizeLang("en") === "en", "en");
assert(normalizeLang(undefined) === "en", "缺省 en");
assert(normalizeLang("ZH") === "en", "大小写不匹配按缺省");
assert(normalizeLang(["zh"]) === "en", "非字符串 en");
console.log("lang.check OK");
