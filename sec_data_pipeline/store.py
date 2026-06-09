from __future__ import annotations

import json
import sqlite3

from .models import NormalizedPeriod, QualityGate
from .price_client import PricePoint


FINANCIAL_COLUMNS = [
    "revenue",
    "cost_of_revenue",
    "gross_profit",
    "operating_income",
    "net_income",
    "ebit",
    "ebitda",
    "operating_cash_flow",
    "capital_expenditures",
    "free_cash_flow",
    "cash_and_equivalents",
    "total_assets",
    "current_assets",
    "total_liabilities",
    "current_liabilities",
    "total_debt",
    "short_term_debt",
    "long_term_debt",
    "equity",
    "shares_outstanding",
    "dividends_paid",
    "buybacks",
]


def upsert_company(conn: sqlite3.Connection, ticker: str, cik: str, name: str | None) -> None:
    conn.execute(
        """
        INSERT INTO companies (ticker, cik, name)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET cik=excluded.cik, name=excluded.name, updated_at=CURRENT_TIMESTAMP
        """,
        (ticker.upper(), cik, name),
    )
    conn.commit()


def upsert_raw_facts(conn: sqlite3.Connection, ticker: str, cik: str, facts: dict) -> None:
    conn.execute(
        """
        INSERT INTO raw_company_facts (ticker, cik, facts_json)
        VALUES (?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET cik=excluded.cik, facts_json=excluded.facts_json, fetched_at=CURRENT_TIMESTAMP
        """,
        (ticker.upper(), cik, json.dumps(facts, sort_keys=True)),
    )
    conn.commit()


def upsert_normalized(conn: sqlite3.Connection, periods: list[NormalizedPeriod]) -> None:
    for period in periods:
        values = period.statements
        columns = FINANCIAL_COLUMNS + ["raw_values_json"]
        placeholders = ", ".join("?" for _ in columns)
        updates = ", ".join(f"{column}=excluded.{column}" for column in columns)
        conn.execute(
            f"""
            INSERT INTO normalized_financials (
              ticker, cik, fiscal_year, fiscal_period, form, filed, frame, {", ".join(columns)}
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, {placeholders})
            ON CONFLICT(ticker, fiscal_year, fiscal_period) DO UPDATE SET
              cik=excluded.cik, form=excluded.form, filed=excluded.filed, frame=excluded.frame,
              {updates}, updated_at=CURRENT_TIMESTAMP
            """,
            (
                period.ticker,
                period.cik,
                period.fiscal_year,
                period.fiscal_period,
                period.form,
                period.filed,
                period.frame,
                *[values.get(column) for column in columns],
            ),
        )
    conn.commit()


def upsert_price(conn: sqlite3.Connection, price: PricePoint) -> None:
    conn.execute(
        """
        INSERT OR REPLACE INTO prices (ticker, price_date, close, source)
        VALUES (?, ?, ?, ?)
        """,
        (price.ticker, price.price_date, price.close, price.source),
    )
    conn.commit()


def upsert_quality_gate(conn: sqlite3.Connection, gate: QualityGate) -> None:
    conn.execute(
        """
        INSERT INTO data_quality_gates (
          ticker, has_income_statement, has_balance_sheet, has_cash_flow, has_multi_year_history,
          has_valuation, has_peer_comparison, has_external_risk_evidence, missing_fields_json,
          data_confidence, allowed_ai_claims_json, forbidden_ai_claims_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          has_income_statement=excluded.has_income_statement,
          has_balance_sheet=excluded.has_balance_sheet,
          has_cash_flow=excluded.has_cash_flow,
          has_multi_year_history=excluded.has_multi_year_history,
          has_valuation=excluded.has_valuation,
          has_peer_comparison=excluded.has_peer_comparison,
          has_external_risk_evidence=excluded.has_external_risk_evidence,
          missing_fields_json=excluded.missing_fields_json,
          data_confidence=excluded.data_confidence,
          allowed_ai_claims_json=excluded.allowed_ai_claims_json,
          forbidden_ai_claims_json=excluded.forbidden_ai_claims_json,
          updated_at=CURRENT_TIMESTAMP
        """,
        (
            gate.ticker,
            int(gate.has_income_statement),
            int(gate.has_balance_sheet),
            int(gate.has_cash_flow),
            int(gate.has_multi_year_history),
            int(gate.has_valuation),
            int(gate.has_peer_comparison),
            int(gate.has_external_risk_evidence),
            json.dumps(gate.missing_fields),
            gate.data_confidence,
            json.dumps(gate.allowed_ai_claims),
            json.dumps(gate.forbidden_ai_claims),
        ),
    )
    conn.commit()
