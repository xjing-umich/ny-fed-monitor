import { notFound } from "next/navigation";
import { getManagerIndex, getManagerDetail } from "@/lib/managers/source";
import type { HoldingChange } from "@/lib/managers/types";

type Lang = "zh" | "en";

function formatUSD(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}

export async function generateStaticParams() {
  const idx = await getManagerIndex();
  const langs = ["zh", "en"] as const;
  return langs.flatMap((lang) =>
    idx.managers.map((m) => ({ lang, cik: m.cik }))
  );
}

export default async function ManagerDetailPage({
  params,
}: {
  params: Promise<{ lang: string; cik: string }>;
}) {
  const { lang: rawLang, cik } = await params;
  if (rawLang !== "zh" && rawLang !== "en") notFound();
  const lang = rawLang as Lang;

  const d = await getManagerDetail(cik);
  if (!d) notFound();

  const { manager, latest, prior, changes } = d;

  // Sort latest holdings by value desc
  const holdingsSorted = [...latest.holdings].sort((a, b) => b.value - a.value);
  const top10 = holdingsSorted.slice(0, 10);
  const maxWeight = top10.reduce((acc, h) => Math.max(acc, h.weight ?? 0), 0) || 1;

  // Group changes
  const newPos = changes.filter((c) => c.kind === "new");
  const exited = changes.filter((c) => c.kind === "exited");
  const increased = changes.filter((c) => c.kind === "increased");
  const decreased = changes.filter((c) => c.kind === "decreased");
  const hasChanges = changes.length > 0 && prior;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Header */}
      <div>
        <h1
          style={{
            fontSize: 22,
            fontWeight: 700,
            color: "var(--tt-text)",
            margin: 0,
            lineHeight: 1.2,
          }}
        >
          {manager.person}
        </h1>
        <div style={{ fontSize: 13, color: "var(--tt-muted)", marginTop: 2 }}>
          {manager.name}
        </div>
        <div
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 11,
            color: "var(--tt-faint)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            margin: "8px 0 0",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {lang === "zh" ? "报告期" : "PERIOD"} {latest.period} ·{" "}
          {lang === "zh" ? "申报日" : "FILED"} {latest.filedAt} ·{" "}
          {lang === "zh" ? "持仓数" : "HOLDINGS"} {latest.holdings.length} ·{" "}
          {lang === "zh" ? "总市值" : "VALUE"} {formatUSD(latest.totalValue)}
        </div>
      </div>

      {/* Top 10 holdings */}
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
          {lang === "zh" ? "前十大持仓" : "Top 10 Holdings"}
        </div>
        <div
          style={{
            background: "var(--tt-panel)",
            border: "1px solid var(--tt-border)",
            borderRadius: 6,
            overflow: "hidden",
          }}
        >
          {top10.map((h, i) => {
            const weightPct = h.weight ?? 0;
            const barWidth = maxWeight > 0 ? (weightPct / maxWeight) * 100 : 0;
            return (
              <div
                key={h.cusip}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 80px 90px",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderBottom:
                    i < top10.length - 1 ? "1px solid var(--tt-border)" : "none",
                  background:
                    i % 2 === 0
                      ? "transparent"
                      : "color-mix(in srgb, var(--tt-panel-2) 50%, transparent)",
                }}
              >
                {/* Issuer + weight bar */}
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--tt-text)",
                      fontWeight: 500,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      marginBottom: 4,
                    }}
                  >
                    {h.issuer}
                  </div>
                  {/* Weight bar */}
                  <div
                    style={{
                      height: 3,
                      background: "var(--tt-panel-2)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${barWidth}%`,
                        background: "var(--tt-accent)",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
                {/* Weight % */}
                <div
                  style={{
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 12,
                    color: "var(--tt-muted)",
                    textAlign: "right",
                  }}
                >
                  {(weightPct * 100).toFixed(2)}%
                </div>
                {/* Value */}
                <div
                  style={{
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 12,
                    color: "var(--tt-text)",
                    fontWeight: 600,
                    textAlign: "right",
                  }}
                >
                  {formatUSD(h.value)}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quarter-over-quarter changes */}
      {hasChanges && (
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
            {lang === "zh" ? "环比变动" : "Quarter-over-Quarter Changes"}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {/* New */}
            <ChangeGroup
              label={lang === "zh" ? `新增 (${newPos.length})` : `New (${newPos.length})`}
              headerColor="var(--tt-positive)"
              items={newPos.slice(0, 8)}
              kind="new"
              lang={lang}
            />
            {/* Exited */}
            <ChangeGroup
              label={lang === "zh" ? `清仓 (${exited.length})` : `Exited (${exited.length})`}
              headerColor="var(--tt-negative)"
              items={exited.slice(0, 8)}
              kind="exited"
              lang={lang}
            />
            {/* Increased */}
            <ChangeGroup
              label={lang === "zh" ? `加仓 (${increased.length})` : `Increased (${increased.length})`}
              headerColor="var(--tt-accent)"
              items={increased.slice(0, 8)}
              kind="increased"
              lang={lang}
            />
            {/* Decreased */}
            <ChangeGroup
              label={lang === "zh" ? `减仓 (${decreased.length})` : `Decreased (${decreased.length})`}
              headerColor="var(--tt-warn)"
              items={decreased.slice(0, 8)}
              kind="decreased"
              lang={lang}
            />
          </div>
        </div>
      )}

      {/* Full holdings table (collapsible) */}
      <div>
        <details>
          <summary
            style={{
              cursor: "pointer",
              fontSize: 11,
              fontWeight: 500,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "var(--tt-accent)",
              padding: "4px 0",
              userSelect: "none",
              marginBottom: 8,
            }}
          >
            {lang === "zh"
              ? `完整持仓明细（${holdingsSorted.length} 条）`
              : `Full Holdings (${holdingsSorted.length} positions)`}
          </summary>

          <div
            style={{
              overflowX: "auto",
              border: "1px solid var(--tt-border)",
              borderRadius: 6,
            }}
          >
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ background: "var(--tt-panel-2)" }}>
                  {[
                    lang === "zh" ? "发行人" : "Issuer",
                    lang === "zh" ? "类别" : "Class",
                    "CUSIP",
                    lang === "zh" ? "市值" : "Value",
                    lang === "zh" ? "股数" : "Shares",
                    lang === "zh" ? "占比" : "Weight",
                  ].map((h) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 10px",
                        textAlign: "left",
                        fontSize: 10,
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        color: "var(--tt-faint)",
                        borderBottom: "1px solid var(--tt-border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {holdingsSorted.map((h, i) => (
                  <tr
                    key={h.cusip}
                    style={{
                      background:
                        i % 2 === 0
                          ? "transparent"
                          : "color-mix(in srgb, var(--tt-panel-2) 50%, transparent)",
                    }}
                  >
                    <td
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--tt-text)",
                        borderBottom: "1px solid var(--tt-border)",
                        maxWidth: 200,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.issuer}
                    </td>
                    <td
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--tt-muted)",
                        borderBottom: "1px solid var(--tt-border)",
                        whiteSpace: "nowrap",
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                      }}
                    >
                      {h.titleOfClass ?? "—"}
                    </td>
                    <td
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--tt-muted)",
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid var(--tt-border)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {h.cusip}
                    </td>
                    <td
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--tt-text)",
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid var(--tt-border)",
                        whiteSpace: "nowrap",
                        textAlign: "right",
                      }}
                    >
                      {formatUSD(h.value)}
                    </td>
                    <td
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--tt-text)",
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid var(--tt-border)",
                        whiteSpace: "nowrap",
                        textAlign: "right",
                      }}
                    >
                      {h.shares.toLocaleString()}
                    </td>
                    <td
                      style={{
                        padding: "5px 10px",
                        fontSize: 12,
                        color: "var(--tt-muted)",
                        fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                        fontVariantNumeric: "tabular-nums",
                        borderBottom: "1px solid var(--tt-border)",
                        whiteSpace: "nowrap",
                        textAlign: "right",
                      }}
                    >
                      {h.weight != null ? `${(h.weight * 100).toFixed(2)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </div>
    </div>
  );
}

function ChangeGroup({
  label,
  headerColor,
  items,
  kind,
  lang,
}: {
  label: string;
  headerColor: string;
  items: HoldingChange[];
  kind: HoldingChange["kind"];
  lang: Lang;
}) {
  return (
    <div
      style={{
        background: "var(--tt-panel)",
        border: "1px solid var(--tt-border)",
        borderRadius: 6,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "8px 12px",
          fontSize: 11,
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          color: headerColor,
          borderBottom: "1px solid var(--tt-border)",
        }}
      >
        {label}
      </div>
      <div style={{ padding: "6px 0" }}>
        {items.length === 0 ? (
          <div
            style={{
              padding: "6px 12px",
              fontSize: 12,
              color: "var(--tt-faint)",
            }}
          >
            —
          </div>
        ) : (
          items.map((c) => (
            <div
              key={c.cusip}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 8,
                padding: "4px 12px",
              }}
            >
              <span
                style={{
                  fontSize: 12,
                  color: "var(--tt-text)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                }}
              >
                {c.issuer}
              </span>
              {(kind === "increased" || kind === "decreased") &&
                c.deltaPct != null ? (
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 11,
                    color:
                      kind === "increased"
                        ? "var(--tt-positive)"
                        : "var(--tt-negative)",
                    flexShrink: 0,
                  }}
                >
                  {kind === "increased" ? "+" : ""}
                  {(c.deltaPct * 100).toFixed(1)}%
                </span>
              ) : (
                <span
                  style={{
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontVariantNumeric: "tabular-nums",
                    fontSize: 11,
                    color: "var(--tt-muted)",
                    flexShrink: 0,
                  }}
                >
                  {formatUSD(c.value)}
                </span>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
