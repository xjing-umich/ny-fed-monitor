from __future__ import annotations

import sqlite3
from pathlib import Path


SCHEMA = """
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS companies (
  ticker TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  name TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS raw_company_facts (
  ticker TEXT PRIMARY KEY,
  cik TEXT NOT NULL,
  facts_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS normalized_financials (
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_period TEXT NOT NULL,
  form TEXT,
  filed TEXT,
  frame TEXT,
  revenue REAL,
  cost_of_revenue REAL,
  gross_profit REAL,
  operating_income REAL,
  net_income REAL,
  ebit REAL,
  ebitda REAL,
  operating_cash_flow REAL,
  capital_expenditures REAL,
  free_cash_flow REAL,
  cash_and_equivalents REAL,
  total_assets REAL,
  current_assets REAL,
  total_liabilities REAL,
  current_liabilities REAL,
  total_debt REAL,
  short_term_debt REAL,
  long_term_debt REAL,
  equity REAL,
  shares_outstanding REAL,
  dividends_paid REAL,
  buybacks REAL,
  raw_values_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, fiscal_year, fiscal_period)
);

CREATE TABLE IF NOT EXISTS derived_metrics (
  ticker TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_period TEXT NOT NULL,
  gross_margin REAL,
  operating_margin REAL,
  net_margin REAL,
  free_cash_flow REAL,
  fcf_margin REAL,
  fcf_conversion REAL,
  revenue_growth_yoy REAL,
  revenue_cagr_3y REAL,
  revenue_cagr_5y REAL,
  fcf_growth_yoy REAL,
  fcf_cagr_3y REAL,
  fcf_cagr_5y REAL,
  total_debt REAL,
  net_debt REAL,
  debt_to_equity REAL,
  current_ratio REAL,
  roe REAL,
  roic REAL,
  share_count_change_yoy REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, fiscal_year, fiscal_period)
);

CREATE TABLE IF NOT EXISTS prices (
  ticker TEXT NOT NULL,
  price_date TEXT NOT NULL,
  close REAL NOT NULL,
  source TEXT NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, price_date, source)
);

CREATE TABLE IF NOT EXISTS valuation_metrics (
  ticker TEXT NOT NULL,
  fiscal_year INTEGER NOT NULL,
  fiscal_period TEXT NOT NULL,
  price_date TEXT NOT NULL,
  market_cap REAL,
  enterprise_value REAL,
  pe REAL,
  ps REAL,
  pfcf REAL,
  ev_ebitda REAL,
  fcf_yield REAL,
  earnings_yield REAL,
  source TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, fiscal_year, fiscal_period, price_date)
);

CREATE TABLE IF NOT EXISTS data_quality_gates (
  ticker TEXT PRIMARY KEY,
  has_income_statement INTEGER NOT NULL,
  has_balance_sheet INTEGER NOT NULL,
  has_cash_flow INTEGER NOT NULL,
  has_multi_year_history INTEGER NOT NULL,
  has_valuation INTEGER NOT NULL,
  has_peer_comparison INTEGER NOT NULL,
  has_external_risk_evidence INTEGER NOT NULL,
  missing_fields_json TEXT NOT NULL,
  data_confidence TEXT NOT NULL,
  allowed_ai_claims_json TEXT NOT NULL,
  forbidden_ai_claims_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS risk_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ticker TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  fiscal_year INTEGER,
  fiscal_period TEXT,
  evidence TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS institutional_ownership_trends (
  ticker TEXT NOT NULL,
  report_date TEXT NOT NULL,
  holders_count INTEGER,
  shares_held REAL,
  market_value REAL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, report_date, source)
);

CREATE TABLE IF NOT EXISTS peer_groups (
  ticker TEXT PRIMARY KEY,
  peers_json TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS peer_medians (
  ticker TEXT PRIMARY KEY,
  revenue_growth REAL,
  gross_margin REAL,
  operating_margin REAL,
  fcf_margin REAL,
  roe REAL,
  roic REAL,
  pe REAL,
  ps REAL,
  pfcf REAL,
  ev_ebitda REAL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS filing_sections (
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  accession_no TEXT NOT NULL,
  form TEXT NOT NULL,
  filing_date TEXT,
  section_name TEXT NOT NULL,
  section_text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, accession_no, section_name)
);

CREATE TABLE IF NOT EXISTS earnings_releases (
  ticker TEXT NOT NULL,
  cik TEXT NOT NULL,
  accession_no TEXT NOT NULL,
  filing_date TEXT,
  exhibit_name TEXT,
  release_text TEXT NOT NULL,
  source_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (ticker, accession_no, exhibit_name)
);
"""


def connect(db_path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def initialize(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA)
    conn.commit()
