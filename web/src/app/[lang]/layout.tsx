import { redirect } from "next/navigation";
import type { Metadata, Viewport } from "next";
import { Fraunces } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "../globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { getManagerIndex } from "@/lib/managers/source";
import { MACRO_GROUPS } from "@/lib/nav";
import AppShell from "@/components/shell/AppShell";
import type { Lang } from "@/lib/nav";

// Characterful display serif for the wordmark and editorial headlines.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-display",
});

// This is the app's root layout, nested under the [lang] dynamic segment so
// that <html lang> can be localized per locale. Site-wide SEO defaults live
// here; individual pages override title/description/canonical via their own
// generateMetadata (their titles already carry the brand suffix, so no
// title template is used here to avoid double-branding).
//
// SEO is English-first: English is the default locale (root redirects to /en,
// default metadata is English, English ranks higher in the sitemap). Chinese
// (/zh) stays fully indexed as the secondary locale — both are crawlable and
// paired via hreflang on each page.
const TITLE = "Compounder — Smart-money holdings × valuation × macro";
const DESCRIPTION =
  "Track top investors' SEC 13F holdings, cross-fund consensus, and single-stock valuation against the macro funding backdrop. Sources: SEC EDGAR / NY Fed.";

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
    keywords: [
      "13F",
      "13F filings",
      "superinvestors",
      "smart money holdings",
      "institutional holdings",
      "value investing",
      "stock valuation",
      "intrinsic value",
      "Warren Buffett portfolio",
      "macro liquidity",
      "repo market",
      "SEC EDGAR",
      "NY Fed",
      "Compounder",
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
      title: TITLE,
      description: DESCRIPTION,
      url: isEn ? "https://thecompounder.fyi/en" : "https://thecompounder.fyi/zh",
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

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF8F3" },
    { media: "(prefers-color-scheme: dark)", color: "#16130F" },
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
  if (rawLang !== "zh" && rawLang !== "en") {
    redirect("/en");
  }
  const lang = rawLang as Lang;
  const htmlLang = lang === "zh" ? "zh-CN" : "en";

  // Build search items: managers + macro indicators
  const managerIdx = await getManagerIndex();
  const managerItems = managerIdx.managers.map((m) => ({
    label: m.person,
    href: `/${lang}/investors/${m.slug}`,
  }));

  const macroItems = MACRO_GROUPS.flatMap((group) =>
    group.indicators.map((indicator) => ({
      label: indicator,
      href: `/${lang}/macro/${indicator}`,
    }))
  );

  const items = [...managerItems, ...macroItems];

  return (
    <html
      lang={htmlLang}
      suppressHydrationWarning
      className={`${fraunces.variable} ${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full" style={{ background: "var(--tt-bg)", color: "var(--tt-text)" }}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem={false}
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
