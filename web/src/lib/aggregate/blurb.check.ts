/**
 * blurb.check.ts — consensusBlurb 英文句自检。
 * 「追踪」只指完整名单(97 位);句中计入人数 N 须称 counted,不得称 tracked。
 * Run: cd web && npx tsx src/lib/aggregate/blurb.check.ts
 */
import assert from "node:assert";
import { consensusBlurb, type BlurbRow } from "./blurb";

const rows: BlurbRow[] = [{ ticker: "GOOGL", issuer: "ALPHABET INC", primary: 2, delta: 0 }];
const out = consensusBlurb(rows, 2, "en");

assert.ok(out !== null, "one row yields a blurb");
assert.ok(
  out!.startsWith("Among the 2 superinvestors counted this quarter,"),
  `en blurb should open with counted wording, got: ${out}`,
);
assert.ok(!out!.includes("tracked"), `en blurb must not say "tracked", got: ${out}`);

console.log("blurb.check OK");
