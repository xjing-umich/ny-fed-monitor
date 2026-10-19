/** Run: cd web && npx tsx src/lib/reports/readiness.check.ts */
import { reportReadiness, payloadHash, planFinalize } from "./readiness";
import type { ReportPayload, ReportRow } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

const r = { period: "2026-09-30", coverageFiled: 90, coverageTotal: 97 };
assert(reportReadiness(r, new Date("2026-11-14T12:00:00Z")).reason === "before_deadline", "截止日当天(11/14)仍未到");
assert(reportReadiness(r, new Date("2026-11-16T12:00:00Z")).reason === "ready", "截止后且 90/97≥0.9 → ready");
assert(reportReadiness({ ...r, coverageFiled: 80 }, new Date("2026-11-20T00:00:00Z")).reason === "low_coverage", "80/97 < 0.9");
assert(reportReadiness({ ...r, coverageTotal: 0, coverageFiled: 0 }, new Date("2026-12-01T00:00:00Z")).reason === "low_coverage", "total=0 不得 ready");

const p1 = { schemaVersion: 1, period: "2026-09-30", coverage: { filed: 1, total: 2 } } as unknown as ReportPayload;
const p2 = { coverage: { total: 2, filed: 1 }, period: "2026-09-30", schemaVersion: 1 } as unknown as ReportPayload;
assert(payloadHash(p1) === payloadHash(p2), "键序不同哈希相同");
assert(payloadHash(p1) !== payloadHash({ ...p1, period: "2026-06-30" } as ReportPayload), "内容不同哈希不同");

const row = (over: Partial<ReportRow>): ReportRow => ({
  period: "2026-09-30", status: "live", payload: p1, payloadHash: "h", coverageFiled: 90, coverageTotal: 97,
  valuationAsOf: null, firstLiveAt: "", generatedAt: "", previewPayload: null, previewValuationAsOf: null,
  previewSentAt: null, finalizedAt: null, sends: {}, ...over,
});

assert(planFinalize(null, "finalize", false).kind === "error", "无行 → error");
assert(planFinalize(row({}), "preview", false).kind === "preview", "preview 动作");
const noPrev = planFinalize(row({}), "finalize", false);
assert(noPrev.kind === "error" && /preview/.test(noPrev.message), "未预览不得定稿");

const fresh = planFinalize(row({ previewPayload: p1, previewSentAt: "x" }), "finalize", false);
assert(fresh.kind === "run" && fresh.freeze && fresh.to === "segments" && fresh.sendLangs.join() === "en,zh", "首次定稿:冻结并发两种语言");

const partial = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" } } }), "finalize", false);
assert(partial.kind === "run" && !partial.freeze && partial.sendLangs.join() === "zh", "重跑:已 final 不再冻结,只补发 zh");

const done = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" }, zh: { broadcastId: "b2", sentAt: "t" } } }), "finalize", false);
assert(done.kind === "run" && done.sendLangs.length === 0, "全部已发 → 无事可做");

const dry = planFinalize(row({ previewPayload: p1, previewSentAt: "x" }), "finalize", true);
assert(dry.kind === "run" && !dry.freeze && dry.to === "ops" && dry.sendLangs.join() === "en,zh", "dry_run:不冻结,只发给站长");

const dryFinal = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" } } }), "finalize", true);
assert(dryFinal.kind === "run" && dryFinal.sendLangs.join() === "en,zh", "dry_run 不受 sends 影响,两种都发给站长");

assert(planFinalize(row({ status: "final" }), "preview", false).kind === "error", "已定稿不能再预览");

console.log("readiness.check OK");
