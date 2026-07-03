"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Lang } from "@/lib/nav";
import { SECONDARY_NAV } from "@/lib/nav";
import { localePath } from "@/lib/urls";

export default function MacroSubNav({ lang }: { lang: Lang }) {
  const searchParams = useSearchParams();
  const active = searchParams.get("view") ?? undefined;
  const items = SECONDARY_NAV.macro ?? [];

  return (
    <nav
      aria-label={lang === "zh" ? "二级导航" : "Section navigation"}
      className="flex items-center gap-0 border-b border-[var(--tt-border)] mb-8 overflow-x-auto"
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const label = lang === "zh" ? item.zh : item.en;

        return (
          <Link
            key={item.key}
            href={item.href ? localePath(lang, item.href) : "#"}
            className={[
              "relative flex items-center px-4 py-2.5 text-[11px] uppercase tracking-[0.1em] transition-colors no-underline shrink-0",
              "after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px]",
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
