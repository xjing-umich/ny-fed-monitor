import assert from "node:assert/strict";
import type { MouseEvent } from "react";
import { switchLangKeepingQuery } from "./langSwitch";

const origin = "https://thecompounder.fyi";
let current = new URL(
  "/zh/stocks?q=AAPL&sort=value&dir=asc&tc_internal=1#main-content",
  origin,
);
Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    get location() {
      return current;
    },
  },
});
try {
  for (const target of ["/stocks", "/zh/stocks", "/stocks", "/zh/stocks"]) {
    let prevented = false;
    const event = {
      button: 0,
      currentTarget: { href: target },
      preventDefault() {
        prevented = true;
      },
    } as unknown as MouseEvent<HTMLAnchorElement>;
    switchLangKeepingQuery(event, target, (href) => {
      current = new URL(href, origin);
    });
    assert.equal(current.pathname, target);
    assert.equal(current.search, "?q=AAPL&sort=value&dir=asc&tc_internal=1");
    assert.equal(
      current.hash,
      "#main-content",
      "repeated locale switching appends the current fragment only once",
    );
    assert.ok(prevented);
  }
  let pushed = false;
  switchLangKeepingQuery(
    { button: 0, metaKey: true } as MouseEvent<HTMLAnchorElement>,
    "/stocks",
    () => {
      pushed = true;
    },
  );
  assert.equal(
    pushed,
    false,
    "modified clicks retain the anchor's native browser behavior",
  );
  const anchor = { href: "/stocks" };
  switchLangKeepingQuery(
    {
      button: 0,
      metaKey: true,
      currentTarget: anchor,
    } as unknown as MouseEvent<HTMLAnchorElement>,
    "/stocks",
    () => {
      pushed = true;
    },
  );
  assert.equal(
    anchor.href,
    "/stocks" + current.search + current.hash,
    "native new-tab navigation keeps the current query and fragment",
  );
  const contextAnchor = { href: "/stocks" };
  let contextPushed = false;
  switchLangKeepingQuery(
    {
      button: 0,
      type: "contextmenu",
      currentTarget: contextAnchor,
      preventDefault() {
        throw new Error("context menu must stay native");
      },
    } as unknown as MouseEvent<HTMLAnchorElement>,
    "/stocks",
    () => {
      contextPushed = true;
    },
  );
  assert.equal(contextPushed, false, "keyboard context menu must not navigate");
  current = new URL("/zh/stocks", origin);
  switchLangKeepingQuery(
    {
      button: 1,
      currentTarget: anchor,
    } as unknown as MouseEvent<HTMLAnchorElement>,
    "/stocks",
    () => {},
  );
  assert.equal(
    anchor.href,
    "/stocks",
    "native link clears query from earlier locale clicks",
  );
} finally {
  Reflect.deleteProperty(globalThis, "window");
}
console.log("langSwitch.check OK — helper duplication not reproduced");
