import { redirect } from "next/navigation";
import Link from "next/link";
import { buildAllSections } from "@/lib/build";
import AIMarketCommentary from "@/components/dashboard/AIMarketCommentary";
import { badgeTone, buildWatchList, sectionLabel, metricLabel } from "@/lib/dashboard";
import { getManagerIndex } from "@/lib/managers/source";
import type { Section } from "@/lib/types";
import type { ManagerSummary } from "@/lib/managers/types";

export const dynamic = "force-dynamic";

type Lang = "zh" | "en";

// The 6 signal cards — section key, display labels, and the key_metric label
// whose value is the section's headline RISK signal (so the card shows e.g.
// "Extreme" rather than a raw dollar level). `signalMetric` undefined → first metric.
const SIGNAL_CARDS: { sectionKey: string; en: string; zh: string; signalMetric?: string }[] = [
  { sectionKey: "dealer-inventory",  en: "Dealer Inventory",  zh: "交易商库存", signalMetric: "Pressure Label" },
  { sectionKey: "repo-financing",    en: "Repo Financing",    zh: "回购融资",   signalMetric: "Usage Label" },
  { sectionKey: "reference-rates",   en: "Reference Rates",   zh: "短端利率",   signalMetric: "Funding Rate Stress" },
  { sectionKey: "fails",             en: "Fails / Liquidity", zh: "结算失败",   signalMetric: "Fails Direction" },
  { sectionKey: "auction-risk",      en: "Auction Risk",      zh: "拍卖风险",   signalMetric: "Auction Risk" },
  { sectionKey: "soma",              en: "SOMA",              zh: "美联储持仓" },
];

// Clean single-language Chinese for the common risk labels (no bilingual stacking).
const RISK_ZH: Record<string, string> = {
  Extreme: "极端", High: "高", "Elevated / High usage": "偏高", Elevated: "偏高",
  Normal: "正常", Watch: "观察", "Watch / Mild": "观察", "Watch / Mixed": "观察 / 混合",
  Medium: "中", Low: "低", rising: "上升", "stable / falling": "平稳 / 回落",
  Moderate: "中等", "Limited sample": "样本有限", Unavailable: "不可用",
};

function displayRisk(lang: Lang, raw: string): string {
  if (lang === "zh") return RISK_ZH[raw] ?? raw;
  return raw;
}

// Tone → CSS color token mapping
const TONE_COLOR: Record<string, string> = {
  red:    "var(--tt-negative)",
  orange: "var(--tt-warn)",
  yellow: "var(--tt-warn)",
  green:  "var(--tt-positive)",
  gray:   "var(--tt-faint)",
};

function deriveSignalValue(section: Section | undefined, signalMetric?: string): string {
  if (!section) return "Unavailable";
  // Prefer the section's headline risk label (e.g. Pressure Label → "Extreme")
  if (signalMetric) {
    const m = section.key_metrics?.find((km) => km.label === signalMetric);
    if (m?.value && !m.value.toLowerCase().includes("unavailable")) return m.value;
  }
  // Fallback: first key metric, then freshness/mode
  const first = section.key_metrics?.[0]?.value;
  if (first && !first.toLowerCase().includes("unavailable")) return first;
  if (section.freshness_status) return section.freshness_status;
  return section.mode === "unavailable" ? "Unavailable" : "N/A";
}

function deriveDetailText(lang: Lang, section: Section | undefined): string {
  if (!section) return lang === "zh" ? "数据不可用" : "Data unavailable";
  const m = section.key_metrics?.[0];
  if (m) {
    const lbl = metricLabel(lang, m) ?? m.label;
    return `${lbl}: ${m.value}${m.unit ? " " + m.unit : ""}`;
  }
  if (section.freshness_status) return section.freshness_status;
  return lang === "zh" ? "无指标数据" : "No metric data";
}

function SignalCard({
  lang,
  sectionKey,
  section,
  label,
  signalMetric,
}: {
  lang: Lang;
  sectionKey: string;
  section: Section | undefined;
  label: string;
  signalMetric?: string;
}) {
  const rawValue = deriveSignalValue(section, signalMetric);
  const value = displayRisk(lang, rawValue);
  const tone = badgeTone(rawValue);
  const dotColor = TONE_COLOR[tone] ?? TONE_COLOR.gray;
  const detail = deriveDetailText(lang, section);

  return (
    <a
      href={`/${lang}/${sectionKey}`}
      style={{
        display: "block",
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        padding: "14px 16px",
        textDecoration: "none",
        transition: "border-color 0.1s",
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--tt-muted)",
          }}
        >
          {label}
        </span>
        {/* Severity dot */}
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dotColor,
            flexShrink: 0,
          }}
        />
      </div>

      {/* Value */}
      <div
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 18,
          fontWeight: 600,
          color: dotColor,
          fontVariantNumeric: "tabular-nums",
          lineHeight: 1.2,
          marginBottom: 6,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {value}
      </div>

      {/* Detail */}
      <div
        style={{
          fontSize: 11,
          color: "var(--tt-faint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {detail}
      </div>
    </a>
  );
}

