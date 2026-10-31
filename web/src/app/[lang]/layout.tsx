import { notFound } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { THEME_COLOR } from "@/lib/themeColor";
import { SiteAnalytics } from "@/components/shell/SiteAnalytics";
import { SpeedInsights } from "@vercel/speed-insights/next";
import AppShell from "@/components/shell/AppShell";
import type { Lang } from "@/lib/nav";
import { HTML_LANG } from "@/lib/urls";
import { readSearchIndex } from "@/lib/home/searchIndex";

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
  const title = isEn ? TITLE : "Compounder · 复利 — 13F 持仓与个股估值";
  const description = isEn ? DESCRIPTION : "追踪投资人的 SEC 13F 持仓、共同持有的股票与个股估值。数据来源：SEC EDGAR。";

  return {
    metadataBase: new URL("https://thecompounder.fyi"),
    title,
    description,
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
      : [
          "13F",
          "13F 持仓",
          "超级投资者",
          "巴菲特持仓",
          "机构持仓",
          "价值投资",
          "内在价值",
          "个股估值",
          "SEC",
          "Compounder",
          "复利",
        ],
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
      title,
      description,
      url: isEn ? "https://thecompounder.fyi" : "https://thecompounder.fyi/zh",
      locale: isEn ? "en_US" : "zh_CN",
      alternateLocale: isEn ? ["zh_CN"] : ["en_US"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
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

  const index = await readSearchIndex(lang);

  return (
    <html
      lang={htmlLang}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={{ background: "var(--tt-bg)", color: "var(--tt-text)" }}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <AppShell lang={lang} index={index}>
            {children}
          </AppShell>
        </ThemeProvider>
        <SiteAnalytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
