import React from "react";
import Link from "next/link";
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
 * /investors、/stocks 的交互表格是客户端组件(useSearchParams + 按钮分页),预渲染时整块
 * 落到 Suspense fallback,服务端 HTML 里一个条目链接都没有;爬虫只能靠 sitemap 找到详情页。
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
      <ul className="columns-1 gap-x-8 text-sm sm:columns-2 lg:columns-3">
        {sorted.map((it) => (
          <li key={it.href} className="break-inside-avoid py-1">
            <Link
              href={it.href}
              prefetch={false}
              className="text-[var(--tt-text)] no-underline hover:text-[var(--tt-accent)] max-sm:inline-flex max-sm:min-h-[44px] max-sm:items-center"
            >
              <span className="font-medium">{it.label}</span>
              {it.note ? <span className="ml-1.5 text-[var(--tt-muted)]">{it.note}</span> : null}
            </Link>
          </li>
        ))}
      </ul>
    </FoldedSection>
  );
}