function WatchPanel({ lang, lines }: { lang: Lang; lines: string[] }) {
  return (
    <div
      style={{
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        padding: "16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 500,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: "var(--tt-faint)",
          marginBottom: 10,
        }}
      >
        {lang === "zh" ? "重点关注" : "What to Watch"}
      </div>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {lines.map((line, i) => (
          <li
            key={i}
            style={{
              display: "flex",
              gap: 8,
              paddingBottom: i < lines.length - 1 ? 8 : 0,
              marginBottom: i < lines.length - 1 ? 8 : 0,
              borderBottom: i < lines.length - 1 ? "1px solid var(--tt-border)" : "none",
            }}
          >
            <span
              style={{
                color: "var(--tt-warn)",
                fontWeight: 700,
                flexShrink: 0,
                lineHeight: 1.5,
              }}
            >
              ▸
            </span>
            <span
              style={{
                fontSize: 13,
                color: "var(--tt-text)",
                lineHeight: 1.5,
              }}
            >
              {line}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatPortfolioValue(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function ManagerMiniCard({
  lang,
  manager,
}: {
  lang: Lang;
  manager: ManagerSummary;
}) {
  const href = `/${lang}/managers/${manager.cik}`;
  return (
    <Link
      href={href}
      style={{
        display: "block",
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        padding: "12px 14px",
        textDecoration: "none",
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: "var(--tt-text)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          marginBottom: 4,
        }}
      >
        {manager.person}
      </div>
      <div
        style={{
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--tt-accent)",
          fontVariantNumeric: "tabular-nums",
          marginBottom: 4,
        }}
      >
        {formatPortfolioValue(manager.totalValue)}
      </div>
      <div
        style={{
          fontSize: 11,
          color: "var(--tt-faint)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Top: {manager.topHolding}
      </div>
    </Link>
  );
}

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") {
    redirect("/zh");
  }
  const lang = rawLang as Lang;

  const data = await buildAllSections();
  const watchLines = buildWatchList(lang);

  const managerIdx = await getManagerIndex();
  const topManagers = [...managerIdx.managers]
    .sort((a, b) => b.totalValue - a.totalValue)
    .slice(0, 6);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Title row */}
      <div>
        <h1
          style={{
            fontSize: 20,
            fontWeight: 600,
            color: "var(--tt-text)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {lang === "zh" ? "总览" : "Overview"}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "var(--tt-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: "4px 0 0",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {lang === "zh" ? "截至" : "AS OF"} {data.as_of}
        </p>
      </div>

      {/* Top Managers / 13F block */}
      {topManagers.length > 0 && (
        <div>
          <div
            style={{
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--tt-faint)",
              marginBottom: 12,
            }}
          >
            {lang === "zh" ? "顶级经理人 / 13F" : "Top Managers / 13F"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 8,
            }}
            className="signal-grid"
          >
            {topManagers.map((m) => (
              <ManagerMiniCard key={m.cik} lang={lang} manager={m} />
            ))}
          </div>
        </div>
      )}

      {/* Signal grid: 3 cols desktop, 2 cols tablet, 1 col mobile */}
      <div>
        <div
          style={{
            fontSize: 11,
            fontWeight: 500,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: "var(--tt-faint)",
            marginBottom: 12,
          }}
        >
          {lang === "zh" ? "市场信号" : "Market Signals"}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 8,
          }}
          className="signal-grid"
        >
          {SIGNAL_CARDS.map((card) => (
            <SignalCard
              key={card.sectionKey}
              lang={lang}
              sectionKey={card.sectionKey}
              section={data.sections[card.sectionKey]}
              label={lang === "zh" ? card.zh : card.en}
              signalMetric={card.signalMetric}
            />
          ))}
        </div>
      </div>

      {/* What to Watch */}
      <WatchPanel lang={lang} lines={watchLines} />

      {/* DeepSeek AI commentary */}
      <AIMarketCommentary lang={lang} />

      {/* Data coverage note */}
      <div
        style={{
          fontSize: 11,
          color: "var(--tt-faint)",
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          padding: "8px 0",
          borderTop: "1px solid var(--tt-border)",
        }}
      >
        {lang === "zh"
          ? `LIVE 模块: ${data.summary.live_sections.length} / ${data.summary.section_order.length} · 模式: ${data.summary.data_mode}`
          : `LIVE sections: ${data.summary.live_sections.length} / ${data.summary.section_order.length} · mode: ${data.summary.data_mode}`}
      </div>
    </div>
  );
}
