import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { band: "价值区间", floor: "零增长底", fair: "区间内", optimistic: "乐观上沿" },
  en: { band: "Value range", floor: "Zero-growth floor", fair: "In range", optimistic: "Optimistic top" },
} as const;

export default function ValueBandCard({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <div className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5">
      <p className="font-data text-xs text-[var(--tt-faint)]">{c.band}</p>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full">
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-90" />
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-50" />
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-25" />
      </div>
      <div className="mt-2 flex justify-between font-data text-xs text-[var(--tt-faint)]">
        <span>{c.floor}</span>
        <span>{c.fair}</span>
        <span>{c.optimistic}</span>
      </div>
    </div>
  );
}
