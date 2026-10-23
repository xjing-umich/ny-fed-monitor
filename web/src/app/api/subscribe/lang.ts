export function normalizeLang(v: unknown): "en" | "zh" {
  return v === "zh" ? "zh" : "en";
}
