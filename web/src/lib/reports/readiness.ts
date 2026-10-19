import { createHash } from "node:crypto";
import { effectiveFilingDeadline } from "../freshness/derive";
import type { ReportLang, ReportPayload, ReportRow } from "./types";

export const READY_COVERAGE = 0.9;
const LANGS: ReportLang[] = ["en", "zh"];

export function reportReadiness(
  row: Pick<ReportRow, "period" | "coverageFiled" | "coverageTotal">,
  today: Date,
): { ready: boolean; reason: "before_deadline" | "low_coverage" | "ready" } {
  // 截止日落在周末时顺延到周一(否则会在最后一天申报者交件之前就发预览)。
  const deadline = effectiveFilingDeadline(row.period);
  // 截止日当天仍允许申报:到“截止日的次日 0 点(UTC)”才算已过。
  if (!deadline || today.getTime() < deadline.getTime() + 86_400_000) return { ready: false, reason: "before_deadline" };
  if (row.coverageTotal <= 0 || row.coverageFiled / row.coverageTotal < READY_COVERAGE) return { ready: false, reason: "low_coverage" };
  return { ready: true, reason: "ready" };
}

function stable(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stable);
  if (v && typeof v === "object") {
    return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, stable((v as Record<string, unknown>)[k])]));
  }
  return v;
}

export function payloadHash(p: ReportPayload): string {
  return createHash("sha256").update(JSON.stringify(stable(p))).digest("hex");
}

export type FinalizePlan =
  | { kind: "error"; message: string }
  | { kind: "preview"; to: "ops" }
  | {
      kind: "run";
      freeze: boolean;
      /** 还没开始的语言:新建 broadcast → 先记 broadcastId → 再发送。 */
      sendLangs: ReportLang[];
      /** 已有 broadcastId 但没记 sentAt 的语言:先向 Resend 核实状态,绝不新建第二个 broadcast。 */
      verifyLangs: ReportLang[];
      to: "segments" | "ops";
    };

export type FinalizeGuard = {
  /** reportPeriodFor(today),由调用方计算。 */
  currentPeriod: string;
  /** CLI --allow-past-period;workflow 不暴露。 */
  allowPastPeriod: boolean;
};

export function planFinalize(
  row: ReportRow | null,
  action: "preview" | "finalize",
  dryRun: boolean,
  guard: FinalizeGuard,
): FinalizePlan {
  if (!row) return { kind: "error", message: "该季度还没有报告行(尚无投资人申报?)" };
  if (action === "preview") {
    if (row.status === "final") return { kind: "error", message: "报告已定稿,不能再生成预览" };
    return { kind: "preview", to: "ops" };
  }
  if (!row.previewPayload) return { kind: "error", message: "还没有预览:先运行 action=preview" };
  if (dryRun) return { kind: "run", freeze: false, sendLangs: [...LANGS], verifyLangs: [], to: "ops" };
  const sendLangs = LANGS.filter((l) => !row.sends[l]);
  const verifyLangs = LANGS.filter((l) => !!row.sends[l] && !row.sends[l]!.sentAt);
  const freeze = row.status === "live";
  if ((freeze || sendLangs.length > 0) && row.period !== guard.currentPeriod && !guard.allowPastPeriod) {
    return {
      kind: "error",
      message: `报告季度 ${row.period} 不是当前季度 ${guard.currentPeriod}:拒绝群发旧季度。确实要发,在本地加 --allow-past-period 运行。`,
    };
  }
  return { kind: "run", freeze, sendLangs, verifyLangs, to: "segments" };
}
