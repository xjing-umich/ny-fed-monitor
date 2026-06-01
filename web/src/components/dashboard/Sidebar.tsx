"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { Section } from "@/lib/types";
import type { ManagerSummary } from "@/lib/managers/types";

type Lang = "zh" | "en";

// The 9 live section groups for the new nav
const NAV_GROUPS: {
  key: string;
  en: string;
  zh: string;
  items: { key: string; en: string; zh: string }[];
}[] = [
  {
    key: "market",
    en: "Market Structure",
    zh: "市场结构",
    items: [
      { key: "dealer-inventory", en: "Dealer Inventory", zh: "交易商库存" },
      { key: "transactions", en: "Transactions", zh: "成交与流动性" },
      { key: "market-share", en: "Market Share", zh: "交易商集中度" },
    ],
  },
  {
    key: "funding",
    en: "Funding",
    zh: "资金市场",
    items: [
      { key: "repo-financing", en: "Repo Financing", zh: "回购融资" },
      { key: "reference-rates", en: "Reference Rates", zh: "短端利率" },
      { key: "facility-usage", en: "ON RRP / SRP", zh: "资金工具" },
      { key: "fails", en: "Fails / Specialness", zh: "结算失败" },
    ],
  },
  {
    key: "supply",
    en: "Supply & Balance Sheet",
    zh: "供给与资产负债表",
    items: [
      { key: "auction-risk", en: "Auction Risk", zh: "拍卖风险" },
      { key: "soma", en: "SOMA", zh: "美联储持仓" },
    ],
  },
  {
    key: "policy",
    en: "Policy",
    zh: "政策",
    items: [
      { key: "policy-expectations", en: "Policy Expectations", zh: "政策预期" },
    ],
  },
  {
    key: "system",
    en: "System",
    zh: "系统",
    items: [
      { key: "data-freshness", en: "Data Freshness", zh: "数据新鲜度" },
    ],
  },
];

function freshnessColor(status: string | undefined, mode: string | undefined): string {
  const s = status ?? mode ?? "";
  if (s === "Fresh" || s === "manual-live" || s === "live") return "var(--tt-positive)";
  if (s === "Stale") return "var(--tt-warn)";
  if (
    s === "Missing" ||
    s === "Unavailable" ||
    s === "unavailable" ||
    s === "manual-missing"
  )
    return "var(--tt-negative)";
  return "var(--tt-faint)";
}

