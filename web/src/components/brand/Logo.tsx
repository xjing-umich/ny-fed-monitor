import React from "react";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path d="M2.5 19.5 C 8.5 19.5, 12 16.5, 14 10.5 C 15.6 5.8, 18 3.6, 21 3.2"
        stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="21" cy="3.3" r="2.1" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ lang, className }: { lang: "zh" | "en"; className?: string }) {
  void lang; // lang kept for future caller use (linking to /${lang} is the caller's job)
  return (
    <span className={`flex items-center gap-2 ${className ?? ""}`}>
      <LogoMark className="h-[22px] w-[22px] text-[var(--tt-accent)] shrink-0" />
      <span className="font-display font-medium tracking-tight leading-none">
        Compounder
      </span>
    </span>
  );
}
