import React from "react";
import TopNav from "./TopNav";
import MobileDrawer from "./MobileDrawer";
import ContactModal from "./ContactModal";
import type { Lang } from "@/lib/nav";
import { LogoMark } from "@/components/brand/Logo";

interface AppShellProps {
  lang: Lang;
  items: { label: string; href: string }[];
  children: React.ReactNode;
}

export default function AppShell({ lang, items, children }: AppShellProps) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Desktop top nav */}
      <TopNav lang={lang} items={items} />

      {/* Mobile header strip with hamburger */}
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-[var(--tt-bg)] border-b border-[var(--tt-border)]">
        <MobileDrawer lang={lang} />
        <span className="flex items-center gap-2 flex-1 truncate">
          <LogoMark className="h-[20px] w-[20px] text-[var(--tt-accent)] shrink-0" />
          <span className="font-display text-lg font-medium tracking-tight text-[var(--tt-text)]">
            Compounder
          </span>
        </span>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-5">
          {children}
        </div>
      </main>

      {/* Footer — editorial colophon */}
      <footer className="border-t border-[var(--tt-border)] py-4 px-8">
        <div className="max-w-[1180px] mx-auto flex flex-wrap items-baseline justify-between gap-2">
          <span className="flex items-center gap-1.5">
            <LogoMark className="h-[14px] w-[14px] text-[var(--tt-faint)] shrink-0" />
            <span className="font-display text-sm font-medium text-[var(--tt-faint)]">
              Compounder
            </span>
          </span>
          <span className="flex items-center gap-3">
            <ContactModal lang={lang} />
            <span className="text-[11px] italic text-[var(--tt-faint)]">
              {lang === "zh"
                ? "本系统不提供交易建议 · 数据来源: NY Fed · Treasury.gov · SEC EDGAR"
                : "No trading advice · Sources: NY Fed · Treasury.gov · SEC EDGAR"}
            </span>
          </span>
        </div>
      </footer>
    </div>
  );
}
