import React from "react";
import type { Lang } from "@/lib/nav";
import type { Freshness13F } from "@/lib/freshness/derive";

const COPY = {
  zh: {
    provenance: (period: string, filedAt: string) =>
      `数据截至 ${period}（${filedAt} 提交）· 来源 SEC EDGAR`,
    stale: (period: string, lag: number) =>
      `⚠ 该投资者最新公开 13F 为 ${period}，落后当前披露季 ${lag} 季。以下持仓与解读反映该期数据，可能并非当前持仓。`,
    inactive: (period: string) =>
      `⚠ 已停报：该申报主体最后一次 13F 为 ${period}，此后未再申报。以下为历史数据，并非当前持仓。`,
  },
  en: {
    provenance: (period: string, filedAt: string) =>
      `Data as of ${period} (filed ${filedAt}) · Source: SEC EDGAR`,
    stale: (period: string, lag: number) =>
      `⚠ This manager's most recent public 13F covers ${period}, ${lag} quarter${lag === 1 ? "" : "s"} behind the latest disclosure quarter. Holdings below reflect that filing and may not be current.`,
    inactive: (period: string) =>
      `⚠ No longer filing: this filer's last 13F covers ${period}, with none since. Holdings below are historical, not current.`,
  },
} as const;

/**
 * 13F 来源/截止日常显行 + 按三档新鲜度的条件警示。
 * 纯展示组件(服务端渲染)，判定由调用方用 freshness13F 算好传入。
 */
export function FreshnessBadge({
  lang,
  period,
  filedAt,
  status,
  lagQuarters,
}: {
  lang: Lang;
  period: string;
  filedAt: string;
  status: Freshness13F;
  lagQuarters: number;
}): React.ReactElement {
  const t = COPY[lang];
  return (
    <div className="space-y-2">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-faint)]">
        {t.provenance(period, filedAt)}
      </p>
      {status === "stale" && (
        <div className="border-l-2 border-[var(--tt-warn)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
          {t.stale(period, lagQuarters)}
        </div>
      )}
      {status === "inactive" && (
        <div className="border-l-2 border-[var(--tt-negative)] bg-[var(--tt-surface)] px-4 py-3 text-sm leading-relaxed text-[var(--tt-text)]">
          {t.inactive(period)}
        </div>
      )}
    </div>
  );
}
