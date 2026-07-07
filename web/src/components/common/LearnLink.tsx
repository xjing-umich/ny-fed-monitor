import Link from "next/link";
import type { Lang } from "@/lib/nav";
import { localePath } from "@/lib/urls";

/**
 * 语境化延伸阅读链接。把当前区块接到解释它的常青 /learn 文章。
 * 纯展示 RSC——无逻辑无数据依赖；URL 走 localePath(单一真相源)。
 * 刻意做轻:一行 mono 链接,不是面板,不与 DiscoveryHandoff 主 CTA 争戏。
 */
export function LearnLink({ lang, slug, label }: { lang: Lang; slug: string; label: string }) {
  return (
    <Link
      href={localePath(lang, `/learn/${slug}`)}
      className="group mt-3 inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--tt-muted)] no-underline transition-colors hover:text-[var(--tt-accent)]"
    >
      {label}
      <span aria-hidden className="transition-colors group-hover:text-[var(--tt-accent)]">→</span>
    </Link>
  );
}
