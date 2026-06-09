from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class NormalizedPeriod:
    ticker: str
    cik: str
    fiscal_year: int
    fiscal_period: str
    form: str
    filed: str | None
    frame: str | None
    statements: dict[str, Any]


@dataclass(frozen=True)
class QualityGate:
    ticker: str
    has_income_statement: bool
    has_balance_sheet: bool
    has_cash_flow: bool
    has_multi_year_history: bool
    has_valuation: bool
    has_peer_comparison: bool
    has_external_risk_evidence: bool
    missing_fields: list[str]
    data_confidence: str
    allowed_ai_claims: list[str]
    forbidden_ai_claims: list[str]
