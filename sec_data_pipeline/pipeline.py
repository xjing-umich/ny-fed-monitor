from __future__ import annotations

import sqlite3

from .filings import store_earnings_releases, store_filing_sections
from .metrics import calculate_derived_metrics
from .normalize import normalize_company_facts
from .peers import calculate_peer_medians
from .price_client import StooqPriceClient
from .quality import build_quality_gate
from .risks import refresh_risk_signals
from .sec_client import SecClient
from .store import upsert_company, upsert_normalized, upsert_price, upsert_quality_gate, upsert_raw_facts
from .valuation import calculate_valuation


def run_sec_fundamentals(conn: sqlite3.Connection, client: SecClient, ticker: str) -> tuple[str, int]:
    mapping = client.cik_for_ticker(ticker)
    cik = mapping["cik"]
    upsert_company(conn, ticker, cik, mapping.get("name"))
    facts = client.company_facts(cik)
    upsert_raw_facts(conn, ticker, cik, facts)
    periods = normalize_company_facts(ticker, cik, facts)
    upsert_normalized(conn, periods)
    return cik, len(periods)


def run_for_ticker(
    conn: sqlite3.Connection,
    client: SecClient,
    ticker: str,
    include_price: bool = True,
    include_filings: bool = True,
) -> dict:
    cik, period_count = run_sec_fundamentals(conn, client, ticker)
    calculate_derived_metrics(conn, ticker)
    price_loaded = False
    valuation_loaded = False
    if include_price:
        price = StooqPriceClient().latest_close(ticker)
        if price:
            upsert_price(conn, price)
            price_loaded = True
            valuation_loaded = calculate_valuation(conn, ticker)
    calculate_peer_medians(conn, ticker)
    gate = build_quality_gate(conn, ticker)
    upsert_quality_gate(conn, gate)
    refresh_risk_signals(conn, ticker)
    filing_sections = 0
    earnings_releases = 0
    if include_filings:
        filing_sections = store_filing_sections(conn, ticker, cik, client)
        earnings_releases = store_earnings_releases(conn, ticker, cik, client)
        gate = build_quality_gate(conn, ticker)
        upsert_quality_gate(conn, gate)
        refresh_risk_signals(conn, ticker)
    return {
        "ticker": ticker.upper(),
        "cik": cik,
        "normalized_periods": period_count,
        "price_loaded": price_loaded,
        "valuation_loaded": valuation_loaded,
        "filing_sections": filing_sections,
        "earnings_releases": earnings_releases,
        "data_confidence": gate.data_confidence,
        "missing_fields": gate.missing_fields,
    }
