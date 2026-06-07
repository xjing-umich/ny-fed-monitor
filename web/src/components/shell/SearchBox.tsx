"use client";

import React, { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import type { Lang } from "@/lib/nav";

interface SearchItem {
  label: string;
  href: string;
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

  const filtered =
    query.trim().length > 0
      ? items.filter((item) =>
          item.label.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 8)
      : [];

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
    } else if (e.key === "Enter" && filtered.length > 0) {
      router.push(filtered[0].href);
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
    (lang === "zh" ? "搜索投资者/指标…" : "Search investors / indicators…");

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

      {open && filtered.length > 0 && (
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
        </div>
      )}
    </div>
  );
}
