import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ManagerSummary } from "@/lib/managers/types";
import { investorPath } from "@/lib/urls";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const COPY = {
  zh: { label: "我们追踪的投资者", more: (n: number) => `共 ${n} 位 →` },
  en: { label: "Tracked investors", more: (n: number) => `${n} in all →` },
} as const;

export default function TrackedInvestorsWall({
  lang,
  managers,
  total,
}: {
  lang: Lang;
  managers: ManagerSummary[];
  total: number;
}): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-16 border-t border-[var(--tt-border)] pt-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.label}</p>
      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        {managers.map((m) => (
          <Link
            key={m.cik}
            href={investorPath(lang, m.slug)}
            className="group flex items-center gap-2 no-underline"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel-2)] font-display text-[11px] font-medium text-[var(--tt-accent)]">
              {initials(m.person)}
            </span>
            <span className="font-display text-[13px] text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
              {m.person}
            </span>
          </Link>
        ))}
        <Link
          href={`/${lang}/investors`}
          className="font-mono text-[11px] text-[var(--tt-faint)] no-underline hover:text-[var(--tt-accent)]"
        >
          {c.more(total)}
        </Link>
      </div>
    </section>
  );
}
