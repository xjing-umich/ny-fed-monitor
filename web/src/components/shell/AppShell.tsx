import type { ReactNode } from "react";
import Footer from "./Footer";
import ShellFrame from "./ShellFrame";
import SiteHeader from "./SiteHeader";
import type { Lang } from "@/lib/nav";
import type { SearchIndex } from "@/lib/search/types";
import landingStyles from "@/components/home/landing/landing.module.css";

export default function AppShell({
  lang,
  index,
  children,
}: {
  lang: Lang;
  index: SearchIndex;
  children: ReactNode;
}) {
  const header = <SiteHeader lang={lang} index={index} />;
  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50 focus:rounded-md focus:border focus:border-[var(--tt-border)] focus:bg-[var(--tt-panel)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-[var(--tt-text)] focus:no-underline focus:shadow-md"
      >
        {lang === "zh" ? "跳到主内容" : "Skip to content"}
      </a>
      <ShellFrame
        header={header}
        homeFooter={
          <Footer
            lang={lang}
            newsletter={false}
            className={landingStyles.landingFooter}
          />
        }
        footer={<Footer lang={lang} />}
      >
        {children}
      </ShellFrame>
    </>
  );
}
