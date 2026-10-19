/**
 * type-v2 codemod 的样例断言。跑法:cd web && npx tsx scripts/codemods/type-v2.check.ts
 */
import { findLiterals, transformSource } from "./type-v2";

function eq(actual: string, expected: string, m: string) {
  if (actual !== expected) {
    console.error(`FAIL: ${m}\n  expected: ${expected}\n  actual:   ${actual}`);
    process.exit(1);
  }
}
const full = (s: string) => transformSource(s, "full").out;
const sizeOnly = (s: string) => transformSource(s, "size-only").out;

// 字号映射,保留响应式前缀
eq(full(`<p className="text-[10px] sm:text-[11px]">x</p>`), `<p className="text-xs sm:text-xs">x</p>`, "10/11px → xs");
eq(full(`<p className="text-[12px] text-[13px] text-[15px]">x</p>`), `<p className="text-xs text-sm text-base">x</p>`, "12/13/15px");

// 典型标签:去大写与正向字距,mono → data
eq(
  full(`<span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">Source</span>`),
  `<span className="font-data text-xs text-[var(--tt-faint)]">Source</span>`,
  "标签",
);

// ticker 子节点 → font-code(同行)
eq(
  full(`<span className="ml-1.5 font-mono text-[11px] text-[var(--tt-faint)]">{h.ticker}</span>`),
  `<span className="ml-1.5 font-code text-xs text-[var(--tt-faint)]">{h.ticker}</span>`,
  "同行 ticker",
);
// ticker 子节点在下一行(EntityName 形态),uppercase 一并去掉
eq(
  full(`<span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.06em] text-[var(--tt-faint)]">\n          {ticker}\n        </span>`),
  `<span className="shrink-0 font-code text-xs text-[var(--tt-faint)]">\n          {ticker}\n        </span>`,
  "下一行 ticker",
);
eq(full(`<span className="font-mono">{c.coTicker}</span>`), `<span className="font-code">{c.coTicker}</span>`, "coTicker");
eq(full(`<span className="font-mono text-lg">{titleMeta}</span>`), `<span className="font-code text-lg">{titleMeta}</span>`, "titleMeta");

// tracking-tight 不是装饰字距,保留;无 uppercase 时正向字距也保留
eq(full(`<h1 className="uppercase tracking-tight">x</h1>`), `<h1 className="tracking-tight">x</h1>`, "保留 tracking-tight");
eq(full(`<p className="tracking-[0.06em] text-sm">x</p>`), `<p className="tracking-[0.06em] text-sm">x</p>`, "无 uppercase 不动字距");
eq(full(`<p className="uppercase tracking-wider sm:tracking-widest">x</p>`), `<p className="">x</p>`, "各种正向字距");

// 模板字面量与嵌套模板
eq(
  full("<span className={`inline-block font-mono text-[10px] uppercase ${cls}`}>x</span>"),
  "<span className={`inline-block font-data text-xs ${cls}`}>x</span>",
  "模板字面量",
);
eq(
  full("const a = `x${y ? `z` : \"\"}`; const b = \"font-mono text-[11px]\";"),
  "const a = `x${y ? `z` : \"\"}`; const b = \"font-data text-xs\";",
  "嵌套模板不吞掉后续字面量",
);

// size-only 模式只改字号
eq(
  sizeOnly(`<span className="font-mono text-[10px] uppercase tracking-[0.08em]">ADD</span>`),
  `<span className="font-mono text-xs uppercase tracking-[0.08em]">ADD</span>`,
  "size-only",
);

// 注释与普通文案不动
eq(full(`// font-mono text-[10px] uppercase\nconst x = 1;`), `// font-mono text-[10px] uppercase\nconst x = 1;`, "行注释");
eq(full(`{/* text-[11px] */}`), `{/* text-[11px] */}`, "块注释");
eq(full(`const m = "keys are uppercase only";`), `const m = "keys are uppercase only";`, "非 class 串里的 uppercase");
eq(full(`<p>It's "fine" here</p>`), `<p>It's "fine" here</p>`, "JSX 文本撇号");

// 变更报告带行号与子节点上下文
const r = transformSource(`a\n<span className="font-mono uppercase">{l}</span>`, "full");
if (r.changes.length !== 1 || r.changes[0].line !== 2 || !r.changes[0].child.startsWith(">{l}")) {
  console.error("FAIL: 变更报告", JSON.stringify(r.changes));
  process.exit(1);
}

// findLiterals 基本形态
const lits = findLiterals(`x = "a" + \`b\${"c"}d\`;`);
if (lits.length !== 2) { console.error("FAIL: findLiterals 计数", lits); process.exit(1); }

console.log("type-v2.check OK");
