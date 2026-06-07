"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Lang } from "@/lib/nav";

interface SearchItem {
  label: string;
  href: string;
  /** 额外搜索关键词(中文别名、ticker 等),空格分隔;参与匹配但不展示。 */
  keywords?: string;
}

interface SearchBoxProps {
  lang: Lang;
  items: SearchItem[];
  variant?: "default" | "hero";
  placeholder?: string;
}

export default function SearchBox({
  lang,
  items,
  variant = "default",
  placeholder: placeholderProp,
}: SearchBoxProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const filtered =
    q.length > 0
      ? items
          .filter(
            (item) =>
              item.label.toLowerCase().includes(q) ||
              (item.keywords && item.keywords.toLowerCase().includes(q))
          )
          .slice(0, 8)
      : [];

  // 形如 ticker 的输入(1-6 位字母, 可含点, 如 BRK.B):即使下拉无匹配, 也允许直达个股页。
  const tickerGuess =
    /^[a-zA-Z]{1,6}(\.[a-zA-Z])?$/.test(query.trim())
      ? query.trim().toUpperCase()
      : null;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      inputRef.current?.blur();
    } else if (e.key === "Enter") {
      const dest = filtered.length > 0
        ? filtered[0].href
        : tickerGuess
          ? `/${lang}/stocks/${tickerGuess}`
          : null;
      if (!dest) return;
      router.push(dest);
      setQuery("");
      setOpen(false);
    }
  }

  function handleSelect(href: string) {
    router.push(href);
    setQuery("");
    setOpen(false);
  }

  const placeholder =
    placeholderProp ??
    (lang === "zh" ? "搜索投资者 / 股票 / 指标…" : "Search investors / stocks / indicators…");

  // 下拉无匹配但输入像 ticker 时, 提供一条「直达个股」入口。
  const showTickerFallback = tickerGuess !== null && filtered.length === 0;

  const isHero = variant === "hero";

  return (
    <div
      ref={containerRef}
      className={isHero ? "relative w-full max-w-xl" : "relative"}
    >
      <div
        className={[
          "flex items-center rounded-md border border-[var(--tt-border)] bg-[var(--tt-surface)] text-[var(--tt-muted)] focus-within:border-[var(--tt-accent)] transition-colors",
          isHero ? "gap-2.5 h-12 px-4" : "gap-1.5 h-8 px-2.5",
        ].join(" ")}
      >
        <Search size={isHero ? 18 : 13} className="shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label={placeholder}
          className={[
            "bg-transparent text-[var(--tt-text)] placeholder:text-[var(--tt-faint)] outline-none",
            isHero ? "w-full flex-1 text-base" : "w-56 text-xs",
          ].join(" ")}
        />
      </div>

      {open && (filtered.length > 0 || showTickerFallback) && (
        <div
          className={[
            "absolute top-full mt-1 left-0 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] shadow-md z-50 overflow-hidden",
            isHero ? "w-full" : "w-72",
          ].join(" ")}
        >
          {filtered.map((item) => (
            <button
              key={item.href}
              onMouseDown={() => handleSelect(item.href)}
              className={[
                "w-full text-left text-[var(--tt-text)] hover:bg-[var(--tt-surface)] transition-colors truncate",
                isHero ? "px-4 py-2.5 text-sm" : "px-3 py-2 text-xs",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
          {showTickerFallback && (
            <button
              onMouseDown={() => handleSelect(`/${lang}/stocks/${tickerGuess}`)}
              className={[
                "flex w-full items-center justify-between gap-2 text-left text-[var(--tt-muted)] hover:bg-[var(--tt-surface)] transition-colors",
                isHero ? "px-4 py-2.5 text-sm" : "px-3 py-2 text-xs",
              ].join(" ")}
            >
              <span className="truncate">
                {lang === "zh" ? `查看个股 ${tickerGuess}` : `Go to ${tickerGuess}`}
              </span>
              <span className="shrink-0 font-mono text-[var(--tt-accent)]">→</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
