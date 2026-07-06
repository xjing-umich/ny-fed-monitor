import { computeChanges } from "./assemble";
function assert(c: boolean, m: string){ if(!c){ console.error("FAIL:", m); process.exit(1);} }
const prior = [{ cusip: "A", issuer: "AAA", value: 5_000_000_000, shares: 100, weight: 0.5 }] as any;
const latest = [] as any;
const ch = computeChanges(latest, prior);
const exited = ch.find((c) => c.kind === "exited");
assert(!!exited, "exited change emitted");
assert(exited!.value === 5_000_000_000, `exited value = prior value, got ${exited!.value}`);
console.log("assemble.check OK");
