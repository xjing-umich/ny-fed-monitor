"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { TOP_NAV } from "@/lib/nav";
import type { Lang } from "@/lib/nav";
import SearchBox from "./SearchBox";
import { LogoMark } from "@/components/brand/Logo";

interface TopNavProps {
  lang: Lang;
  items: { label: string; href: string }[];
}

export default function TopNav({ lang, items }: TopNavProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes can't know the theme during SSR; gate theme-dependent UI on mount
  // so the server and first client render agree (prevents hydration mismatch).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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
    <header className="hidden md:flex h-15 min-h-[60px] sticky top-0 z-30 w-full items-center gap-6 px-8 bg-[var(--tt-bg)] border-b border-[var(--tt-border)]">
      {/* Masthead wordmark — display serif */}
      <Link
        href={homeHref}
        className="flex items-center gap-2 shrink-0 text-[var(--tt-text)] hover:text-[var(--tt-accent)] transition-colors no-underline"
      >
        <LogoMark className="h-[22px] w-[22px] text-[var(--tt-accent)] shrink-0" />
        <span className="font-display text-xl font-medium tracking-tight leading-none">
          Compounder
        </span>
      </Link>

      {/* Hairline separator */}
      <span className="w-px h-5 bg-[var(--tt-border)] shrink-0" />

      {/* Nav links — understated uppercase-tracked text links */}
      <nav className="flex items-center gap-6">
        {TOP_NAV.map((entry) => {
          const active = isActive(entry);
          const href = entry.key === "home" ? homeHref : `/${lang}${entry.href}`;
          return (
            <Link
              key={entry.key}
              href={href}
              className={[
                "relative text-[12px] uppercase tracking-[0.1em] transition-colors no-underline pb-0.5 border-b",
                active
                  ? "text-[var(--tt-text)] border-[var(--tt-accent)]"
                  : "text-[var(--tt-muted)] border-transparent hover:text-[var(--tt-text)]",
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
        {mounted && resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  );
}
