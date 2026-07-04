import Link from "next/link";
import type { DiscoveryCta } from "@/lib/discovery/discoveryHandoff";

/** 上下文感知出口链。文案由 discoveryHandoff 纯函数算好, 此处仅展示(RSC)。 */
export function DiscoveryHandoff({ line, href, ctaLabel }: DiscoveryCta) {
  return (
    <p className="mt-4 text-sm text-[var(--tt-muted)]">
      {line}{" "}
      <Link
        href={href}
        className="group inline-flex items-center gap-1 font-mono text-[12px] uppercase tracking-[0.08em] text-[var(--tt-text)] no-underline transition-colors hover:text-[var(--tt-accent)]"
      >
        {ctaLabel}
        <span aria-hidden className="transition-colors group-hover:text-[var(--tt-accent)]">→</span>
      </Link>
    </p>
  );
}
