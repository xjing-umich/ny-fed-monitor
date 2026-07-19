import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { INVESTOR_ALIASES } from "@/lib/investor-seo-aliases";

// hide-default-locale 路由:
//  1. /zh 或 /zh/… → 放行(中文带前缀)
//  2. /en 或 /en/… → 301 去掉 /en,合并旧收录到裸 URL
//  3. 其它一切裸路径 → 内部 rewrite 到 /en + 原路径(地址栏保持裸,服务端出英文)
// 不做 Accept-Language 自动跳转:裸路径恒英文(spec §3)。
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. 中文:放行
  if (pathname === "/zh" || pathname.startsWith("/zh/")) {
    return NextResponse.next();
  }

  // 2. 旧英文前缀:301 到裸路径
  if (pathname === "/en" || pathname.startsWith("/en/")) {
    const stripped = pathname.slice(3) || "/"; // "/en" → "/", "/en/x" → "/x"
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url, 301);
  }

  // 3. 裸英文路径:内部 rewrite 到 /en(URL 不变)
  // 例外:投资人别名裸 URL 先 301 到规范 slug。本版 Next 的 config redirects 正则
  // 强制要求 zh|en 前缀段(/:lang(zh|en)/investors/<alias> 只接 /zh、/en 两种形态),
  // 裸形态只能在 proxy rewrite 之前在此接住;别名表与 next.config.ts 共享。
  const aliasMatch = pathname.match(/^\/investors\/([a-z0-9-]+)\/?$/);
  if (aliasMatch) {
    const canonical = INVESTOR_ALIASES[aliasMatch[1]];
    if (canonical) {
      const url = request.nextUrl.clone();
      url.pathname = `/investors/${canonical}`;
      return NextResponse.redirect(url, 301);
    }
  }

  const url = request.nextUrl.clone();
  url.pathname = `/en${pathname === "/" ? "" : pathname}`;
  return NextResponse.rewrite(url);
}

export const config = {
  // 排除 /api、Next 内部、以及**结尾为已知静态/元数据扩展名**的文件
  // (sitemap.xml、robots.txt、icon.png、manifest.webmanifest 等)。
  // 注意:只排除结尾扩展名,不能排除「任何含点的路径」——否则带点的 ticker
  // (如 /stocks/BRK.B、/stocks/BF.B) 会被误排除 → 裸 URL 不被 rewrite → 404。
  matcher: [
    "/((?!api|_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|json|webmanifest)$).*)",
  ],
};
