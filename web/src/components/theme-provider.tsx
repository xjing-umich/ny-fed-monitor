"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes";
import { THEME_COLOR } from "@/lib/themeColor";

/**
 * 服务端输出的两条 theme-color meta 按系统配色(media)切换;用户在站内手动切换主题后,
 * 浏览器外框应跟随站内主题而不是系统。这里把两条 meta 的 content 都改成当前主题色。
 */
function ThemeColorSync() {
  const { resolvedTheme } = useTheme();
  React.useEffect(() => {
    if (resolvedTheme !== "light" && resolvedTheme !== "dark") return;
    const color = THEME_COLOR[resolvedTheme];
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((m) => m.setAttribute("content", color));
  }, [resolvedTheme]);
  return null;
}

export function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider {...props}>
      <ThemeColorSync />
      {children}
    </NextThemesProvider>
  );
}
