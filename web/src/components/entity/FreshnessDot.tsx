import type { FreshnessStatus } from "@/lib/freshness/derive";

type Lang = "zh" | "en";

const COLOR: Record<FreshnessStatus, string> = {
  fresh: "bg-emerald-500",
  stale: "bg-amber-500",
  empty: "bg-zinc-400",
};

const LABEL: Record<FreshnessStatus, { zh: string; en: string }> = {
  fresh: { zh: "数据新鲜", en: "Up to date" },
  stale: { zh: "数据可能过期", en: "May be stale" },
  empty: { zh: "暂无数据", en: "No data" },
};

export function FreshnessDot({ status, lang }: { status: FreshnessStatus; lang: Lang }) {
  const label = LABEL[status][lang];
  return (
    <span
      className={`inline-block h-1.5 w-1.5 rounded-full align-middle ${COLOR[status]}`}
      role="img"
      aria-label={label}
      title={label}
    />
  );
}
