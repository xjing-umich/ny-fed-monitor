"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { TOP_NAV } from "@/lib/nav";
import type { Lang } from "@/lib/nav";
import SearchBox from "./SearchBox";

interface TopNavProps {
  lang: Lang;
  items: { label: string; href: string }[];
}

export default function TopNav({ lang, items }: TopNavProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();

  const otherLang: Lang = lang === "zh" ? "en" : "zh";
  const otherLangPath = pathname
    ? pathname.replace(/^\/(zh|en)/, `/${otherLang}`)
    : `/${otherLang}`;

  const homeHref = `/${lang}`;

  function isActive(entry: (typeof TOP_NAV)[number]) {
    if (entry.key === "home") {
      return pathname === `/${lang}` || pathname === `/${lang}/`;
    }
    return pathname.startsWith(`/${lang}${entry.href}`);
  }

  return (
    <header className="hidden md:flex h-13 min-h-[52px] sticky top-0 z-30 w-full items-center gap-4 px-6 bg-[var(--tt-panel)] border-b border-[var(--tt-border)]">
      {/* Logo / product name */}
      <Link
        href={homeHref}
        className="flex items-center gap-2 shrink-0 text-sm font-semibold text-[var(--tt-text)] hover:text-[var(--tt-accent)] transition-colors no-underline"
      >
        <span className="text-[var(--tt-accent)] font-bold text-base">◈</span>
        <span>{lang === "zh" ? "机构动向监控" : "Smart Money Monitor"}</span>
      </Link>

      {/* Separator */}
      <span className="w-px h-5 bg-[var(--tt-border)] shrink-0" />

      {/* Nav links */}
      <nav className="flex items-center gap-1">
        {TOP_NAV.map((entry) => {
          const active = isActive(entry);
          const href = entry.key === "home" ? homeHref : `/${lang}${entry.href}`;
          return (
            <Link
              key={entry.key}
              href={href}
              className={[
                "px-3 py-1.5 rounded-md text-sm font-medium transition-colors no-underline",
                active
                  ? "text-[var(--tt-accent)] bg-[color-mix(in_srgb,var(--tt-accent)_10%,transparent)]"
                  : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)]",
              ].join(" ")}
            >
              {lang === "zh" ? entry.zh : entry.en}
            </Link>
          );
        })}
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Search */}
      <SearchBox lang={lang} items={items} />

      {/* Language toggle */}
      <div className="flex items-center gap-0.5">
        {(["zh", "en"] as const).map((l) => {
          const active = l === lang;
          return (
            <Link
              key={l}
              href={active ? "#" : otherLangPath}
              aria-current={active ? "true" : undefined}
              className={[
                "px-2 py-1 rounded text-[11px] font-mono uppercase tracking-wider transition-colors no-underline",
                active
                  ? "text-[var(--tt-accent)] bg-[color-mix(in_srgb,var(--tt-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--tt-accent)_30%,transparent)] pointer-events-none"
                  : "text-[var(--tt-muted)] hover:text-[var(--tt-text)] border border-transparent",
              ].join(" ")}
            >
              {l}
            </Link>
          );
        })}
      </div>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
        aria-label={lang === "zh" ? "切换主题" : "Toggle theme"}
        className="flex items-center justify-center w-7 h-7 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
      >
        {resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  );
}
