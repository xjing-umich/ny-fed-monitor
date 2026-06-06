/**
 * TEMPORARY design-preview page (Task 1).
 *
 * Lets the product owner approve the unified light/approachable visual language
 * before it is rolled out across the product. Self-contained, no data deps.
 * Will be removed in a later cleanup task (Task 8).
 *
 * View at /zh/design-preview and /en/design-preview.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Lang = "zh" | "en";

const COPY = {
  zh: {
    product: "聪明钱观察",
    tagline: "看清聪明钱在买什么、它值不值、大环境如何",
    sub: "面向普通投资者的清晰、可信、易读的金融信息站。",
    cta: "开始浏览",
    ctaSecondary: "了解方法",
    entityWhat: "伯克希尔·哈撒韦 — 沃伦·巴菲特执掌的控股公司，其美股持仓通过 13F 披露。",
    verdict: "加仓",
    facts: [
      { label: "组合市值", value: "$313.4B" },
      { label: "持仓数", value: "38" },
      { label: "最新报告期", value: "2025 Q1" },
      { label: "前十占比", value: "84.6%" },
    ],
    holdingsTitle: "主要持仓",
    cols: { issuer: "标的", value: "市值", weight: "权重" },
    swatchTitle: "调色板与组件",
    sampleEntity: "示例：投资人主体卡片",
    heroTitle: "示例：访客落地页",
  },
  en: {
    product: "Smart Money Watch",
    tagline: "See what smart money is buying, whether it's worth it, and how the macro looks",
    sub: "A clean, trustworthy, readable financial-info site for everyday investors.",
    cta: "Start exploring",
    ctaSecondary: "How it works",
    entityWhat: "Berkshire Hathaway — Warren Buffett's holding company; its US equity positions are disclosed via 13F.",
    verdict: "Accumulating",
    facts: [
      { label: "Portfolio value", value: "$313.4B" },
      { label: "Holdings", value: "38" },
      { label: "Latest period", value: "2025 Q1" },
      { label: "Top-10 weight", value: "84.6%" },
    ],
    holdingsTitle: "Top holdings",
    cols: { issuer: "Issuer", value: "Value", weight: "Weight" },
    swatchTitle: "Palette & components",
    sampleEntity: "Sample: investor entity card",
    heroTitle: "Sample: visitor landing hero",
  },
} as const;

const HOLDINGS = [
  { issuer: "Apple Inc.", value: "$66.6B", weight: "21.3%" },
  { issuer: "American Express", value: "$44.5B", weight: "14.2%" },
  { issuer: "Bank of America", value: "$31.7B", weight: "10.1%" },
];

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
      {children}
    </span>
  );
}

export default async function DesignPreviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  const lang: Lang = rawLang === "en" ? "en" : "zh";
  const t = COPY[lang];

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 px-6 py-12">
      {/* ── Landing hero sample ─────────────────────────────────────────── */}
      <section>
        <Label>{t.heroTitle}</Label>
        <Card className="mt-3">
          <CardContent className="flex flex-col items-start gap-5 px-8 py-10">
            <Badge variant="secondary">{lang === "zh" ? "公开测试版" : "Public beta"}</Badge>
            <div className="flex flex-col gap-3">
              <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
                {t.product}
              </h1>
              <p className="max-w-2xl text-lg leading-relaxed text-foreground/80">
                {t.tagline}
              </p>
              <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
                {t.sub}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button size="lg">{t.cta}</Button>
              <Button size="lg" variant="outline">
                {t.ctaSecondary}
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Sample investor entity card ─────────────────────────────────── */}
      <section>
        <Label>{t.sampleEntity}</Label>
        <Card className="mt-3">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-xl">
                {lang === "zh" ? "伯克希尔·哈撒韦" : "Berkshire Hathaway"}
              </CardTitle>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[color-mix(in_oklch,var(--positive),transparent_88%)] px-2.5 py-1 text-xs font-medium text-[var(--positive)]">
                <span className="size-1.5 rounded-full bg-[var(--positive)]" />
                {t.verdict}
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {t.entityWhat}
            </p>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            {/* Key-facts strip */}
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-4">
              {t.facts.map((f) => (
                <div key={f.label} className="flex flex-col gap-1 bg-card px-4 py-3">
                  <Label>{f.label}</Label>
                  <span className="tnum font-mono text-base font-semibold text-foreground">
                    {f.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Holdings table */}
            <div>
              <div className="mb-2">
                <Label>{t.holdingsTitle}</Label>
              </div>
              <div className="overflow-hidden rounded-lg border border-border">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/50 text-left">
                      <th className="px-4 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {t.cols.issuer}
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {t.cols.value}
                      </th>
                      <th className="px-4 py-2 text-right text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                        {t.cols.weight}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {HOLDINGS.map((h, i) => (
                      <tr
                        key={h.issuer}
                        className={i < HOLDINGS.length - 1 ? "border-b border-border" : ""}
                      >
                        <td className="px-4 py-2.5 font-medium text-foreground">{h.issuer}</td>
                        <td className="tnum px-4 py-2.5 text-right font-mono text-foreground">
                          {h.value}
                        </td>
                        <td className="tnum px-4 py-2.5 text-right font-mono text-muted-foreground">
                          {h.weight}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Color & component swatch row ────────────────────────────────── */}
      <section>
        <Label>{t.swatchTitle}</Label>
        <Card className="mt-3">
          <CardContent className="flex flex-col gap-6 py-6">
            <div className="flex flex-wrap gap-4">
              {[
                { name: "primary", color: "var(--primary)" },
                { name: "positive", color: "var(--positive)" },
                { name: "warn", color: "var(--warn)" },
                { name: "negative", color: "var(--destructive)" },
                { name: "muted", color: "var(--muted-foreground)" },
              ].map((s) => (
                <div key={s.name} className="flex flex-col items-center gap-1.5">
                  <span
                    className="size-12 rounded-lg ring-1 ring-foreground/10"
                    style={{ background: s.color }}
                  />
                  <span className="text-[11px] text-muted-foreground">{s.name}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button>Primary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="ghost">Ghost</Button>
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Negative</Badge>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
