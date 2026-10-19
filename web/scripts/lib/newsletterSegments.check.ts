/** Run: cd web && npx tsx scripts/lib/newsletterSegments.check.ts */
import { computeUntagged } from "./newsletterSegments";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const r = computeUntagged(
  [
    { email: "A@x.com", unsubscribed: false },
    { email: "b@x.com", unsubscribed: false },
    { email: "c@x.com", unsubscribed: true },
    { email: "d@x.com", unsubscribed: false },
  ],
  [{ email: "a@X.com" }, { email: "d@x.com" }, { email: "c@x.com" }],
);
assert(r.untagged.join() === "b@x.com", `只有 b 没分组(大小写不敏感,已退订的 c 不算), got ${r.untagged.join()}`);
assert(r.subscribed.length === 3, "仍订阅 3 人");
assert(computeUntagged([], []).untagged.length === 0, "空 audience");

console.log("newsletterSegments.check OK");
