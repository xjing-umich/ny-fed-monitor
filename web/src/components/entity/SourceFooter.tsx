type Lang = "zh" | "en";

export type Source = { name: string; asOf: string };

export type SourceFooterProps = {
  lang: Lang;
  sources: Source[];
};

export function SourceFooter({ lang, sources }: SourceFooterProps) {
  if (!sources.length) return null;

  const heading = lang === "zh" ? "数据来源" : "Sources";
  const asOfLabel = lang === "zh" ? "截至" : "as of";

  return (
    <div className="border-t border-border pt-3 space-y-1">
      <p className="tt-faint-label">{heading}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {sources.map((src) => (
          <li key={src.name} className="text-xs text-muted-foreground">
            <span className="font-medium text-card-foreground">{src.name}</span>
            {" "}
            <span>
              {asOfLabel} {src.asOf}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
