import Link from "next/link";
import type { DiscoveryCta } from "@/lib/discovery/discoveryHandoff";

/** 上下文感知"下一步"出口面板。文案由 discoveryHandoff 纯函数算好, 此处仅展示(RSC)。 */
export function DiscoveryHandoff({ eyebrow, line, href, ctaLabel }: DiscoveryCta) {
  return (
    <section className="mt-6 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5 sm:p-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
      <p className="mt-2 text-sm text-[var(--tt-text)]">{line}</p>
      <Link
        href={href}
        className="group mt-3 inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-accent)]"
      >
        {ctaLabel}
        <span aria-hidden className="transition-colors group-hover:text-[var(--tt-accent)]">→</span>
      </Link>
    </section>
  );
}
