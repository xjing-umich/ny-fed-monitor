import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { i18n } from "@/lib/i18n";
import { buildExecutiveSummary, buildWatchList } from "@/lib/dashboard";
import type { Summary } from "@/lib/types";

type Lang = "zh" | "en";

export default function ExecSummary({
  lang,
  summary,
}: {
  lang: Lang;
  summary: Summary;
}) {
  const t = i18n[lang];
  // summary.cards may be absent — pass an object that matches SummaryData shape
  const summaryData = summary as unknown as Parameters<typeof buildExecutiveSummary>[1];
  const execLines = buildExecutiveSummary(lang, summaryData);
  const watchLines = buildWatchList(lang, summaryData);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-6">
      {/* Executive summary */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t.summary}
          </h3>
          <ul className="space-y-1.5">
            {execLines.map((line, i) => (
              <li key={i} className="text-sm text-card-foreground leading-relaxed flex gap-2">
                <span className="text-primary/60 font-bold shrink-0">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Watch list */}
      <Card className="border border-border shadow-sm">
        <CardContent className="p-4">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            {t.watchNext}
          </h3>
          <ul className="space-y-1.5">
            {watchLines.map((line, i) => (
              <li key={i} className="text-sm text-card-foreground leading-relaxed flex gap-2">
                <span className="text-amber-500 font-bold shrink-0">▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
