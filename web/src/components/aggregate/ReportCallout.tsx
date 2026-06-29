import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { quarterLabel } from "@/lib/freshness/derive";

// 轻量语境 CTA:把 consensus/buys/sells 的读者导向那篇可转发的"季度共识报告"digest。
// 不进 SubNav(报告是出版物,非并列筛选视图),仅作页内引导 + 一条内链。
export function ReportCallout({ lang, period }: { lang: Lang; period: string | null }) {
  const isZh = lang === "zh";
  const ql = quarterLabel(period);
  return (
    <Link
      href={`/${lang}/reports/superinvestor-consensus`}
      className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-[var(--tt-border)] bg-[var(--tt-surface)] px-4 py-3 no-underline transition-colors hover:border-[var(--tt-accent)]"
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-accent)]">
          {isZh ? "季度报告" : "Quarterly report"}
        </span>
        <span className="truncate text-sm text-[var(--tt-text)]">
          {isZh
            ? `查看${ql ? ` ${ql} ` : ""}超级投资者共识报告`
            : `Read the${ql ? ` ${ql}` : ""} Superinvestor Consensus Report`}
        </span>
      </span>
      <span className="shrink-0 font-mono text-sm text-[var(--tt-muted)]">→</span>
    </Link>
  );
}