export default function Sidebar({
  lang,
  sections,
  managers = [],
}: {
  lang: Lang;
  sections: Record<string, Section>;
  managers?: ManagerSummary[];
}) {
  const pathname = usePathname();
  const overviewPath = `/${lang}`;
  const isOverviewActive =
    pathname === overviewPath || pathname === `/${lang}/`;

  return (
    <aside
      style={{
        width: 240,
        minWidth: 240,
        maxWidth: 240,
        height: "100vh",
        position: "fixed",
        top: 0,
        left: 0,
        background: "var(--tt-panel)",
        borderRight: "1px solid var(--tt-border)",
        display: "flex",
        flexDirection: "column",
        overflowY: "auto",
        zIndex: 40,
      }}
    >
      {/* Product mark */}
      <div
        style={{
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--tt-border)",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
            fontSize: 10,
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            color: "var(--tt-faint)",
            lineHeight: 1.2,
          }}
        >
          {lang === "zh" ? "市场结构 · 机构持仓" : "TREASURY · 13F HOLDINGS"}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: "var(--tt-text)",
            lineHeight: 1.3,
            marginTop: 2,
          }}
        >
          {lang === "zh" ? "机构动向监控" : "Smart Money Monitor"}
        </div>
      </div>

      {/* Nav */}
      <nav style={{ padding: "8px 8px 16px", flex: 1 }}>
        {/* Overview link — standalone, no domain header */}
        <Link
          href={overviewPath}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 8px",
            borderRadius: 6,
            fontSize: 13,
            fontWeight: isOverviewActive ? 600 : 400,
            color: isOverviewActive ? "var(--tt-accent)" : "var(--tt-text)",
            background: isOverviewActive
              ? "color-mix(in srgb, var(--tt-accent) 10%, transparent)"
              : "transparent",
            borderLeft: isOverviewActive
              ? "2px solid var(--tt-accent)"
              : "2px solid transparent",
            textDecoration: "none",
            marginBottom: 10,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              background: isOverviewActive ? "var(--tt-accent)" : "var(--tt-faint)",
              flexShrink: 0,
            }}
          />
          {lang === "zh" ? "总览" : "Overview"}
        </Link>

        {/* ── DOMAIN: 13F HOLDINGS ─────────────────── */}
        {managers.length > 0 && (
          <div style={{ marginBottom: 4 }}>
            {/* Domain header */}
            <div
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.10em",
                color: "var(--tt-muted)",
                padding: "6px 8px 4px",
                marginBottom: 4,
                borderTop: "1px solid var(--tt-border)",
              }}
            >
              {lang === "zh" ? "机构持仓" : "13F HOLDINGS"}
            </div>

            {/* All Managers link */}
            {(() => {
              const managersPath = `/${lang}/managers`;
              const isActive = pathname === managersPath || pathname === `${managersPath}/`;
              return (
                <Link
                  href={managersPath}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "var(--tt-accent)" : "var(--tt-text)",
                    background: isActive
                      ? "color-mix(in srgb, var(--tt-accent) 10%, transparent)"
                      : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--tt-accent)"
                      : "2px solid transparent",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isActive ? "var(--tt-accent)" : "var(--tt-faint)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {lang === "zh" ? "经理人列表" : "All Managers"}
                  </span>
                </Link>
              );
            })()}

            {/* Individual manager links */}
            {managers.map((m) => {
              const managerPath = `/${lang}/managers/${m.cik}`;
              const isActive = pathname === managerPath;
              return (
                <Link
                  key={m.cik}
                  href={managerPath}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    borderRadius: 6,
                    fontSize: 13,
                    fontWeight: isActive ? 500 : 400,
                    color: isActive ? "var(--tt-accent)" : "var(--tt-text)",
                    background: isActive
                      ? "color-mix(in srgb, var(--tt-accent) 10%, transparent)"
                      : "transparent",
                    borderLeft: isActive
                      ? "2px solid var(--tt-accent)"
                      : "2px solid transparent",
                    textDecoration: "none",
                  }}
                >
                  <span
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: isActive ? "var(--tt-accent)" : "var(--tt-faint)",
                      flexShrink: 0,
                    }}
                  />
                  <span
                    style={{
                      flex: 1,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.person}
                  </span>
                </Link>
              );
            })}
          </div>
        )}

        {/* ── DOMAIN: TREASURY ─────────────────────── */}
        <div>
          {/* Domain header */}
          <div
            style={{
              fontSize: 11,
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: "var(--tt-muted)",
              padding: "6px 8px 4px",
              marginBottom: 4,
              borderTop: "1px solid var(--tt-border)",
            }}
          >
            {lang === "zh" ? "美债市场" : "TREASURY"}
          </div>

          {/* Sub-groups (market structure, funding, supply) */}
          {NAV_GROUPS.map((group) => (
            <div key={group.key} style={{ marginBottom: 12 }}>
              {/* Sub-group heading — same style as before */}
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 500,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--tt-faint)",
                  padding: "0 8px",
                  marginBottom: 4,
                }}
              >
                {lang === "zh" ? group.zh : group.en}
              </div>

              {/* Items */}
              {group.items.map((item) => {
                const section = sections[item.key];
                const itemPath = `/${lang}/${item.key}`;
                const isActive = pathname === itemPath;
                const dotColor = freshnessColor(
                  section?.freshness_status,
                  section?.mode
                );
                const label = lang === "zh" ? item.zh : item.en;

                return (
                  <Link
                    key={item.key}
                    href={itemPath}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 8px",
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: isActive ? 500 : 400,
                      color: isActive ? "var(--tt-accent)" : "var(--tt-text)",
                      background: isActive
                        ? "color-mix(in srgb, var(--tt-accent) 10%, transparent)"
                        : "transparent",
                      borderLeft: isActive
                        ? "2px solid var(--tt-accent)"
                        : "2px solid transparent",
                      textDecoration: "none",
                    }}
                  >
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: "50%",
                        background: isActive ? "var(--tt-accent)" : dotColor,
                        flexShrink: 0,
                      }}
                    />
                    <span
                      style={{
                        flex: 1,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {label}
                    </span>
                  </Link>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
    </aside>
  );
}
