import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { Saira } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_COLOR } from "@/lib/themeColor";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getManagerIndex } from "@/lib/managers/source";
import { mostHeld } from "@/lib/aggregations";
import { cleanIssuer } from "@/lib/format";
import { INVESTOR_ALIASES } from "@/lib/investorAliases";
import AppShell from "@/components/shell/AppShell";
import type { Lang } from "@/lib/nav";
import { investorPath, stockPath, HTML_LANG } from "@/lib/urls";
import { managerLabel } from "@/lib/managers/displayName";
import { stockDisplayName, stockZhName } from "@/lib/stocks/zhNames";

// Engineered industrial sans for the wordmark and headlines: straight-sided
// "spec-sheet nameplate" geometry that pairs cleanly with PingFang/system CJK
// (a serif slab clashed with it). Latin subset only — zh headlines fall through
// the system CJK stack. 600 trimmed: every font-display consumer uses font-medium.
const saira = Saira({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  display: "swap",
  variable: "--font-display",
});

// This is the app's root layout, nested under the [lang] dynamic segment so
// that <html lang> can be localized per locale. Site-wide SEO defaults live
// here; individual pages override title/description/canonical via their own
// generateMetadata (their titles already carry the brand suffix, so no
// title template is used here to avoid double-branding).
//
// SEO is English-first: English is the default locale, served bare at "/"
// (next.config.ts rewrites "/" and other unprefixed paths to the "/en" segment
// internally — there is no root redirect), and default metadata is English.
// Chinese (/zh) stays fully indexed as
// the secondary locale — both are crawlable and paired via hreflang on each page.
const TITLE = "Compounder — Smart-money holdings × valuation";
const DESCRIPTION =
  "Track top investors' SEC 13F holdings, cross-fund consensus, and single-stock valuation. Source: SEC EDGAR.";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  const isEn = lang === "en";

  return {
    metadataBase: new URL("https://thecompounder.fyi"),
    title: TITLE,
    description: DESCRIPTION,
    applicationName: "Compounder",
    // Google 不读 keywords,百度仍参考;中文页给中文词。
    keywords: isEn
      ? [
          "13F",
          "13F filings",
          "superinvestors",
          "institutional holdings",
          "value investing",
          "stock valuation",
          "intrinsic value",
          "Warren Buffett portfolio",
          "SEC EDGAR",
          "Compounder",
        ]
      : ["13F", "13F 持仓", "超级投资者", "巴菲特持仓", "机构持仓", "价值投资", "内在价值", "个股估值", "SEC", "Compounder", "复利"],
    authors: [{ name: "Compounder" }],
    creator: "Compounder",
    publisher: "Compounder",
    robots: {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
    openGraph: {
      type: "website",
      siteName: "Compounder",
      title: TITLE,
      description: DESCRIPTION,
      url: isEn ? "https://thecompounder.fyi" : "https://thecompounder.fyi/zh",
      locale: isEn ? "en_US" : "zh_CN",
      alternateLocale: isEn ? ["zh_CN"] : ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title: TITLE,
      description: DESCRIPTION,
    },
  };
}

// 首屏按系统配色;用户站内切换后由 ThemeColorSync(theme-provider)改写。
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
  ],
};

export function generateStaticParams() {
  return [{ lang: "zh" }, { lang: "en" }];
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  // 裸路径都被 next.config 的 BARE_PATH 改写到 /en,能落到这里的非法 lang 只有被排除的路径
  // (/api/*、/_next、带文件扩展名的静态路径)。它们没找到就该是 404,而不是 307 到首页
  // —— 否则调错接口的客户端和缺失的静态资源都会被软重定向成一张 HTML 首页。
  if (rawLang !== "zh" && rawLang !== "en") {
    notFound();
  }
  const lang = rawLang as Lang;
  const htmlLang = HTML_LANG[lang];

  // Build search items: investors (+中文别名) + stocks (ticker).
  // 两个轻量读取并行;mostHeld 提供热门个股下拉建议(任意 ticker 仍可经搜索框回车直达)。
  const [managerIdx, held] = await Promise.all([getManagerIndex(), mostHeld(250)]);

  const managerItems = managerIdx.managers.map((m) => ({
    label: managerLabel(lang, m.slug, m.person),
    href: investorPath(lang, m.slug),
    // 展示名换成中文后,英文原名留在关键词里,搜 Buffett 仍能命中。
    keywords: [INVESTOR_ALIASES[m.slug], m.person].filter(Boolean).join(" "),
  }));

  // 个股建议:按持有人数排序的共识标的(cusip 字段已解析为 ticker)。以 ticker 去重。
  const seenTickers = new Set<string>();
  const stockItems = held.flatMap((row) => {
    const ticker = row.cusip;
    if (seenTickers.has(ticker)) return [];
    seenTickers.add(ticker);
    return [{
      label: stockDisplayName(lang, ticker, cleanIssuer(row.issuer)),
      href: stockPath(lang, ticker),
      // 中文名也进关键词,英文站搜"苹果"同样能命中。
      keywords: [ticker, stockZhName(ticker)].filter(Boolean).join(" "),
    }];
  });

  const items = [...managerItems, ...stockItems];

  return (
    <html
      lang={htmlLang}
      suppressHydrationWarning
      className={`${saira.variable} ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={{ background: "var(--tt-bg)", color: "var(--tt-text)" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell lang={lang} items={items}>
            {children}
          </AppShell>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
