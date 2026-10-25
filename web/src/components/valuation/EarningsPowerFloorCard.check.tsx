// 运行: npx tsx src/components/valuation/EarningsPowerFloorCard.check.tsx
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { EarningsPowerFloorCard } from "./EarningsPowerFloorCard";
import type { PerShareUnavailable } from "@/lib/valuation/types";

const floor: PerShareUnavailable = { kind: "per_share_unavailable", reason: "每股口径暂不可用(测试)" };
const text = (part?: "all" | "summary" | "details") =>
  renderToStaticMarkup(<EarningsPowerFloorCard floor={floor} lang="zh" part={part} />).replace(/<[^>]+>/g, " ");

const all = text();
assert.ok(all.includes("每股口径暂不可用(测试)") && all.includes("方法与数字"), "默认 all:两半都在");
const summary = text("summary");
assert.ok(summary.includes("每股口径暂不可用(测试)"), "summary 含原因");
assert.ok(!summary.includes("方法与数字"), "summary 不含方法折叠");
const details = text("details");
assert.ok(details.includes("方法与数字"), "details 含方法折叠");
assert.ok(!details.includes("每股口径暂不可用(测试)"), "details 不含摘要");
console.log("EarningsPowerFloorCard.check OK");
