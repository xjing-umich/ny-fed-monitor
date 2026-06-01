import { notFound } from "next/navigation";
import Link from "next/link";
import { getManagerIndex } from "@/lib/managers/source";
import type { ManagerSummary } from "@/lib/managers/types";

type Lang = "zh" | "en";

function formatUSD(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

function ManagerCard({
  manager,
  lang,
}: {
  manager: ManagerSummary;
  lang: Lang;
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
        padding: "14px 16px",
        textDecoration: "none",
        transition: "border-color 0.15s",
      }}
      className="manager-card"
    >
      <div
        style={{
          fontSize: 15,
          fontWeight: 600,
          color: "var(--tt-text)",
          marginBottom: 2,
        }}
      >
        {manager.person}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--tt-muted)",
          marginBottom: 12,
        }}
      >
        {manager.name}
      </div>

      {/* Stats row */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
          fontVariantNumeric: "tabular-nums",
          fontSize: 12,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--tt-muted)" }}>
            {lang === "zh" ? "组合市值" : "Portfolio"}
          </span>
          <span style={{ color: "var(--tt-accent)", fontWeight: 600 }}>
            {formatUSD(manager.totalValue)}
          </span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--tt-muted)" }}>
            {lang === "zh" ? "持仓数" : "Holdings"}
          </span>
          <span style={{ color: "var(--tt-text)" }}>{manager.holdingCount}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span style={{ color: "var(--tt-muted)" }}>
            {lang === "zh" ? "报告期" : "Period"}
          </span>
          <span style={{ color: "var(--tt-text)" }}>{manager.period}</span>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 8,
            paddingTop: 4,
            borderTop: "1px solid var(--tt-border)",
            marginTop: 2,
          }}
        >
          <span style={{ color: "var(--tt-muted)" }}>
            {lang === "zh" ? "第一大" : "Top"}
          </span>
          <span
            style={{
              color: "var(--tt-text)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 140,
            }}
          >
            {manager.topHolding}
          </span>
        </div>
      </div>
    </Link>
  );
}

export default async function ManagersPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang: rawLang } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const idx = await getManagerIndex();
  const managers = [...idx.managers].sort((a, b) => b.totalValue - a.totalValue);

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
          {lang === "zh" ? "13F 机构持仓" : "13F Holdings"}
        </h1>
        <p
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "var(--tt-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "6px 0 0",
          }}
        >
          {managers.length} MANAGERS · 数据来源 SEC EDGAR
        </p>
      </div>

      {/* Manager grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 12,
        }}
      >
        {managers.map((m) => (
          <ManagerCard key={m.cik} manager={m} lang={lang} />
        ))}
      </div>

      <style>{`
        .manager-card:hover {
          border-color: var(--tt-accent) !important;
        }
      `}</style>
    </div>
  );
}
