import Link from "next/link";
import type { Lang } from "@/lib/nav";
import type { ManagerSummary } from "@/lib/managers/types";
import { investorPath, localePath } from "@/lib/urls";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const COPY = {
  zh: {
    eyebrow: "我们追踪的投资者",
    heading: (n: number) => `${n} 位传奇投资者，逐季追踪。`,
    more: (n: number) => `查看全部 ${n} 位 →`,
  },
  en: {
    eyebrow: "Tracked investors",
    heading: (n: number) => `${n} legendary investors, tracked every quarter.`,
    more: (n: number) => `View all ${n} →`,
  },
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
    <section className="mt-16 border-t border-[var(--tt-border)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <h2 className="mt-3 font-display text-2xl font-medium tracking-tight text-[var(--tt-text)] sm:text-3xl">
        {c.heading(total)}
      </h2>
      <div className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:grid-cols-4">
        {managers.map((m) => (
          <Link
            key={m.cik}
            href={investorPath(lang, m.slug)}
            className="group flex items-center gap-2.5 no-underline"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--tt-border)] bg-[var(--tt-panel-2)] font-display text-[12px] font-medium text-[var(--tt-accent)]">
              {initials(m.person)}
            </span>
            <span className="truncate font-display text-[13px] text-[var(--tt-text)] transition-colors group-hover:text-[var(--tt-accent)]">
              {m.person}
            </span>
          </Link>
        ))}
      </div>
      <Link
        href={localePath(lang, "/investors")}
        className="mt-6 inline-block font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
      >
        {c.more(total)}
      </Link>
    </section>
  );
}
