import React from "react";
import Link from "next/link";
import { SECONDARY_NAV } from "@/lib/nav";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";

interface SubNavProps {
  lang: Lang;
  section: "investors" | "stocks";
  active?: string;
}

export default function SubNav({ lang, section, active }: SubNavProps) {
  const items = SECONDARY_NAV[section] ?? [];

  return (
    <nav
      aria-label={lang === "zh" ? "二级导航" : "Section navigation"}
      className="flex items-center gap-0 border-b border-[var(--tt-border)] mb-4 overflow-x-auto"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const isSoon = item.soon === true;
        const label = lang === "zh" ? item.zh : item.en;

        if (isSoon) {
          return (
            <span
              key={item.key}
              className="relative flex items-center gap-1.5 max-sm:min-h-[44px] px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] text-[var(--tt-faint)] cursor-not-allowed select-none shrink-0"
            >
              {label}
              <span className="text-[9px] uppercase tracking-[0.08em] text-[var(--tt-faint)] border border-[var(--tt-border)] rounded px-1 py-0.5 leading-none">
                {lang === "zh" ? "即将上线" : "soon"}
              </span>
            </span>
          );
        }

        return (
          <Link
            key={item.key}
            href={item.href ? localePath(lang, item.href) : "#"}
            className={[
              "relative flex items-center max-sm:min-h-[44px] px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] transition-colors no-underline shrink-0",
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:transition-colors after:duration-200",
              isActive
                ? "text-[var(--tt-text)] after:bg-[var(--tt-accent)]"
                : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] after:bg-transparent hover:after:bg-[var(--tt-border)]",
            ].join(" ")}
            aria-current={isActive ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
