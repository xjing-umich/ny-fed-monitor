"use client";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowUpRight } from "lucide-react";
import type { Lang } from "@/lib/nav";
import type { SearchIndex, SearchResult } from "@/lib/search/types";
import { matchSearch, nextSearchOption } from "@/lib/search/match";
import { track } from "@/lib/analytics/track";
import { localePath } from "@/lib/urls";
import s from "./search.module.css";

export default function GlobalSearch({
  lang,
  index,
  variant = "header",
  onNavigate,
}: {
  lang: Lang;
  index: SearchIndex;
  variant?: "hero" | "header" | "menu";
  onNavigate?: () => void;
}) {
  const zh = lang === "zh",
    router = useRouter(),
    id = useId();
  const container = useRef<HTMLDivElement>(null),
    input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [selection, setSelection] = useState({ query: "", results: "", index: -1 });
  const matches = matchSearch(index.items, query),
    signature = matches.map((m) => m.href).join("|");
  const active =
    selection.query === query &&
    selection.results === signature &&
    selection.index < matches.length
      ? selection.index
      : -1;
  const visible = open && query.trim().length > 0;
  const label = zh
    ? "搜索公司、股票代码或投资人"
    : "Search a company, ticker or investor";
  const placeholder =
    variant === "header"
      ? zh
        ? "搜索公司或投资人"
        : "Company, ticker or investor"
      : label;
  const close = () => {
    setOpen(false);
    setSelection({ query, results: signature, index: -1 });
  };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => {
      if (!container.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);
  useLayoutEffect(() => {
    if (!visible || variant === "menu") return;
    const place = () => {
      const rect = input.current?.getBoundingClientRect(),
        node = container.current;
      if (!rect || !node) return;
      const viewport = window.visualViewport,
        top = viewport?.offsetTop ?? 0,
        bottom = top + (viewport?.height ?? window.innerHeight);
      const below = bottom - rect.bottom - 14,
        above = rect.top - top - 14;
      const up = below < 180 && above > below;
      node.dataset.side = up ? "above" : "below";
      node.style.setProperty(
        "--search-space",
        Math.max(96, Math.min(420, up ? above : below)) + "px",
      );
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
    };
  }, [visible, variant]);
  const record = (match: SearchResult) => {
    track(variant === "hero" ? "landing_search_result" : "site_search_result", {
      lang,
      kind: match.kind,
      href: match.href,
      source: variant,
    });
    setOpen(false);
    setQuery("");
    setSelection({ query: "", results: "", index: -1 });
    onNavigate?.();
  };
  const move = (i: number) => {
    setSelection({ query, results: signature, index: i });
    requestAnimationFrame(() =>
      document
        .getElementById(id + "-" + i)
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  return (
    <div
      ref={container}
      className={`${s.search} ${s[variant]}`}
      data-search-variant={variant}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) close();
      }}
    >
      <div className={s.field}>
        <Search size={variant === "hero" ? 21 : 18} aria-hidden />
        <input
          ref={input}
          type="text"
          inputMode="search"
          role="combobox"
          aria-label={label}
          placeholder={placeholder}
          value={query}
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={visible ? id : undefined}
          aria-activedescendant={
            visible && active >= 0 ? id + "-" + active : undefined
          }
          onChange={(e) => {
            if (!query.trim() && e.target.value.trim())
              track(
                variant === "hero"
                  ? "landing_search_started"
                  : "site_search_started",
                { lang, source: variant },
              );
            setQuery(e.target.value);
            setOpen(true);
            setSelection({ query: e.target.value, results: "", index: -1 });
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape" && visible) {
              e.preventDefault();
              e.stopPropagation();
              close();
            } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              if (matches.length) {
                e.preventDefault();
                setOpen(true);
                move(
                  nextSearchOption(
                    active,
                    e.key === "ArrowDown" ? 1 : -1,
                    matches.length,
                  ),
                );
              }
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (matches.length) {
                const item = matches[active >= 0 ? active : 0];
                record(item);
                router.push(item.href);
              }
            }
          }}
        />
      </div>
      {visible && (
        <div className={s.popover}>
          {(!index.stockAvailable || !index.investorAvailable) && (
            <p className={s.note} role="status">
              {!index.stockAvailable
                ? zh
                  ? "个股搜索暂不可用。"
                  : "Stock search is temporarily unavailable."
                : ""}{" "}
              {!index.investorAvailable
                ? zh
                  ? "投资人搜索暂不可用。"
                  : "Investor search is temporarily unavailable."
                : ""}
              <Link href={localePath(lang, "/stocks")} onClick={onNavigate}>
                {zh ? "个股列表 →" : "Stock list →"}
              </Link>
              <Link href={localePath(lang, "/investors")} onClick={onNavigate}>
                {zh ? "投资人列表 →" : "Investor list →"}
              </Link>
            </p>
          )}
          <div
            id={id}
            role="listbox"
            aria-label={zh ? "搜索结果" : "Search results"}
          >
            {matches.map((m, i) => (
              <div key={m.href}>
                {(i === 0 || m.kind !== matches[i - 1].kind) && (
                  <p className={s.group}>
                    {zh
                      ? m.kind === "company"
                        ? "公司 · 持仓与估值"
                        : "投资人 · 13F 持仓"
                      : m.kind === "company"
                        ? "Companies · holdings & value"
                        : "Investors · 13F holdings"}
                  </p>
                )}
                <Link
                  id={id + "-" + i}
                  href={m.href}
                  role="option"
                  aria-selected={active === i}
                  tabIndex={-1}
                  className={s.option}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() =>
                    setSelection({ query, results: signature, index: i })
                  }
                  onClick={() => record(m)}
                >
                  <span>{m.label}</span>
                  <ArrowUpRight size={15} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
          {!matches.length && (
            <p className={s.empty}>
              {index.stockAvailable && index.investorAvailable
                ? zh
                  ? "没有找到已收录的公司或投资人。可换用名称或股票代码。"
                  : "No indexed company or investor matches. Try a name or ticker."
                : zh
                  ? "当前可用的索引中没有匹配结果，请从列表继续。"
                  : "No match in the currently available index. Continue from the lists."}
              <Link href={localePath(lang, "/stocks")} onClick={onNavigate}>
                {zh ? "浏览个股 →" : "Browse stocks →"}
              </Link>
              <Link href={localePath(lang, "/investors")} onClick={onNavigate}>
                {zh ? "浏览投资人 →" : "Browse investors →"}
              </Link>
            </p>
          )}
          {variant === "hero" && (
            <p className={s.note}>
              {zh
                ? "公司结果包含公开持仓与估值；投资人结果查看 13F 持仓。"
                : "Company profiles include holdings and valuation; investor profiles show 13F holdings."}
            </p>
          )}
        </div>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {visible
          ? zh
            ? `${matches.length} 个搜索结果`
            : `${matches.length} search results`
          : ""}
      </span>
    </div>
  );
}
