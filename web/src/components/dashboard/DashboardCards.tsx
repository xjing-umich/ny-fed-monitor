import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Section, Summary } from "@/lib/types";
import {
  badgeTone,
  displayStatusValue,
  shortCardValue,
  sectionLabel,
} from "@/lib/dashboard";

type Lang = "zh" | "en";

// Tone → Tailwind classes for left accent border + badge
const TONE_CLASSES: Record<string, { border: string; badge: string }> = {
  red:    { border: "border-l-4 border-l-red-500",    badge: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
  orange: { border: "border-l-4 border-l-orange-400", badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300" },
  yellow: { border: "border-l-4 border-l-yellow-400", badge: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  green:  { border: "border-l-4 border-l-emerald-500",badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300" },
  gray:   { border: "border-l-4 border-l-slate-400",  badge: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300" },
};

// Derive signal cards from sections since summary.cards may be absent
type DerivedCard = {
  id: string;
  labelEn: string;
  labelZh: string;
  value: string | undefined;
};

const CARD_DEFS: { id: string; sectionKey: string; labelEn: string; labelZh: string; metricIndex?: number }[] = [
  { id: "dealer_inventory_pressure", sectionKey: "dealer-inventory",  labelEn: "Dealer Inventory",       labelZh: "交易商库存" },
  { id: "repo_financing_usage",      sectionKey: "repo-financing",    labelEn: "Repo Financing",         labelZh: "回购融资" },
  { id: "funding_rate_stress",       sectionKey: "reference-rates",   labelEn: "Funding Rate Stress",    labelZh: "资金利率压力" },
  { id: "policy_expectations_risk",  sectionKey: "policy-expectations",labelEn: "Policy Expectations",  labelZh: "政策预期" },
  { id: "liquidity_stress",          sectionKey: "fails",             labelEn: "Fails / Liquidity",      labelZh: "结算失败 / 流动性" },
  { id: "auction_risk",              sectionKey: "auction-risk",      labelEn: "Auction Risk",           labelZh: "拍卖风险" },
];

function deriveCardValue(section: Section | undefined): string {
  if (!section) return "Unavailable";
  const freshnessStatus = section.freshness_status;
  if (freshnessStatus) return freshnessStatus;
  const first = section.key_metrics?.[0]?.value;
  if (first) return first;
  return section.mode === "unavailable" ? "Unavailable" : "N/A";
}

export default function DashboardCards({
  lang,
  sections,
  summary,
}: {
  lang: Lang;
  sections: Record<string, Section>;
  summary: Summary;
}) {
  const cards: DerivedCard[] = CARD_DEFS.map((def) => ({
    id: def.id,
    labelEn: def.labelEn,
    labelZh: def.labelZh,
    value: deriveCardValue(sections[def.sectionKey]),
  }));

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
      {cards.map((card) => {
        const tone = badgeTone(card.value);
        const cls = TONE_CLASSES[tone] ?? TONE_CLASSES.gray;
        const label = lang === "zh" ? card.labelZh : card.labelEn;
        const displayVal = displayStatusValue(lang, card.value);
        const shortVal = shortCardValue(card.id, lang, card.value);

        return (
          <Card
            key={card.id}
            className={`shadow-sm hover:shadow-md transition-shadow ${cls.border}`}
          >
            <CardContent className="p-3 space-y-1">
              <p className="text-xs text-muted-foreground leading-tight">{label}</p>
              <p className="tnum text-sm font-bold text-card-foreground leading-snug">
                {shortVal}
              </p>
              <Badge className={`text-[10px] px-1.5 py-0 font-normal ${cls.badge}`}>
                {displayVal}
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
}
