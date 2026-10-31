import type { MouseEvent } from "react";

// 切换语言时带上当前的 ?view= / ?q= / ?sort= 和 #锚点,停在同一视图。
// 不在外壳里用 useSearchParams(会让全站静态页退成客户端渲染),改在点击时从 location 读。
// href 仍提供无 JS 的目标路径；操作时为原生新标签页补齐当前参数。
export function switchLangKeepingQuery(
  e: MouseEvent<HTMLAnchorElement>,
  href: string,
  push: (href: string) => void,
): void {
  if (e.defaultPrevented) return;
  const { search, hash } = window.location;
  if (e.currentTarget) e.currentTarget.href = href + search + hash;
  if (!search && !hash) return;
  if (e.type === "contextmenu") return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
    return;
  e.preventDefault();
  push(href + search + hash);
}
