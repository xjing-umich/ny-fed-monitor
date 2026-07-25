"use client";

import React, { useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { TOP_NAV } from "@/lib/nav";
import type { Lang } from "@/lib/nav";
import SearchBox from "./SearchBox";
import { LogoMark } from "@/components/brand/Logo";
import { localePath } from "@/lib/urls";

/** true on the client after hydration, false during SSR — no effect/setState needed. */
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

interface TopNavProps {
  lang: Lang;
  items: { label: string; href: string }[];
}

export default function TopNav({ lang, items }: TopNavProps) {
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes can't know the theme during SSR; gate theme-dependent UI on mount
  // so the server and first client render agree (prevents hydration mismatch).
  const mounted = useMounted();

  const otherLang: Lang = lang === "zh" ? "en" : "zh";
  // 当前 pathname 去掉语言前缀(裸 en 无前缀; /zh 有前缀),再按目标语言重新加。
  const barePath = pathname ? pathname.replace(/^\/(zh|en)(?=\/|$)/, "") : "";
  const otherLangPath = localePath(otherLang, barePath);

  const homeHref = localePath(lang, "");

  // barePath 已去语言前缀,服务端预渲染与客户端 hydrate 后一致(pathname 会因
  // proxy rewrite 在两端不同,如 "/investors" vs "/en/investors",故不能直接比 pathname)。
  function isActive(entry: (typeof TOP_NAV)[number]) {
    if (entry.key === "home") {
      return barePath === "" || barePath === "/";
    }
    return barePath.startsWith(entry.href);
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
          const href = entry.key === "home" ? homeHref : localePath(lang, entry.href);
          return (
            <Link
              key={entry.key}
              href={href}
              className={[
                "relative inline-flex items-center min-h-[36px] text-[13px] uppercase tracking-[0.1em] transition-colors no-underline",
                "after:absolute after:bottom-1 after:left-0 after:right-0 after:h-px after:transition-colors",
                active
                  ? "text-[var(--tt-text)] after:bg-[var(--tt-accent)]"
                  : "text-[var(--tt-muted)] after:bg-transparent hover:text-[var(--tt-text)] hover:after:bg-[var(--tt-border)]",
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
          // Active locale is current state, not a destination — render a
          // non-interactive <span> rather than a dead `href="#"` link.
          if (active) {
            return (
              <span
                key={l}
                aria-current="true"
                className="inline-flex items-center justify-center min-h-[32px] px-2 rounded text-[11px] font-mono uppercase tracking-wider text-[var(--tt-accent)] bg-[color-mix(in_srgb,var(--tt-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--tt-accent)_30%,transparent)]"
              >
                {l}
              </span>
            );
          }
          return (
            <Link
              key={l}
              href={otherLangPath}
              className="inline-flex items-center justify-center min-h-[32px] px-2 rounded text-[11px] font-mono uppercase tracking-wider transition-colors no-underline text-[var(--tt-muted)] hover:text-[var(--tt-text)] border border-transparent"
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
        className="flex items-center justify-center w-8 h-8 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
      >
        {mounted && resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
      </button>
    </header>
  );
}
