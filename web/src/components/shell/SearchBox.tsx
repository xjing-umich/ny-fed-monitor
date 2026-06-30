"use client";

import React, { useState, useRef, useEffect, useId } from "react";
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
  // Active descendant for keyboard navigation; -1 = nothing highlighted (Enter
  // then falls back to the first match / ticker guess, preserving prior behavior).
  const [active, setActive] = useState(-1);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();
  const optionId = (i: number) => `${listboxId}-opt-${i}`;

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

  // 下拉无匹配但输入像 ticker 时, 提供一条「直达个股」入口。
  const showTickerFallback = tickerGuess !== null && filtered.length === 0;

  // 统一的可选项列表(下拉项 + 可选的 ticker 兜底),键盘与鼠标共用同一索引空间。
  const options: { href: string; label: string }[] = [
    ...filtered.map((item) => ({ href: item.href, label: item.label })),
    ...(showTickerFallback
      ? [{ href: `/${lang}/stocks/${tickerGuess}`, label: tickerGuess as string }]
      : []),
  ];
  const hasOptions = options.length > 0;

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

  // 输入变化时重置高亮,避免索引指向已不存在的项。
  useEffect(() => {
    setActive(-1);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setQuery("");
      setOpen(false);
      setActive(-1);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      if (!hasOptions) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % options.length);
      return;
    }
    if (e.key === "ArrowUp") {
      if (!hasOptions) return;
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i <= 0 ? options.length - 1 : i - 1));
      return;
    }
    if (e.key === "Enter") {
      // 有高亮 → 选高亮项;否则沿用旧行为(首个匹配 / ticker 直达)。
      const dest =
        active >= 0 && options[active]
          ? options[active].href
          : filtered.length > 0
            ? filtered[0].href
            : tickerGuess
              ? `/${lang}/stocks/${tickerGuess}`
              : null;
      if (!dest) return;
      router.push(dest);
      setQuery("");
      setOpen(false);
      setActive(-1);
    }
  }

  function handleSelect(href: string) {
    router.push(href);
    setQuery("");
    setOpen(false);
    setActive(-1);
  }

  const placeholder =
    placeholderProp ??
    (lang === "zh" ? "搜索投资者 / 股票 / 指标…" : "Search investors / stocks / indicators…");

  const isHero = variant === "hero";
  const listOpen = open && hasOptions;

  return (
    <div
      ref={containerRef}
      className={isHero ? "relative w-full max-w-xl" : "relative"}
    >
      <div
        className={[
          "flex items-center rounded-md border border-[var(--tt-border)] bg-[var(--tt-surface)] text-[var(--tt-muted)] focus-within:border-[var(--tt-accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--tt-accent)_25%,transparent)] transition-colors",
          isHero ? "gap-2.5 h-12 px-4" : "gap-1.5 h-8 px-2.5",
        ].join(" ")}
      >
        <Search size={isHero ? 18 : 13} className="shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={listOpen}
          aria-controls={listOpen ? listboxId : undefined}
          aria-autocomplete="list"
          aria-activedescendant={listOpen && active >= 0 ? optionId(active) : undefined}
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

      {listOpen && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={placeholder}
          className={[
            "absolute top-full mt-1 left-0 rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] shadow-md z-50 overflow-hidden",
            isHero ? "w-full" : "w-72",
          ].join(" ")}
        >
          {filtered.map((item, i) => (
            <button
              key={item.href}
              id={optionId(i)}
              role="option"
              aria-selected={active === i}
              onMouseDown={() => handleSelect(item.href)}
              onMouseEnter={() => setActive(i)}
              className={[
                "w-full text-left font-display text-[var(--tt-text)] transition-colors truncate",
                active === i ? "bg-[var(--tt-surface)] text-[var(--tt-accent)]" : "hover:bg-[var(--tt-surface)] hover:text-[var(--tt-accent)]",
                isHero ? "px-4 py-2.5 text-sm" : "px-3 py-2 text-[13px]",
              ].join(" ")}
            >
              {item.label}
            </button>
          ))}
          {showTickerFallback && (
            <button
              id={optionId(filtered.length)}
              role="option"
              aria-selected={active === filtered.length}
              onMouseDown={() => handleSelect(`/${lang}/stocks/${tickerGuess}`)}
              onMouseEnter={() => setActive(filtered.length)}
              className={[
                "flex w-full items-center justify-between gap-2 text-left text-[var(--tt-muted)] transition-colors",
                active === filtered.length ? "bg-[var(--tt-surface)]" : "hover:bg-[var(--tt-surface)]",
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
