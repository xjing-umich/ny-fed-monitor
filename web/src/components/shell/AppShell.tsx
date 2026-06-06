import React from "react";
import TopNav from "./TopNav";
import MobileDrawer from "./MobileDrawer";
import type { Lang } from "@/lib/nav";

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
      <header className="md:hidden sticky top-0 z-30 flex items-center gap-3 px-4 h-14 bg-[var(--tt-panel)] border-b border-[var(--tt-border)]">
        <MobileDrawer lang={lang} />
        <span className="text-sm font-semibold text-[var(--tt-text)] flex-1 truncate">
          {lang === "zh" ? "机构动向监控" : "Smart Money Monitor"}
        </span>
      </header>

      {/* Page content */}
      <main className="flex-1">
        <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-5">
          {children}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--tt-border)] py-2 px-6 text-[11px] text-[var(--tt-faint)] text-center">
        {lang === "zh"
          ? "本系统不提供交易建议 · 数据来源: NY Fed · Treasury.gov · SEC EDGAR"
          : "No trading advice · Sources: NY Fed · Treasury.gov · SEC EDGAR"}
      </footer>
    </div>
  );
}
