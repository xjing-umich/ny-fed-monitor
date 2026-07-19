import type { Lang } from "@/lib/nav";
import TrustLockup from "@/components/home/TrustLockup";

const COPY = {
  zh: {
    eyebrow: "建立在一手来源之上",
    statement:
      "每一条持仓数据都直接来自 SEC EDGAR 的 13F 申报文件，按季度环比追踪变动，不经第三方转述。估值层叠加三套保守方法——只为已经被证明的盈利能力和资产付费，不为故事和预期付费。",
    lockups: [
      { label: "数据来源", value: "SEC EDGAR · 一手来源" },
      { label: "披露延迟", value: "45 天申报延迟" },
      { label: "立场", value: "不荐股 · 不预测" },
    ],
  },
  en: {
    eyebrow: "Built on primary sources",
    statement:
      "Every position traces back to a 13F filing on SEC EDGAR, tracked quarter over quarter with no third-party retelling in between. Valuation stacks three conservative methods on top, paying only for earnings power and assets already proven, never for a story or a forecast.",
    lockups: [
      { label: "Data source", value: "SEC EDGAR · Primary source" },
      { label: "Disclosure lag", value: "45-day filing lag" },
      { label: "Stance", value: "No recommendations, no forecasts" },
    ],
  },
} as const;

export default function FoundationsGrid({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <p className="mt-4 max-w-[62ch] text-sm leading-relaxed text-[var(--tt-muted)]">{c.statement}</p>
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {c.lockups.map((item) => (
          <TrustLockup key={item.label} label={item.label} value={item.value} />
        ))}
      </div>
    </section>
  );
}
