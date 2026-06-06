"use client";

import React, { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ManagerSummary } from "@/lib/managers/types";
import type { Lang } from "@/lib/nav";
import { investorPath } from "@/lib/urls";
import { formatUSD } from "@/lib/format";

const COPY = {
  zh: {
    heading: "超级投资者",
    subtitle: "追踪顶级基金经理的 SEC 13F 季度持仓披露，了解聪明钱在买什么。",
    search: "搜索投资人或机构…",
    sortValue: "按组合市值",
    sortCount: "按持仓数",
    portfolio: "组合市值",
    holdings: "持仓数",
    period: "报告期",
    top: "第一大持仓",
    noResults: "无匹配结果",
  },
  en: {
    heading: "Superinvestors",
    subtitle: "Track top fund managers' quarterly SEC 13F disclosures to see what smart money is buying.",
    search: "Search by name or firm…",
    sortValue: "By portfolio value",
    sortCount: "By holding count",
    portfolio: "Portfolio",
    holdings: "Holdings",
    period: "Period",
    top: "Top holding",
    noResults: "No results",
  },
} as const;

type SortKey = "value" | "count";

type CopyEntry = typeof COPY["zh"] | typeof COPY["en"];

function InvestorCard({ manager, lang, t }: { manager: ManagerSummary; lang: Lang; t: CopyEntry }): React.ReactElement {
  return (
    <Link href={investorPath(lang, manager.slug)} className="block group">
      <Card className="h-full transition-colors group-hover:border-primary/60">
        <CardContent className="flex flex-col gap-3 p-5">
          {/* Person + firm */}
          <div>
            <div className="text-base font-semibold text-foreground leading-tight">
              {manager.person}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {manager.name}
            </div>
          </div>

          {/* Stats */}
          <div className="flex flex-col gap-1.5 font-mono tnum text-xs">
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t.portfolio}</span>
              <span className="font-semibold text-primary">{formatUSD(manager.totalValue)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t.holdings}</span>
              <span className="text-foreground">{manager.holdingCount}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-muted-foreground">{t.period}</span>
              <span className="text-foreground">{manager.period}</span>
            </div>
            <div className="flex justify-between gap-2 pt-1.5 border-t border-border mt-0.5">
              <span className="text-muted-foreground">{t.top}</span>
              <span className="text-foreground truncate max-w-[140px] text-right">
                {manager.topHolding}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export function InvestorListClient({
  lang,
  managers,
}: {
  lang: Lang;
  managers: ManagerSummary[];
}): React.ReactElement {
  const t = COPY[lang];
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("value");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q
      ? managers.filter(
          (m) =>
            m.person.toLowerCase().includes(q) ||
            m.name.toLowerCase().includes(q)
        )
      : managers;
    return [...base].sort((a, b) =>
      sort === "value" ? b.totalValue - a.totalValue : b.holdingCount - a.holdingCount
    );
  }, [managers, query, sort]);

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">{t.heading}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.subtitle}</p>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.search}
          aria-label={t.search}
          className="flex-1 min-w-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={sort === "value" ? "default" : "outline"}
            onClick={() => setSort("value")}
          >
            {t.sortValue}
          </Button>
          <Button
            size="sm"
            variant={sort === "count" ? "default" : "outline"}
            onClick={() => setSort("count")}
          >
            {t.sortCount}
          </Button>
        </div>
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{t.noResults}</p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <InvestorCard key={m.cik} manager={m} lang={lang} t={t} />
          ))}
        </div>
      )}
    </div>
  );
}
