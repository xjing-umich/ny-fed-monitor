// scripts/check-contrast.ts — WCAG AA 校验三级墨色 vs 背景
const lum = (hex: string) => {
  const c = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(c.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a: string, b: string) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
const bg = "#0E1411";
for (const [name, hex] of [["ink-1", "#EDE7DA"], ["ink-2", "#A89C8A"], ["ink-3", "#6E6656"]] as const) {
  const r = ratio(hex, bg);
  const pass = name === "ink-3" ? r >= 3 : r >= 4.5; // ink-3 仅大字号/辅助图形
  console.log(`${name}: ${r.toFixed(2)}:1 ${pass ? "PASS" : "FAIL"}`);
  if (!pass) process.exitCode = 1;
}
