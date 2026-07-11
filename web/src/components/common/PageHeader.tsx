import type { ReactNode } from "react";

/** Canonical interior-page header — codifies the home design rhythm:
 *  green mono eyebrow → Fraunces title → optional dateline → optional intro.
 *  No bottom rule: SubNav / space-y separate the header from body (avoids
 *  stacking with search underlines and the next section). */
export default function PageHeader({
  eyebrow,
  title,
  dateline,
  intro,
  action,
}: {
  eyebrow?: string;
  title: string;
  /** Credential line under the title (e.g. <DataAsOfBadge/> or a FreshnessDot dateline). */
  dateline?: ReactNode;
  intro?: string;
  /** Right-aligned subordinate action (e.g. a share button). */
  action?: ReactNode;
}): React.ReactElement {
  return (
    <header className="pb-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{eyebrow}</p>
          ) : null}
          <h1 className="mt-2 font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
            {title}
          </h1>
        </div>
        {action ? <div className="shrink-0 pt-1">{action}</div> : null}
      </div>
      {dateline ? <div className="mt-2.5">{dateline}</div> : null}
      {intro ? <p className="mt-3 max-w-[60ch] text-sm leading-relaxed text-[var(--tt-muted)]">{intro}</p> : null}
    </header>
  );
}
