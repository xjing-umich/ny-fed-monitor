import React from "react";
import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { TOP_NAV } from "@/lib/nav";
import { footerCopy, LEGAL_LINKS } from "@/lib/footer";
import { LogoMark } from "@/components/brand/Logo";
import ContactModal from "./ContactModal";
import NewsletterForm from "./NewsletterForm";
import ScrollToTop from "./ScrollToTop";

const colHeading =
  "text-[11px] font-semibold uppercase tracking-wider text-[var(--tt-faint)]";
const colLink =
  "text-sm text-[var(--tt-muted)] hover:text-[var(--tt-text)] transition-colors no-underline";

export default function Footer({ lang }: { lang: Lang }) {
  const c = footerCopy(lang);
  const year = 2026; // Date.* unavailable in this runtime; site launched 2026.

  return (
    <footer className="border-t border-[var(--tt-border)] bg-[var(--tt-panel-2)]">
      {/* Columns */}
      <div className="max-w-[1180px] mx-auto px-6 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Explore */}
          <nav className="flex flex-col gap-3">
            <span className={colHeading}>{c.explore}</span>
            {TOP_NAV.map((entry) => (
              <Link
                key={entry.key}
                href={entry.key === "home" ? `/${lang}` : `/${lang}${entry.href}`}
                className={colLink}
              >
                {lang === "zh" ? entry.zh : entry.en}
              </Link>
            ))}
          </nav>

          {/* Legal */}
          <nav className="flex flex-col gap-3">
            <span className={colHeading}>{c.legal}</span>
            {LEGAL_LINKS.map((l) => (
              <Link key={l.slug} href={`/${lang}/${l.slug}`} className={colLink}>
                {lang === "zh" ? l.zh : l.en}
              </Link>
            ))}
          </nav>

          {/* Support */}
          <div className="flex flex-col gap-3">
            <span className={colHeading}>{c.support}</span>
            <Link href={`/${lang}/about`} className={colLink}>
              {c.about}
            </Link>
            <ContactModal lang={lang} />
          </div>

          {/* Stay Updated */}
          <div className="flex flex-col gap-3 col-span-2 md:col-span-1">
            <span className={colHeading}>{c.newsletter}</span>
            <p className="text-xs leading-relaxed text-[var(--tt-muted)]">
              {c.newsletterBlurb}
            </p>
            <NewsletterForm lang={lang} />
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div className="border-t border-[var(--tt-border)]">
        <div className="max-w-[1180px] mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-3">
          <span className="flex items-center gap-1.5">
            <LogoMark className="h-[14px] w-[14px] text-[var(--tt-faint)] shrink-0" />
            <span className="font-display text-sm font-medium text-[var(--tt-faint)]">
              Compounder
            </span>
          </span>
          <span className="flex-1 min-w-[200px] text-[11px] text-[var(--tt-faint)]">
            © {year} Compounder · {c.rights} {c.notAffiliated} {c.noAdvice}
          </span>
          <ScrollToTop label={c.backToTop} />
        </div>
      </div>
    </footer>
  );
}
