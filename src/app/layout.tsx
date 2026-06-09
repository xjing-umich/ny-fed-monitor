import "./globals.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "Compounder / Treasury Market Monitor",
  description: "SEC fundamentals data layer"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
