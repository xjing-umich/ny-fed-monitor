import assert from "node:assert/strict";
import type { MouseEvent } from "react";
import { switchLangKeepingQuery } from "./langSwitch";

const origin = "https://thecompounder.fyi";
let current = new URL("/zh/stocks?q=AAPL&sort=value&dir=asc&tc_internal=1#main-content", origin);
Object.defineProperty(globalThis, "window", { configurable: true, value: { get location() { return current; } } });
try {
  for (const target of ["/stocks", "/zh/stocks", "/stocks", "/zh/stocks"]) {
    let prevented = false;
    const event = { button: 0, preventDefault() { prevented = true; } } as MouseEvent<HTMLAnchorElement>;
    switchLangKeepingQuery(event, target, (href) => { current = new URL(href, origin); });
    assert.equal(current.pathname, target);
    assert.equal(current.search, "?q=AAPL&sort=value&dir=asc&tc_internal=1");
    assert.equal(current.hash, "#main-content", "repeated locale switching appends the current fragment only once");
    assert.ok(prevented);
  }
  let pushed = false;
  switchLangKeepingQuery({ button: 0, metaKey: true } as MouseEvent<HTMLAnchorElement>, "/stocks", () => { pushed = true; });
  assert.equal(pushed, false, "modified clicks retain the anchor's native browser behavior");
} finally {
  Reflect.deleteProperty(globalThis, "window");
}
console.log("langSwitch.check OK — helper duplication not reproduced");
