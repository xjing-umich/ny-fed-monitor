"use client";

// Locale-route error boundary. Catches unexpected runtime errors thrown in any
// page under /[lang] and renders a calm, on-brand fallback with a retry — instead
// of a blank screen on transient data-source failures. Error boundaries MUST be
// Client Components; locale comes from usePathname (params aren't passed here).
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { localePath } from "@/lib/urls";

export default function LocaleError({
  error,
  unstable_retry,
  reset,
}: {
  error: Error & { digest?: string };
  // Next 16.2+ passes unstable_retry (re-fetches + re-renders the segment);
  // accept reset too so the boundary is robust across minor versions.
  unstable_retry?: () => void;
  reset?: () => void;
}) {
  const pathname = usePathname();
  const isZh = pathname?.startsWith("/zh") ?? false;

  useEffect(() => {
    // Surface for server/client logs; digest matches the server-side entry.
    console.error(error);
  }, [error]);

  const t = isZh
    ? {
        eyebrow: "出错",
        title: "出了点问题",
        intro: "加载此页面时发生意外错误，可能只是临时问题。请重试，或返回首页。",
        retry: "重试",
        home: "返回首页",
        ref: "错误编号",
      }
    : {
        eyebrow: "Error",
        title: "Something went wrong",
        intro: "An unexpected error occurred while loading this page. It may be temporary — try again, or head back home.",
        retry: "Try again",
        home: "Back to home",
        ref: "Reference",
      };

  const retry = () => (unstable_retry ?? reset)?.();

  return (
    <div className="mx-auto flex max-w-xl flex-col items-start gap-5 py-20 sm:py-28">
      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[var(--tt-accent)]">{t.eyebrow}</p>
      <h1 className="font-display text-3xl font-medium leading-tight tracking-tight text-[var(--tt-text)] sm:text-4xl">
        {t.title}
      </h1>
      <p className="max-w-[55ch] text-sm leading-relaxed text-[var(--tt-muted)]">{t.intro}</p>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium bg-[var(--tt-accent)] text-[var(--primary-foreground)] transition-opacity hover:opacity-90"
        >
          {t.retry}
        </button>
        <Link
          href={localePath(isZh ? "zh" : "en", "")}
          className="inline-flex items-center justify-center rounded-md border border-[var(--tt-border)] px-4 py-2 text-sm font-medium text-[var(--tt-muted)] no-underline transition-colors hover:border-[var(--tt-accent)] hover:text-[var(--tt-text)]"
        >
          {t.home}
        </Link>
      </div>
      {error.digest ? (
        <p className="mt-2 font-mono text-[10px] text-[var(--tt-faint)]">
          {t.ref}: {error.digest}
        </p>
      ) : null}
    </div>
  );
}
