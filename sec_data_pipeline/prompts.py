from __future__ import annotations

import json
import sqlite3


PROMPT_CHECKS = [
    "Fundamental Quality Check",
    "Growth Capacity Check",
    "Evidence-Based Risk Check",
]


def ai_prompt_payload(conn: sqlite3.Connection, ticker: str) -> dict:
    ticker = ticker.upper()
    financials = [dict(row) for row in conn.execute(
        "SELECT * FROM normalized_financials WHERE ticker = ? AND fiscal_period = 'FY' ORDER BY fiscal_year DESC LIMIT 6",
        (ticker,),
    )]
    metrics = [dict(row) for row in conn.execute(
        "SELECT * FROM derived_metrics WHERE ticker = ? AND fiscal_period = 'FY' ORDER BY fiscal_year DESC LIMIT 6",
        (ticker,),
    )]
    valuation = [dict(row) for row in conn.execute(
        "SELECT * FROM valuation_metrics WHERE ticker = ? ORDER BY fiscal_year DESC LIMIT 1",
        (ticker,),
    )]
    peer = conn.execute("SELECT * FROM peer_medians WHERE ticker = ?", (ticker,)).fetchone()
    risks = [dict(row) for row in conn.execute(
        "SELECT signal_type, severity, fiscal_year, fiscal_period, evidence, source FROM risk_signals WHERE ticker = ?",
        (ticker,),
    )]
    gate_row = conn.execute("SELECT * FROM data_quality_gates WHERE ticker = ?", (ticker,)).fetchone()
    if gate_row is None:
        raise ValueError(f"No quality gate found for {ticker}. Run quality gate before AI prompt integration.")
    gate = dict(gate_row)
    gate["missing_fields"] = json.loads(gate.pop("missing_fields_json"))
    gate["allowed_ai_claims"] = json.loads(gate.pop("allowed_ai_claims_json"))
    gate["forbidden_ai_claims"] = json.loads(gate.pop("forbidden_ai_claims_json"))
    return {
        "ticker": ticker,
        "checks": PROMPT_CHECKS,
        "policy": {
            "raw_sec_json_included": False,
            "instruction": "Use only normalized_data, quality_gate, valuation, peer_medians, and risk_signals. Do not make claims outside allowed_ai_claims.",
        },
        "quality_gate": gate,
        "normalized_data": {
            "financials": financials,
            "derived_metrics": metrics,
            "valuation": valuation,
            "peer_medians": dict(peer) if peer else None,
            "risk_signals": risks,
        },
    }
