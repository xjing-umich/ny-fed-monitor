import type { MouseEvent } from "react";

// 切换语言时带上当前的 ?view= / ?q= / ?sort= 和 #锚点,停在同一视图。
// 不在外壳里用 useSearchParams(会让全站静态页退成客户端渲染),改在点击时从 location 读。
// href 仍是不带参数的目标路径,无 JS 和爬虫照样能用;带修饰键的点击(新标签页)交给浏览器。
export function switchLangKeepingQuery(
  e: MouseEvent<HTMLAnchorElement>,
  href: string,
  push: (href: string) => void,
): void {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const { search, hash } = window.location;
  if (!search && !hash) return;
  e.preventDefault();
  push(href + search + hash);
}
