// 浏览器外框 / 状态栏颜色(<meta name="theme-color">),与 globals.css v2 的 --canvas 一致:
// 浅 oklch(0.985 0.004 165) / 深 oklch(0.175 0.010 165)。这里用 hex,因为浏览器外框
// 对 oklch 的支持没有保障。layout 的 viewport 与 ThemeColorSync 共用这一份。
export const THEME_COLOR = {
  light: "#f8fbf9",
  dark: "#0c120f",
} as const;
