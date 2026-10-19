import { createHash } from "node:crypto";
import { filingDeadline } from "../freshness/derive";
import type { ReportLang, ReportPayload, ReportRow } from "./types";

export const READY_COVERAGE = 0.9;
const LANGS: ReportLang[] = ["en", "zh"];

export function reportReadiness(
  row: Pick<ReportRow, "period" | "coverageFiled" | "coverageTotal">,
  today: Date,
): { ready: boolean; reason: "before_deadline" | "low_coverage" | "ready" } {
  const deadline = filingDeadline(row.period);
  // 截止日当天仍允许申报:严格大于“截止日的次日 0 点”才算已过。
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
  | { kind: "run"; freeze: boolean; sendLangs: ReportLang[]; to: "segments" | "ops" };

export function planFinalize(row: ReportRow | null, action: "preview" | "finalize", dryRun: boolean): FinalizePlan {
  if (!row) return { kind: "error", message: "该季度还没有报告行(尚无投资人申报?)" };
  if (action === "preview") {
    if (row.status === "final") return { kind: "error", message: "报告已定稿,不能再生成预览" };
    return { kind: "preview", to: "ops" };
  }
  if (!row.previewPayload) return { kind: "error", message: "还没有预览:先运行 action=preview" };
  if (dryRun) return { kind: "run", freeze: false, sendLangs: [...LANGS], to: "ops" };
  const pending = LANGS.filter((l) => !row.sends[l]);
  return { kind: "run", freeze: row.status === "live", sendLangs: pending, to: "segments" };
}
