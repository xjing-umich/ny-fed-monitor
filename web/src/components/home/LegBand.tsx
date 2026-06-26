import React from "react";
import Link from "next/link";

// 通用三腿分带 chrome(RSC):eyebrow + h2 + 一句描述 + 查看全部 链接 + children(各腿自渲染 3 项)。
// h2 承担文档大纲的二级标题(单 h1 在 hero)。
export function LegBand({
  eyebrow,
  title,
  description,
  href,
  viewAll,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  href: string;
  viewAll: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="mt-12">
      <div className="flex items-baseline justify-between border-b border-[var(--tt-border)] pb-2">
        <div>
          <span className="font-display text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--tt-faint)]">
            {eyebrow}
          </span>
          <h2 className="font-display text-xl font-medium tracking-tight text-[var(--tt-text)]">{title}</h2>
        </div>
        <Link
          href={href}
          className="whitespace-nowrap font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-accent)] no-underline hover:underline"
        >
          {viewAll}
        </Link>
      </div>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--tt-muted)]">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
