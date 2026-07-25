import type { Lang } from "@/lib/nav";

const COPY = {
  zh: { band: "价值带", floor: "保守下限", fair: "合理区间", optimistic: "乐观上限" },
  en: { band: "Value band", floor: "Conservative floor", fair: "Fair range", optimistic: "Optimistic ceiling" },
} as const;

export default function ValueBandCard({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <div className="ticks rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[var(--tt-faint)]">{c.band}</p>
      <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full">
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-90" />
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-50" />
        <span className="h-full w-1/3 bg-[var(--tt-accent)] opacity-25" />
      </div>
      <div className="mt-2 flex justify-between font-mono text-[10px] text-[var(--tt-faint)]">
        <span>{c.floor}</span>
        <span>{c.fair}</span>
        <span>{c.optimistic}</span>
      </div>
    </div>
  );
}
