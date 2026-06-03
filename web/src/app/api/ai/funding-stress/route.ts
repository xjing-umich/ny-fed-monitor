import { NextResponse } from "next/server";
import { buildFundingStressReport, type FundingStressReport } from "@/lib/analysis/fundingStress";
import { hasSupabaseEnv } from "@/lib/managers/db";

export const dynamic = "force-dynamic";

const EMPTY_REFERENCE_RATES = {
  SOFR: null,
  EFFR: null,
  OBFR: null,
  TGCR: null,
  BGCR: null,
};

const EMPTY_FACILITY_USAGE = {
  ON_RRP_USAGE: null,
  SRP_USAGE: null,
  ON_RRP_AWARD_RATE: null,
  SRP_AWARD_RATE: null,
};

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
}

function unavailableReport(message: string): FundingStressReport {
  return {
    title: "Funding Stress Report",
    as_of: new Date().toISOString(),
    freshness_summary: {
      fresh: 0,
      stale: 0,
      failed: 0,
      partial: 0,
      empty: 0,
      unknown: 0,
      safe_to_analyze: false,
    },
    latest_reference_rates: EMPTY_REFERENCE_RATES,
    latest_facility_usage: EMPTY_FACILITY_USAGE,
    funding_stress_signals: [
      {
        signal: "Database-backed funding stress analysis",
        status: "unavailable",
        evidence: "Market database inputs could not be read.",
        limitation: message,
      },
    ],
    interpretation:
      "Funding stress analysis is unavailable because database-backed inputs could not be read. No market values were inferred.",
    limitations: [message],
    confidence: "low",
  };
}

export async function GET() {
  if (!hasSupabaseEnv()) {
    return NextResponse.json(unavailableReport("Market database is not configured."));
  }

  try {
    const report = await buildFundingStressReport();
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json(
      unavailableReport(`Funding stress report unavailable: ${safeErrorMessage(error)}`),
      { status: 500 }
    );
  }
}
