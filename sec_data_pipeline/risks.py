from __future__ import annotations

import json
import sqlite3


def _add(conn: sqlite3.Connection, ticker: str, signal_type: str, severity: str, year: int | None, period: str | None, evidence: str, source: str) -> None:
    conn.execute(
        """
        INSERT INTO risk_signals (ticker, signal_type, severity, fiscal_year, fiscal_period, evidence, source)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (ticker, signal_type, severity, year, period, evidence, source),
    )


def refresh_risk_signals(conn: sqlite3.Connection, ticker: str) -> None:
    ticker = ticker.upper()
    conn.execute("DELETE FROM risk_signals WHERE ticker = ?", (ticker,))
    metrics = conn.execute(
        """
        SELECT nf.*, dm.*, vm.pe, vm.ps, vm.pfcf, vm.ev_ebitda
        FROM normalized_financials nf
        LEFT JOIN derived_metrics dm ON dm.ticker=nf.ticker AND dm.fiscal_year=nf.fiscal_year AND dm.fiscal_period=nf.fiscal_period
        LEFT JOIN valuation_metrics vm ON vm.ticker=nf.ticker AND vm.fiscal_year=nf.fiscal_year AND vm.fiscal_period=nf.fiscal_period
        WHERE nf.ticker = ? AND nf.fiscal_period = 'FY'
        ORDER BY nf.fiscal_year DESC
        LIMIT 3
        """,
        (ticker,),
    ).fetchall()
    if not metrics:
        _add(conn, ticker, "missing_critical_data", "High", None, None, "No normalized annual SEC financial statements are available.", "quality_gate")
        conn.commit()
        return
    latest = metrics[0]
    prior = metrics[1] if len(metrics) > 1 else None
    if latest["revenue_growth_yoy"] is not None and latest["revenue_growth_yoy"] < 0:
        _add(conn, ticker, "revenue_deceleration", "Medium", latest["fiscal_year"], "FY", f"Revenue growth YoY was {latest['revenue_growth_yoy']:.2%}.", "derived_metrics")
    if prior and latest["operating_margin"] is not None and prior["operating_margin"] is not None and latest["operating_margin"] < prior["operating_margin"]:
        _add(conn, ticker, "margin_compression", "Medium", latest["fiscal_year"], "FY", f"Operating margin declined from {prior['operating_margin']:.2%} to {latest['operating_margin']:.2%}.", "derived_metrics")
    if latest["free_cash_flow"] is not None and latest["free_cash_flow"] < 0:
        _add(conn, ticker, "negative_fcf", "High", latest["fiscal_year"], "FY", f"Free cash flow was negative at {latest['free_cash_flow']:.0f}.", "normalized_financials")
    if prior and latest["free_cash_flow"] is not None and prior["free_cash_flow"] is not None and latest["free_cash_flow"] < prior["free_cash_flow"]:
        _add(conn, ticker, "declining_fcf", "Medium", latest["fiscal_year"], "FY", "Free cash flow declined year over year.", "normalized_financials")
    if prior and latest["total_debt"] is not None and prior["total_debt"] is not None and latest["total_debt"] > prior["total_debt"]:
        _add(conn, ticker, "rising_debt", "Medium", latest["fiscal_year"], "FY", "Total debt increased year over year.", "normalized_financials")
    if prior and latest["cash_and_equivalents"] is not None and prior["cash_and_equivalents"] is not None and latest["cash_and_equivalents"] < prior["cash_and_equivalents"]:
        _add(conn, ticker, "declining_cash", "Low", latest["fiscal_year"], "FY", "Cash and equivalents declined year over year.", "normalized_financials")
    if latest["share_count_change_yoy"] is not None and latest["share_count_change_yoy"] > 0.02:
        _add(conn, ticker, "share_dilution", "Medium", latest["fiscal_year"], "FY", f"Share count increased {latest['share_count_change_yoy']:.2%} year over year.", "derived_metrics")
    shareholder_returns = abs(latest["dividends_paid"] or 0) + abs(latest["buybacks"] or 0)
    if latest["free_cash_flow"] and shareholder_returns > latest["free_cash_flow"]:
        _add(conn, ticker, "returns_exceed_fcf", "Medium", latest["fiscal_year"], "FY", "Buybacks plus dividends exceeded free cash flow.", "normalized_financials")
    if latest["pe"] and latest["pe"] > 40:
        _add(conn, ticker, "elevated_valuation", "Medium", latest["fiscal_year"], "FY", f"P/E was {latest['pe']:.1f}.", "valuation_metrics")

    thirteen_f = conn.execute(
        "SELECT * FROM institutional_ownership_trends WHERE ticker = ? ORDER BY report_date DESC LIMIT 2",
        (ticker,),
    ).fetchall()
    if len(thirteen_f) == 2:
        current, previous = thirteen_f
        if current["shares_held"] is not None and previous["shares_held"] is not None and current["shares_held"] < previous["shares_held"]:
            _add(conn, ticker, "weakening_13f_trend", "Low", latest["fiscal_year"], "FY", "Institutional shares held declined in the latest stored 13F trend data.", "institutional_ownership_trends")

    gate = conn.execute("SELECT missing_fields_json FROM data_quality_gates WHERE ticker = ?", (ticker,)).fetchone()
    if gate:
        missing = json.loads(gate["missing_fields_json"])
        if missing:
            _add(conn, ticker, "missing_critical_data", "Medium", latest["fiscal_year"], "FY", f"Missing fields: {', '.join(missing)}.", "quality_gate")
    conn.commit()
