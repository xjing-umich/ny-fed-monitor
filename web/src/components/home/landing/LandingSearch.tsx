"use client";
import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, ArrowUpRight } from "lucide-react";
import type { Lang } from "@/lib/nav";
import type { SearchIndex } from "@/lib/home/searchIndex";
import { landingMatches, type LandingMatch } from "@/lib/home/search";
import { track } from "@/lib/analytics/track";
import { localePath } from "@/lib/urls";
import s from "./landing.module.css";
export default function LandingSearch({
  lang,
  index,
}: {
  lang: Lang;
  index: SearchIndex;
}) {
  const { items, stockAvailable, investorAvailable } = index;
  const zh = lang === "zh";
  const router = useRouter();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState(""),
    [open, setOpen] = useState(false),
    [selection, setSelection] = useState({ query: "", index: -1 });
  const matches = landingMatches(items, query);
  const active =
    selection.query === query && selection.index < matches.length
      ? selection.index
      : -1;
  const visible = open && query.trim().length > 0;
  const placeholder = zh
    ? "搜索公司、股票代码或投资人"
    : "Search a company, ticker or investor";
  const recordSelection = (match: LandingMatch) =>
    track("landing_search_result", {
      lang,
      kind: match.kind,
      href: match.href,
    });
  const select = (match: LandingMatch) => {
    recordSelection(match);
    setOpen(false);
    router.push(match.href);
  };
  const move = (index: number) => {
    setSelection({ query, index });
    requestAnimationFrame(() =>
      document
        .getElementById(id + "-" + index)
        ?.scrollIntoView({ block: "nearest" }),
    );
  };
  return (
    <div
      className={s.search}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
    >
      <div className={s.searchField}>
        <Search size={21} aria-hidden />
        <input
          ref={input}
          value={query}
          onChange={(e) => {
            if (!query.trim() && e.target.value.trim())
              track("landing_search_started", { lang });
            setQuery(e.target.value);
            setOpen(true);
            setSelection({ query: e.target.value, index: -1 });
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          aria-label={placeholder}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={visible}
          aria-controls={visible ? id : undefined}
          aria-activedescendant={
            visible && active >= 0 ? id + "-" + active : undefined
          }
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              setSelection({ query, index: -1 });
            } else if (
              (e.key === "ArrowDown" || e.key === "ArrowUp") &&
              matches.length
            ) {
              e.preventDefault();
              setOpen(true);
              move(
                active < 0
                  ? e.key === "ArrowDown"
                    ? 0
                    : matches.length - 1
                  : (active +
                      (e.key === "ArrowDown" ? 1 : -1) +
                      matches.length) %
                      matches.length,
              );
            } else if (e.key === "Enter" && matches.length) {
              e.preventDefault();
              select(matches[active >= 0 ? active : 0]);
            }
          }}
        />
      </div>
      {visible && (
        <div className={s.searchPopover}>
          {(!stockAvailable || !investorAvailable) && (
            <p className={s.searchFootnote} role="status">
              {!stockAvailable
                ? zh
                  ? "个股搜索暂不可用。"
                  : "Stock search is temporarily unavailable."
                : ""}{" "}
              {!investorAvailable
                ? zh
                  ? "投资人搜索暂不可用。"
                  : "Investor search is temporarily unavailable."
                : ""}{" "}
              {zh
                ? "可使用下方列表入口继续。"
                : "Continue from the list links below."}
              <Link href={localePath(lang, "/stocks")}>
                {zh ? "个股列表 →" : "Stock list →"}
              </Link>
              <Link href={localePath(lang, "/investors")}>
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
                  <p className={s.searchGroup}>
                    {zh
                      ? m.kind === "company"
                        ? "公司 · 持仓与估值"
                        : "投资人 · 13F 持仓"
                      : m.kind === "company"
                        ? "COMPANIES · HOLDINGS & VALUE"
                        : "INVESTORS · 13F HOLDINGS"}
                  </p>
                )}
                <Link
                  id={id + "-" + i}
                  href={m.href}
                  role="option"
                  aria-selected={active === i}
                  tabIndex={-1}
                  className={s.searchOption}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setSelection({ query, index: i })}
                  onClick={() => {
                    recordSelection(m);
                    setOpen(false);
                  }}
                >
                  <span>{m.label}</span>
                  <ArrowUpRight size={15} aria-hidden />
                </Link>
              </div>
            ))}
          </div>
          {!matches.length && (
            <p className={s.noResults}>
              {stockAvailable && investorAvailable
                ? zh
                  ? "没有找到已收录的公司或投资人。可换用名称或股票代码。"
                  : "No indexed company or investor matches. Try a name or ticker."
                : zh
                  ? "当前可用的索引中没有匹配结果，请从列表继续。"
                  : "No match in the currently available index. Continue from the lists."}
              <Link href={localePath(lang, "/stocks")}>
                {zh ? "浏览个股 →" : "Browse stocks →"}
              </Link>
              <Link href={localePath(lang, "/investors")}>
                {zh ? "浏览投资人 →" : "Browse investors →"}
              </Link>
            </p>
          )}
          <p className={s.searchFootnote}>
            {zh
              ? "公司结果包含公开持仓与估值；投资人结果查看 13F 持仓。"
              : "Company profiles include holdings and valuation; investor profiles show 13F holdings."}
          </p>
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
