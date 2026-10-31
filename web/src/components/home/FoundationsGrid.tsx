import type { Lang } from "@/lib/nav";
import TrustLockup from "@/components/home/TrustLockup";

const COPY = {
  zh: {
    eyebrow: "建立在一手来源之上",
    statement:
      "每一条持仓数据都直接来自 SEC EDGAR 的 13F 申报文件，按季度环比追踪变动，不经第三方转述。估值从已披露的盈利和资产出发，分开列出零增长底与含保守增长假设的内在价值；假设和计算依据可在个股页查看。",
    lockups: [
      { label: "数据来源", value: "SEC EDGAR · 一手来源" },
      { label: "披露延迟", value: "通常季末后 45 天内" },
      { label: "立场", value: "不荐股 · 不设股价目标" },
    ],
  },
  en: {
    eyebrow: "Built on primary sources",
    statement:
      "Every position traces back to a 13F filing on SEC EDGAR, tracked quarter over quarter with no third-party retelling in between. Valuation starts with reported earnings and assets, then separates a zero-growth floor from intrinsic value with conservative growth assumptions. Each stock page shows the assumptions and supporting figures.",
    lockups: [
      { label: "Data source", value: "SEC EDGAR · Primary source" },
      { label: "Disclosure lag", value: "Usually within 45 days after quarter-end" },
      { label: "Stance", value: "No recommendations or price targets" },
    ],
  },
} as const;

export default function FoundationsGrid({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="border-t border-[var(--tt-border)] pt-8">
      <p className="tt-eyebrow">{c.eyebrow}</p>
      <h2 className="mt-4 max-w-[62ch] text-balance text-xl font-semibold leading-snug tracking-tight text-[var(--tt-text)]">{c.statement}</h2>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {c.lockups.map((item) => (
          <TrustLockup key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
  );
}
