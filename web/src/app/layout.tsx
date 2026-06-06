import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

// Characterful display serif for the wordmark and editorial headlines.
const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Compounder · 复利",
  description:
    "Compounder (复利) — an editorial read on smart-money holdings, single-stock valuation, and the macro funding backdrop.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
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
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
