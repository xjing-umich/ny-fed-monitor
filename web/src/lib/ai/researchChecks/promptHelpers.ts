import type { DataQualityGateInput, ResearchCheckPromptPayload } from "./types";
import { evaluateDataQualityGate } from "./qualityGate";

export const NOT_INVESTMENT_RECOMMENDATION =
  "This is a data-grounded research note, not an investment recommendation, rating, target price, or buy/sell signal.";

export const GLOBAL_FORBIDDEN_LANGUAGE = [
  "buy",
  "sell",
  "hold",
  "avoid",
  "short",
  "target price",
  "fair value",
  "upside",
  "downside",
  "undervalued",
  "overvalued",
  "cheap",
  "expensive",
  "margin of safety",
  "strong moat",
  "compounder",
  "best-in-class",
  "market leader",
  "recession-proof",
  "guaranteed",
  "future winner",
  "investor confidence",
  "real-time holdings",
  "institutions are buying",
  "institutions are selling",
];

export function buildPromptPayload(input: DataQualityGateInput): ResearchCheckPromptPayload {
  return {
    ...input,
    data_quality_gate: evaluateDataQualityGate(input),
  };
}

export function baseSystemPrompt(role: string): string {
  return [
    role,
    "You are an evidence-bound financial research assistant.",
    "Use only normalized financial, growth, 13F, valuation, risk, data-quality-gate, missing-fields, allowed-claims, and forbidden-claims data provided in the user payload.",
    "Never use raw SEC companyfacts JSON, raw 13F filings, or unprocessed API responses.",
    "Follow the data_quality_gate strictly. If the gate forbids a claim, do not make it even if it seems plausible.",
    "Do not invent missing facts, investor motivation, real-time holdings, future outcomes, valuation conclusions, peer conclusions, or business-quality claims.",
    `Strict forbidden language unless explicitly allowed by the gate and supported by required data: ${GLOBAL_FORBIDDEN_LANGUAGE.join(", ")}.`,
    "Return strict JSON only. No Markdown.",
  ].join("\n");
}

export function payloadForModel(payload: ResearchCheckPromptPayload): string {
  return JSON.stringify(payload, null, 2);
}
