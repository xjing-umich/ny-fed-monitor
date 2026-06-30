import React from "react";
import type { Lang } from "@/lib/nav";
import { footerCopy } from "@/lib/footer";
import NewsletterForm from "@/components/shell/NewsletterForm";

// 文末内联订阅卡片：把高意图页(投资者/个股)的搜索流量转成 owned audience。
// 复用 footer 的文案与 NewsletterForm(同一 /api/subscribe 通道),只是换个醒目的版式。
export function NewsletterCTA({ lang, source = "footer" }: { lang: Lang; source?: string }) {
  const c = footerCopy(lang);
  return (
    <section className="rounded-md border border-[var(--tt-border)] bg-[var(--tt-panel)] px-5 py-6 sm:px-7 sm:py-7">
      <h2 className="font-display text-xl font-medium leading-tight tracking-tight text-[var(--tt-text)]">
        {c.newsletter}
      </h2>
      <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--tt-muted)]">
        {c.newsletterBlurb}
      </p>
      <div className="mt-4 max-w-md">
        <NewsletterForm lang={lang} source={source} />
      </div>
    </section>
  );
}
