import React from "react";
import { FoldedSection } from "@/components/entity/FoldedSection";

export type DirectoryItem = {
  href: string;
  /** 链接文字(投资人名 / ticker)。 */
  label: string;
  /** 链接后的淡色补充(基金名 / 公司名),同在 <a> 内,作为锚文本的一部分。 */
  note?: string;
};

/**
 * 列表枢纽页的全量目录(纯 RSC, 零 hydration)。
 *
 * /investors、/stocks 默认第一页同时输出数字和链接。其余分页条目也须有服务器可见的入口。
 * 这里把全部条目按字母序输出为普通 <a>,保证 sitemap 里的每个 URL 都有一条站内链接。
 * 默认折叠,不和上方表格抢版面;<details> 内的链接照常在 HTML 中,可被抓取。
 */
export function LinkDirectory({
  eyebrow,
  title,
  items,
}: {
  eyebrow: string;
  title: string;
  items: DirectoryItem[];
}): React.ReactElement | null {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => a.label.localeCompare(b.label, "en", { sensitivity: "base" }));
  return (
    <FoldedSection eyebrow={eyebrow} title={title}>
      {/* Native anchors keep this complete crawl directory out of the client Link boundary.
          Shared descendant styles avoid serializing the same class names for every entry. */}
      <ul className="columns-1 gap-x-8 text-sm sm:columns-2 lg:columns-3 [&>li]:break-inside-avoid [&>li]:py-1 [&_a]:text-[var(--tt-text)] [&_a]:no-underline [&_a:hover]:text-[var(--tt-accent)] max-sm:[&_a]:inline-flex max-sm:[&_a]:min-h-[44px] max-sm:[&_a]:items-center [&_a>span:first-child]:font-medium [&_a>span+span]:ml-1.5 [&_a>span+span]:text-[var(--tt-muted)]">
        {sorted.map((it) => (
          <li key={it.href}>
            <a href={it.href}>
              <span>{it.label}</span>
              {it.note ? <span>{it.note}</span> : null}
            </a>
          </li>
        ))}
      </ul>
    </FoldedSection>
  );
}
