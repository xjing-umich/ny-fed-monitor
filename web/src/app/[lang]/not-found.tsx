"use client";

// Locale-route 404. Renders when notFound() is thrown inside a /[lang] route
// (e.g. an unknown ticker or investor slug) — the common 404 path on a content
// site with many dynamic URLs. Client component so locale can come from
// usePathname (not-found doesn't receive params). Truly unmatched no-locale
// URLs are a separate, config-level concern (next.config globalNotFound).
import { usePathname } from "next/navigation";
import Link from "next/link";
import { localePath } from "@/lib/urls";

export default function LocaleNotFound() {
  const pathname = usePathname();
  const isZh = pathname?.startsWith("/zh") ?? false;
  const lang = isZh ? "zh" : "en";

  const t = isZh
    ? {
        eyebrow: "404",
        title: "页面未找到",
        intro: "你访问的页面不存在，或已被移动。可以从下面的入口继续浏览。",
        home: "返回首页",
        stocks: "浏览个股",
        investors: "浏览投资者",
      }
    : {
        eyebrow: "404",
        title: "Page not found",
        intro: "The page you’re looking for doesn’t exist or may have moved. Pick up from one of the hubs below.",
        home: "Back to home",
        stocks: "Browse stocks",
        investors: "Browse investors",
      };

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-5 py-20 sm:py-28">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{t.eyebrow}</p>
      <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
        {t.title}
      </h1>
      <p className="max-w-[55ch] text-sm leading-relaxed text-[var(--tt-muted)]">{t.intro}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <Link
          href={localePath(lang, "")}
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-[var(--tt-accent)] text-white no-underline transition-opacity hover:opacity-90"
        >
          {t.home}
        </Link>
        <Link
          href={localePath(lang, "/stocks")}
          className="inline-flex items-center justify-center rounded-md border border-[var(--tt-border)] px-4 py-2 text-sm font-medium text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-text)]"
        >
          {t.stocks}
        </Link>
        <Link
          href={localePath(lang, "/investors")}
          className="inline-flex items-center justify-center rounded-md border border-[var(--tt-border)] px-4 py-2 text-sm font-medium text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-text)]"
        >
          {t.investors}
        </Link>
      </div>
    </div>
  );
}
