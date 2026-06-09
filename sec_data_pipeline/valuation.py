from __future__ import annotations

import sqlite3

from .metrics import safe_div


def calculate_valuation(conn: sqlite3.Connection, ticker: str) -> bool:
    ticker = ticker.upper()
    price = conn.execute(
        "SELECT * FROM prices WHERE ticker = ? ORDER BY price_date DESC LIMIT 1",
        (ticker,),
    ).fetchone()
    latest = conn.execute(
        "SELECT * FROM normalized_financials WHERE ticker = ? AND fiscal_period = 'FY' ORDER BY fiscal_year DESC LIMIT 1",
        (ticker,),
    ).fetchone()
    if price is None or latest is None or latest["shares_outstanding"] is None:
        return False
    market_cap = price["close"] * latest["shares_outstanding"]
    total_debt = latest["total_debt"] or 0
    cash = latest["cash_and_equivalents"] or 0
    enterprise_value = market_cap + total_debt - cash
    values = {
        "market_cap": market_cap,
        "enterprise_value": enterprise_value,
        "pe": safe_div(market_cap, latest["net_income"]),
        "ps": safe_div(market_cap, latest["revenue"]),
        "pfcf": safe_div(market_cap, latest["free_cash_flow"]),
        "ev_ebitda": safe_div(enterprise_value, latest["ebitda"]),
        "fcf_yield": safe_div(latest["free_cash_flow"], market_cap),
        "earnings_yield": safe_div(latest["net_income"], market_cap),
    }
    conn.execute(
        """
        INSERT INTO valuation_metrics (
          ticker, fiscal_year, fiscal_period, price_date, market_cap, enterprise_value,
          pe, ps, pfcf, ev_ebitda, fcf_yield, earnings_yield, source
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker, fiscal_year, fiscal_period, price_date) DO UPDATE SET
          market_cap=excluded.market_cap,
          enterprise_value=excluded.enterprise_value,
          pe=excluded.pe,
          ps=excluded.ps,
          pfcf=excluded.pfcf,
          ev_ebitda=excluded.ev_ebitda,
          fcf_yield=excluded.fcf_yield,
          earnings_yield=excluded.earnings_yield,
          source=excluded.source,
          updated_at=CURRENT_TIMESTAMP
        """,
        (
            ticker,
            latest["fiscal_year"],
            latest["fiscal_period"],
            price["price_date"],
            values["market_cap"],
            values["enterprise_value"],
            values["pe"],
            values["ps"],
            values["pfcf"],
            values["ev_ebitda"],
            values["fcf_yield"],
            values["earnings_yield"],
            price["source"],
        ),
    )
    conn.commit()
    return True
