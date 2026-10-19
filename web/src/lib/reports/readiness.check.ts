/** Run: cd web && npx tsx src/lib/reports/readiness.check.ts */
import { reportReadiness, payloadHash, planFinalize, type FinalizeGuard } from "./readiness";
import type { ReportPayload, ReportRow } from "./types";

function assert(c: boolean, m: string) {
  if (!c) { console.error("FAIL:", m); process.exit(1); }
}

// Q3 2026:法定 +45 天 = 周六 11/14,顺延到周一 11/16;截止日当天(含)仍可申报。
const r = { period: "2026-09-30", coverageFiled: 90, coverageTotal: 97 };
assert(reportReadiness(r, new Date("2026-11-14T12:00:00Z")).reason === "before_deadline", "11/14(周六,名义截止)仍未到");
assert(reportReadiness(r, new Date("2026-11-15T12:00:00Z")).reason === "before_deadline", "11/15(周日)仍未到:实际截止顺延到 11/16");
assert(reportReadiness(r, new Date("2026-11-16T23:59:00Z")).reason === "before_deadline", "11/16 23:59Z 仍在截止日当天");
assert(reportReadiness(r, new Date("2026-11-17T00:00:00Z")).reason === "ready", "11/17 00:00Z 起且 90/97≥0.9 → ready");
assert(reportReadiness({ ...r, coverageFiled: 80 }, new Date("2026-11-20T00:00:00Z")).reason === "low_coverage", "80/97 < 0.9");
assert(reportReadiness({ ...r, coverageTotal: 0, coverageFiled: 0 }, new Date("2026-12-01T00:00:00Z")).reason === "low_coverage", "total=0 不得 ready");
// 工作日截止不顺延:Q2 2026 = 周五 8/14
const q2 = { period: "2026-06-30", coverageFiled: 90, coverageTotal: 97 };
assert(reportReadiness(q2, new Date("2026-08-14T23:59:00Z")).reason === "before_deadline", "Q2 截止日当天");
assert(reportReadiness(q2, new Date("2026-08-15T00:00:00Z")).reason === "ready", "Q2 次日 ready");

const p1 = { schemaVersion: 1, period: "2026-09-30", coverage: { filed: 1, total: 2 } } as unknown as ReportPayload;
const p2 = { coverage: { total: 2, filed: 1 }, period: "2026-09-30", schemaVersion: 1 } as unknown as ReportPayload;
assert(payloadHash(p1) === payloadHash(p2), "键序不同哈希相同");
assert(payloadHash(p1) !== payloadHash({ ...p1, period: "2026-06-30" } as ReportPayload), "内容不同哈希不同");

const row = (over: Partial<ReportRow>): ReportRow => ({
  period: "2026-09-30", status: "live", payload: p1, payloadHash: "h", coverageFiled: 90, coverageTotal: 97,
  valuationAsOf: null, firstLiveAt: "", generatedAt: "", previewPayload: null, previewValuationAsOf: null,
  previewSentAt: null, finalizedAt: null, sends: {}, ...over,
});
const G: FinalizeGuard = { currentPeriod: "2026-09-30", allowPastPeriod: false };

assert(planFinalize(null, "finalize", false, G).kind === "error", "无行 → error");
assert(planFinalize(row({}), "preview", false, G).kind === "preview", "preview 动作");
const noPrev = planFinalize(row({}), "finalize", false, G);
assert(noPrev.kind === "error" && /preview/.test(noPrev.message), "未预览不得定稿");

const fresh = planFinalize(row({ previewPayload: p1, previewSentAt: "x" }), "finalize", false, G);
assert(fresh.kind === "run" && fresh.freeze && fresh.to === "segments" && fresh.sendLangs.join() === "en,zh" && fresh.verifyLangs.length === 0, "首次定稿:冻结并发两种语言");

// —— 幂等:sentAt 已写 = 已完成;有 broadcastId 但 sentAt 为空 = 待核实(绝不新建第二个 broadcast)
const partial = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" } } }), "finalize", false, G);
assert(partial.kind === "run" && !partial.freeze && partial.sendLangs.join() === "zh" && partial.verifyLangs.length === 0, "重跑:已 final 不再冻结,只补发 zh");

const done = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" }, zh: { broadcastId: "b2", sentAt: "t" } } }), "finalize", false, G);
assert(done.kind === "run" && done.sendLangs.length === 0 && done.verifyLangs.length === 0, "全部已发 → 无事可做");

const inFlight = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: null }, zh: { broadcastId: "b2", sentAt: "t" } } }), "finalize", false, G);
assert(inFlight.kind === "run" && inFlight.verifyLangs.join() === "en" && inFlight.sendLangs.length === 0, "en 有 broadcastId 无 sentAt → verifyLangs,不进 sendLangs");

const mixed = planFinalize(row({ status: "final", previewPayload: p1, sends: { zh: { broadcastId: "b2", sentAt: null } } }), "finalize", false, G);
assert(mixed.kind === "run" && mixed.sendLangs.join() === "en" && mixed.verifyLangs.join() === "zh", "en 未开始 → sendLangs;zh 待核实 → verifyLangs");

// —— dry-run
const dry = planFinalize(row({ previewPayload: p1, previewSentAt: "x" }), "finalize", true, G);
assert(dry.kind === "run" && !dry.freeze && dry.to === "ops" && dry.sendLangs.join() === "en,zh" && dry.verifyLangs.length === 0, "dry_run:不冻结,只发给站长");

const dryFinal = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" } } }), "finalize", true, G);
assert(dryFinal.kind === "run" && dryFinal.sendLangs.join() === "en,zh", "dry_run 不受 sends 影响,两种都发给站长");

assert(planFinalize(row({ status: "final" }), "preview", false, G).kind === "error", "已定稿不能再预览");

// —— 防止群发旧季度(Q2 已 SQL 定稿、sends={})
const Q4 = { currentPeriod: "2026-12-31", allowPastPeriod: false };
const q2Row = row({ period: "2026-06-30", status: "final", previewPayload: p1, sends: {} });
const past = planFinalize(q2Row, "finalize", false, G);
assert(past.kind === "error" && /2026-06-30/.test(past.message) && /2026-09-30/.test(past.message), "非当前季度 + 无 --allow-past-period → error,消息写明两个季度");
const pastOk = planFinalize(q2Row, "finalize", false, { ...G, allowPastPeriod: true });
assert(pastOk.kind === "run" && pastOk.sendLangs.join() === "en,zh", "--allow-past-period 放行");
const pastDry = planFinalize(q2Row, "finalize", true, G);
assert(pastDry.kind === "run" && pastDry.to === "ops", "dry-run 不受季度限制");
const pastLive = planFinalize(row({ previewPayload: p1 }), "finalize", false, Q4);
assert(pastLive.kind === "error", "季度已翻篇后首次定稿也拦截");
const pastDone = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" }, zh: { broadcastId: "b2", sentAt: "t" } } }), "finalize", false, Q4);
assert(pastDone.kind === "run" && pastDone.sendLangs.length === 0, "全部已发的旧季度:无发送,允许重跑只刷新缓存");
const pastVerify = planFinalize(row({ status: "final", previewPayload: p1, sends: { en: { broadcastId: "b1", sentAt: "t" }, zh: { broadcastId: "b2", sentAt: null } } }), "finalize", false, Q4);
assert(pastVerify.kind === "run" && pastVerify.verifyLangs.join() === "zh", "旧季度的待核实语言允许完成(不新建 broadcast)");
assert(planFinalize(q2Row, "preview", false, G).kind === "error", "preview 旧 final 行仍报已定稿");

console.log("readiness.check OK");
