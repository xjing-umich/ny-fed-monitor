import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { VerdictChip } from "./VerdictChip";
import { KeyFacts, type KeyFact } from "./KeyFacts";
import { AINarrative } from "./AINarrative";
import { SourceFooter } from "./SourceFooter";
import { RelatedLinks, type RelatedItem } from "./RelatedLinks";

// Re-export shared types so consumers can import from one place
export type { KeyFact } from "./KeyFacts";
export type { RelatedItem } from "./RelatedLinks";
export type { Source } from "./SourceFooter";

type Tone = "positive" | "warn" | "negative" | "neutral";

export type EntityPageProps = {
  lang: "zh" | "en";
  title: string;
  subtitle: string;
  verdict?: { label: string; tone: Tone };
  keyFacts: KeyFact[];
  aiPageKey?: string;
  children: React.ReactNode;
  sources: { name: string; asOf: string }[];
  related?: RelatedItem[];
};

export function EntityPage({
  lang,
  title,
  subtitle,
  verdict,
  keyFacts,
  aiPageKey,
  children,
  sources,
  related,
}: EntityPageProps): React.ReactElement {
  return (
    <div className="space-y-6">
      {/* ① Title + subtitle + verdict */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-start gap-3">
          <h1 className="text-2xl font-semibold leading-tight text-foreground">
            {title}
          </h1>
          {verdict && (
            <span className="mt-1">
              <VerdictChip label={verdict.label} tone={verdict.tone} />
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{subtitle}</p>
      </div>

      {/* ② Key facts strip */}
      {keyFacts.length > 0 && (
        <Card className="border border-border shadow-sm">
          <CardContent className="p-4">
            <KeyFacts facts={keyFacts} />
          </CardContent>
        </Card>
      )}

      {/* ③ AI narrative */}
      <AINarrative lang={lang} pageKey={aiPageKey} />

      {/* ④ Data body (tables / charts passed as children) */}
      <div className="space-y-4">{children}</div>

      {/* ⑤ Source footer */}
      <SourceFooter lang={lang} sources={sources} />

      {/* ⑥ Related links */}
      <RelatedLinks lang={lang} items={related} />
    </div>
  );
}
