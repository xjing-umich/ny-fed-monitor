import type { NextConfig } from "next";
import path from "path";
import { INVESTOR_ALIASES } from "./src/lib/investor-seo-aliases";

// hide-default-locale 路由(原 src/proxy.ts,改为纯配置):
//  1. /zh 或 /zh/… → 直接命中 app/[lang](中文带前缀)
//  2. /en 或 /en/… → 301 去掉 /en,合并旧收录到裸 URL
//  3. 其它裸路径 → 内部 rewrite 到 /en + 原路径(地址栏保持裸,服务端出英文)
// 不做 Accept-Language 自动跳转:裸路径恒英文(spec §3)。
//
// 为什么不用 proxy:proxy 每个页面请求都会起一次函数调用(含 CDN 已缓存的页面),
// 计入 Vercel 的 Fluid Active CPU / Function Invocations;config 级 redirects/rewrites
// 在 CDN 路由层完成,不产生函数调用。
//
// 排除项:/zh、/en、/api(含动态 /api/sec/company/[ticker] —— afterFiles rewrite 先于动态路由)、
// Next/Vercel 内部路径,以及**结尾为已知静态/元数据扩展名**的文件。
// 注意:只排除结尾扩展名,不能排除「任何含点的路径」——否则带点的 ticker
// (如 /stocks/BRK.B、/stocks/BF.B) 不被 rewrite → 404。
const BARE_PATH =
  "/:path((?!(?:zh|en|api|_next|_vercel)(?:/|$))(?!.*\\.(?:png|jpg|jpeg|gif|svg|ico|webp|avif|txt|xml|json|webmanifest)$).+)";

// screener 视图/排序:公开 URL 保持 ?view=…&sort=…,内部改写到可 ISR 缓存的 /stocks/screener/[variant]
// (见 src/app/[lang]/stocks/screener/_screenerPage.tsx)。直接写最终目标。
// 必须放 beforeFiles:/zh/stocks/screener 本身是预渲染静态文件,在 Vercel 上会在 afterFiles 之前
// 被文件系统直接命中,afterFiles 里的 query rewrite 永远轮不到(本地 next start 不复现)。
function screenerRewrites(source: string, dest: string) {
  return [
    {
      source,
      has: [
        { type: "query" as const, key: "view", value: "(?<view>all|strike_zone|below)" },
        { type: "query" as const, key: "sort", value: "holders" },
      ],
      destination: `${dest}/:view-holders`,
    },
    {
      source,
      has: [{ type: "query" as const, key: "view", value: "(?<view>strike_zone|below|conviction)" }],
      destination: `${dest}/:view`,
    },
    {
      source,
      has: [{ type: "query" as const, key: "sort", value: "holders" }],
      destination: `${dest}/all-holders`,
    },
  ];
}

// 含非 ASCII 字符的详情页 slug(如 /zh/investors/段永平)→ 不走 ISR 的别名页(src/app/[lang]/alias/…)。
// ISR 会把解码后的动态段写进 x-next-cache-tags 响应头,非 ASCII 头值让 Node 抛 ERR_INVALID_CHAR → 500。
// 路由层看到的路径可能是百分号编码,也可能已解码,两种都匹配。
const NON_ASCII_SLUG = "([^/]*(?:%[89a-fA-F][0-9a-fA-F]|[^\\x00-\\x7F])[^/]*)";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname),
  },
  // /api 不进索引:robots.txt 只管抓取,已从外链发现的 URL 仍可能被收录,响应头上的 noindex 兜底。
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] }];
  },
  async redirects() {
    const investorAliasRedirects = Object.entries(INVESTOR_ALIASES).flatMap(([alias, slug]) => [
      {
        source: `/:lang(zh|en)/investors/${alias}`,
        destination: `/:lang/investors/${slug}`,
        permanent: true,
      },
      // 裸英文别名 URL:与原 proxy 行为一致(301)。
      {
        source: `/investors/${alias}`,
        destination: `/investors/${slug}`,
        statusCode: 301 as const,
      },
    ]);

    return [
      ...investorAliasRedirects,
      {
        source: "/:lang(zh|en)/managers",
        destination: "/:lang/investors",
        permanent: true,
      },
      {
        source: "/:lang(zh|en)/research/:ticker",
        destination: "/:lang/stocks/:ticker",
        permanent: true,
      },
      // 旧英文前缀 → 裸路径(301)。redirects 只作用于入站请求,不会拦截下面 rewrite 到 /en 的内部路径。
      { source: "/en", destination: "/", statusCode: 301 },
      { source: "/en/:path*", destination: "/:path*", statusCode: 301 },
    ];
  },
  async rewrites() {
    return {
      beforeFiles: [
        {
          source: `/:lang(zh|en)/:section(investors|stocks|learn)/:slug${NON_ASCII_SLUG}`,
          destination: "/:lang/alias/:section/:slug",
        },
        {
          source: `/:section(investors|stocks|learn)/:slug${NON_ASCII_SLUG}`,
          destination: "/en/alias/:section/:slug",
        },
        ...screenerRewrites("/zh/stocks/screener", "/zh/stocks/screener"),
        ...screenerRewrites("/stocks/screener", "/en/stocks/screener"),
      ],
      // afterFiles:先查 public/_next/static/非动态路由(sitemap.xml、robots.txt、/api/* 等),
      // 再按顺序匹配下列 rewrite,每次命中后立即检查动态路由(app/[lang]/…)。
      afterFiles: [
        { source: "/", destination: "/en" },
        { source: BARE_PATH, destination: "/en/:path" },
      ],
      fallback: [],
    };
  },
};

export default nextConfig;
