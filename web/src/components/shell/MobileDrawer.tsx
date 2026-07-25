"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Menu, X, Sun, Moon } from "lucide-react";
import { TOP_NAV } from "@/lib/nav";
import type { Lang } from "@/lib/nav";
import { LogoMark } from "@/components/brand/Logo";
import { localePath } from "@/lib/urls";

/** true on the client after hydration, false during SSR — no effect/setState needed. */
const subscribe = () => () => {};
function useMounted() {
  return useSyncExternalStore(subscribe, () => true, () => false);
}

interface MobileDrawerProps {
  lang: Lang;
}

export default function MobileDrawer({ lang }: MobileDrawerProps) {
  // openFor 记录打开时的 pathname;路由变化后自动视为已关闭 —— 无需 effect setState。
  const [openFor, setOpenFor] = useState<string | null>(null);
  const pathname = usePathname();
  const open = openFor !== null && openFor === pathname;
  const setOpen = (v: boolean) => setOpenFor(v ? pathname : null);
  const { resolvedTheme, setTheme } = useTheme();
  // next-themes can't know the theme during SSR; gate theme-dependent UI on mount
  // so the server and first client render agree (prevents hydration mismatch).
  const mounted = useMounted();

  const otherLang: Lang = lang === "zh" ? "en" : "zh";
  // 当前 pathname 去掉语言前缀(裸 en 无前缀; /zh 有前缀),再按目标语言重新加。
  const barePath = pathname ? pathname.replace(/^\/(zh|en)(?=\/|$)/, "") : "";
  const otherLangPath = localePath(otherLang, barePath);

  // Trap scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
    <>
      {/* Hamburger — visible only on mobile */}
      <button
        onClick={() => setOpen(true)}
        aria-label={lang === "zh" ? "打开菜单" : "Open menu"}
        className="md:hidden flex items-center justify-center w-11 h-11 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
      >
        <Menu size={16} />
      </button>

      {/* Overlay */}
      {open && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Drawer */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={lang === "zh" ? "导航菜单" : "Navigation menu"}
        inert={!open}
        className={[
          "md:hidden fixed top-0 left-0 h-full w-72 z-50 flex flex-col",
          "bg-[var(--tt-panel)] border-r border-[var(--tt-border)] shadow-lg",
          "transition-transform duration-200",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-4 h-14 border-b border-[var(--tt-border)] shrink-0">
          <span className="flex items-center gap-2">
            <LogoMark className="h-[20px] w-[20px] text-[var(--tt-accent)] shrink-0" />
            <span className="font-display text-lg font-medium tracking-tight text-[var(--tt-text)]">
              Compounder
            </span>
          </span>
          <button
            onClick={() => setOpen(false)}
            aria-label={lang === "zh" ? "关闭菜单" : "Close menu"}
            className="flex items-center justify-center w-11 h-11 rounded-md text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Nav links */}
        <nav className="flex flex-col gap-1 p-3">
          {TOP_NAV.map((entry) => {
            const active = isActive(entry);
            const href =
              entry.key === "home" ? homeHref : localePath(lang, entry.href);
            return (
              <Link
                key={entry.key}
                href={href}
                onClick={() => setOpen(false)}
                className={[
                  "flex items-center border-l-2 px-3 min-h-[44px] text-sm font-medium transition-colors no-underline",
                  active
                    ? "border-[var(--tt-accent)] text-[var(--tt-text)]"
                    : "border-transparent text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:border-[var(--tt-border)]",
                ].join(" ")}
              >
                {lang === "zh" ? entry.zh : entry.en}
              </Link>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Bottom controls */}
        <div className="p-4 border-t border-[var(--tt-border)] flex items-center justify-between">
          {/* Language toggle */}
          <div className="flex items-center gap-1">
            {(["zh", "en"] as const).map((l) => {
              const active = l === lang;
              // Active locale is current state, not a destination.
              if (active) {
                return (
                  <span
                    key={l}
                    aria-current="true"
                    className="inline-flex items-center justify-center min-h-[44px] px-3 rounded text-[11px] font-mono uppercase tracking-wider text-[var(--tt-accent)] bg-[color-mix(in_srgb,var(--tt-accent)_12%,transparent)] border border-[color-mix(in_srgb,var(--tt-accent)_30%,transparent)]"
                  >
                    {l}
                  </span>
                );
              }
              return (
                <Link
                  key={l}
                  href={otherLangPath}
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center min-h-[44px] px-3 rounded text-[11px] font-mono uppercase tracking-wider transition-colors no-underline text-[var(--tt-muted)] hover:text-[var(--tt-text)] border border-[var(--tt-border)]"
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
            className="flex items-center justify-center w-11 h-11 rounded-md border border-[var(--tt-border)] text-[var(--tt-muted)] hover:text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors"
          >
            {mounted && resolvedTheme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
          </button>
        </div>
      </div>
    </>
  );
}
