import type { Lang } from "@/lib/nav";
import { FileText, Clock, TrendingUp, Users, Calculator, Layers, Target, Languages, ShieldCheck } from "lucide-react";

const COPY = {
  zh: {
    eyebrow: "建立在一手来源之上",
    items: [
      "纯一手 SEC EDGAR 数据", "45 天申报新鲜度标注", "季度环比变动 (QoQ)",
      "跨基金共识聚合", "Buffett 所有者收益 DCF", "Greenwald 盈利能力价值",
      "Strike-zone 区间识别", "中英双语", "不荐股、不预测",
    ],
  },
  en: {
    eyebrow: "Built on primary sources",
    items: [
      "Primary SEC EDGAR data", "45-day filing freshness", "Quarter-over-quarter deltas",
      "Cross-fund consensus", "Buffett owner-earnings DCF", "Greenwald earnings-power value",
      "Strike-zone detection", "Bilingual EN / 中文", "No recommendations, no forecasts",
    ],
  },
} as const;

const ICONS = [FileText, Clock, TrendingUp, Users, Calculator, Layers, Target, Languages, ShieldCheck];

export default function FoundationsGrid({ lang }: { lang: Lang }): React.ReactElement {
  const c = COPY[lang];
  return (
    <section className="mt-24 border-t border-[var(--tt-border)] pt-8">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{c.eyebrow}</p>
      <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 md:grid-cols-3">
        {c.items.map((label, i) => {
          const Icon = ICONS[i];
          return (
            <div key={label} className="flex items-start gap-3">
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[var(--tt-accent)]" strokeWidth={1.75} aria-hidden />
              <span className="font-display text-sm text-[var(--tt-text)]">{label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
