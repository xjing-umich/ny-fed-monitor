from __future__ import annotations

import math
import sqlite3
from statistics import median


def safe_div(num: float | None, den: float | None) -> float | None:
    if num is None or den in (None, 0):
        return None
    return num / den


def cagr(current: float | None, prior: float | None, years: int) -> float | None:
    if current is None or prior is None or prior <= 0 or current <= 0:
        return None
    return math.pow(current / prior, 1 / years) - 1


def calculate_derived_metrics(conn: sqlite3.Connection, ticker: str) -> None:
    rows = conn.execute(
        "SELECT * FROM normalized_financials WHERE ticker = ? AND fiscal_period = 'FY' ORDER BY fiscal_year",
        (ticker.upper(),),
    ).fetchall()
    by_year = {row["fiscal_year"]: row for row in rows}
    for row in rows:
        year = row["fiscal_year"]
        prior = by_year.get(year - 1)
        prior3 = by_year.get(year - 3)
        prior5 = by_year.get(year - 5)
        invested_capital = (row["total_debt"] or 0) + (row["equity"] or 0) - (row["cash_and_equivalents"] or 0)
        roic = safe_div(row["operating_income"], invested_capital) if invested_capital else None
        values = {
            "gross_margin": safe_div(row["gross_profit"], row["revenue"]),
            "operating_margin": safe_div(row["operating_income"], row["revenue"]),
            "net_margin": safe_div(row["net_income"], row["revenue"]),
            "free_cash_flow": row["free_cash_flow"],
            "fcf_margin": safe_div(row["free_cash_flow"], row["revenue"]),
            "fcf_conversion": safe_div(row["free_cash_flow"], row["net_income"]),
            "revenue_growth_yoy": safe_div((row["revenue"] - prior["revenue"]) if prior and row["revenue"] is not None and prior["revenue"] is not None else None, prior["revenue"] if prior else None),
            "revenue_cagr_3y": cagr(row["revenue"], prior3["revenue"] if prior3 else None, 3),
            "revenue_cagr_5y": cagr(row["revenue"], prior5["revenue"] if prior5 else None, 5),
            "fcf_growth_yoy": safe_div((row["free_cash_flow"] - prior["free_cash_flow"]) if prior and row["free_cash_flow"] is not None and prior["free_cash_flow"] is not None else None, prior["free_cash_flow"] if prior else None),
            "fcf_cagr_3y": cagr(row["free_cash_flow"], prior3["free_cash_flow"] if prior3 else None, 3),
            "fcf_cagr_5y": cagr(row["free_cash_flow"], prior5["free_cash_flow"] if prior5 else None, 5),
            "total_debt": row["total_debt"],
            "net_debt": (row["total_debt"] - row["cash_and_equivalents"]) if row["total_debt"] is not None and row["cash_and_equivalents"] is not None else None,
            "debt_to_equity": safe_div(row["total_debt"], row["equity"]),
            "current_ratio": safe_div(row["current_assets"], row["current_liabilities"]),
            "roe": safe_div(row["net_income"], row["equity"]),
            "roic": roic,
            "share_count_change_yoy": safe_div((row["shares_outstanding"] - prior["shares_outstanding"]) if prior and row["shares_outstanding"] is not None and prior["shares_outstanding"] is not None else None, prior["shares_outstanding"] if prior else None),
        }
        columns = ", ".join(values)
        placeholders = ", ".join("?" for _ in values)
        updates = ", ".join(f"{key}=excluded.{key}" for key in values)
        conn.execute(
            f"""
            INSERT INTO derived_metrics (ticker, fiscal_year, fiscal_period, {columns})
            VALUES (?, ?, ?, {placeholders})
            ON CONFLICT(ticker, fiscal_year, fiscal_period) DO UPDATE SET {updates}, updated_at=CURRENT_TIMESTAMP
            """,
            (ticker.upper(), year, row["fiscal_period"], *values.values()),
        )
    conn.commit()


def peer_median(values: list[float | None]) -> float | None:
    present = [value for value in values if value is not None]
    return median(present) if present else None
