from __future__ import annotations

import sqlite3

from .models import QualityGate


INCOME_FIELDS = ["revenue", "gross_profit", "operating_income", "net_income"]
BALANCE_FIELDS = ["cash_and_equivalents", "total_assets", "total_liabilities", "equity"]
CASH_FLOW_FIELDS = ["operating_cash_flow", "capital_expenditures", "free_cash_flow"]


def build_quality_gate(conn: sqlite3.Connection, ticker: str) -> QualityGate:
    ticker = ticker.upper()
    rows = conn.execute(
        "SELECT * FROM normalized_financials WHERE ticker = ? AND fiscal_period = 'FY' ORDER BY fiscal_year DESC",
        (ticker,),
    ).fetchall()
    latest = rows[0] if rows else None
    missing: list[str] = []
    if latest:
        for field in INCOME_FIELDS + BALANCE_FIELDS + CASH_FLOW_FIELDS:
            if latest[field] is None:
                missing.append(field)
    else:
        missing.extend(INCOME_FIELDS + BALANCE_FIELDS + CASH_FLOW_FIELDS)

    has_income = latest is not None and all(latest[field] is not None for field in INCOME_FIELDS)
    has_balance = latest is not None and all(latest[field] is not None for field in BALANCE_FIELDS)
    has_cash_flow = latest is not None and all(latest[field] is not None for field in CASH_FLOW_FIELDS)
    has_multi_year = len(rows) >= 3
    has_valuation = conn.execute("SELECT 1 FROM valuation_metrics WHERE ticker = ? LIMIT 1", (ticker,)).fetchone() is not None
    has_peer = conn.execute("SELECT 1 FROM peer_medians WHERE ticker = ? LIMIT 1", (ticker,)).fetchone() is not None
    has_external_risk = conn.execute("SELECT 1 FROM filing_sections WHERE ticker = ? LIMIT 1", (ticker,)).fetchone() is not None

    score = sum([has_income, has_balance, has_cash_flow, has_multi_year, has_valuation, has_peer, has_external_risk])
    confidence = "High" if score >= 6 and not missing else "Medium" if score >= 4 else "Low"
    allowed = []
    forbidden = []
    if has_income:
        allowed.append("Discuss normalized SEC-derived revenue, profitability, and margins.")
    else:
        forbidden.append("Do not make income statement quality claims.")
    if has_cash_flow:
        allowed.append("Discuss operating cash flow, free cash flow, FCF margin, and FCF conversion.")
    else:
        forbidden.append("Do not make free cash flow or cash conversion claims.")
    if has_balance:
        allowed.append("Discuss liquidity, leverage, debt, cash, and equity metrics.")
    else:
        forbidden.append("Do not make balance sheet strength or leverage claims.")
    if has_multi_year:
        allowed.append("Discuss multi-year growth and trend metrics.")
    else:
        forbidden.append("Do not make multi-year trend, CAGR, or deceleration claims.")
    if has_valuation:
        allowed.append("Discuss valuation multiples from stored price and normalized fundamentals.")
    else:
        forbidden.append("Disable valuation analysis and do not claim the stock is cheap or expensive.")
    if has_peer:
        allowed.append("Compare normalized metrics against stored peer medians.")
    else:
        forbidden.append("Do not make peer-relative claims.")
    if has_external_risk:
        allowed.append("Use stored SEC filing sections as external risk evidence.")
    else:
        forbidden.append("Do not claim management disclosed specific risks unless filing evidence is present.")

    return QualityGate(
        ticker=ticker,
        has_income_statement=has_income,
        has_balance_sheet=has_balance,
        has_cash_flow=has_cash_flow,
        has_multi_year_history=has_multi_year,
        has_valuation=has_valuation,
        has_peer_comparison=has_peer,
        has_external_risk_evidence=has_external_risk,
        missing_fields=missing,
        data_confidence=confidence,
        allowed_ai_claims=allowed,
        forbidden_ai_claims=forbidden,
    )
