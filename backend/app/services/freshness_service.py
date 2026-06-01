from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any


def _parse_date(value: str | None) -> date | None:
    if not value:
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text[:10], fmt).date()
        except ValueError:
            continue
    return None


def business_days_between(start: date, end: date) -> int:
    if end <= start:
        return 0
    days = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if current.weekday() < 5:
            days += 1
    return days


def compute_freshness_status(
    data_date: str | None,
    expected_update_frequency: str | None,
    *,
    file_exists: bool | None = None,
) -> str:
    frequency = (expected_update_frequency or "").lower()
    parsed = _parse_date(data_date)

    if frequency == "manual":
        if file_exists is False:
            return "Missing"
        return "Manual" if parsed or file_exists else "Missing"

    if not parsed:
        return "Missing" if frequency else "Unavailable"

    today = date.today()
    if frequency == "daily":
        return "Fresh" if business_days_between(parsed, today) <= 2 else "Stale"
    if frequency == "weekly":
        age = (today - parsed).days
        if age <= 8:
            return "Fresh"
        if age <= 14:
            return "Stale"
        return "Old"
    if frequency == "quarterly":
        age = (today - parsed).days
        return "Fresh" if age <= 100 else "Stale"
    return "Unavailable"


def compute_global_freshness_summary(rows: list[dict[str, Any]]) -> str:
    statuses = {str(row.get("freshness_status", "")) for row in rows}
    if "Missing" in statuses or "Unavailable" in statuses:
        return "some_unavailable"
    if "Manual" in statuses:
        return "manual_required"
    if "Stale" in statuses or "Old" in statuses:
        return "some_stale"
    return "all_fresh"


def refresh_schedule_rows() -> list[dict[str, str]]:
    return [
        {
            "Dataset": "Reference Rates",
            "Module": "SOFR, EFFR, OBFR, TGCR, BGCR",
            "Suggested frequency": "Daily",
            "Fresh if": "within 2 business days",
            "Stale if": "older than 2 business days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "Auction Calendar and Results",
            "Module": "Auction Risk",
            "Suggested frequency": "Daily",
            "Fresh if": "within 2 business days",
            "Stale if": "older than 2 business days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "ON RRP / SRP Facility Usage",
            "Module": "Facility Usage",
            "Suggested frequency": "Daily",
            "Fresh if": "within 2 business days",
            "Stale if": "older than 2 business days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "Primary Dealer Positions",
            "Module": "Dealer Inventory",
            "Suggested frequency": "Weekly",
            "Fresh if": "within 8 calendar days",
            "Stale if": "older than 8 calendar days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "Transactions",
            "Module": "Transactions / Liquidity",
            "Suggested frequency": "Weekly",
            "Fresh if": "within 8 calendar days",
            "Stale if": "older than 8 calendar days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "Repo Financing",
            "Module": "Repo Financing",
            "Suggested frequency": "Weekly",
            "Fresh if": "within 8 calendar days",
            "Stale if": "older than 8 calendar days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "Fails",
            "Module": "Fails / Specialness",
            "Suggested frequency": "Weekly",
            "Fresh if": "within 8 calendar days",
            "Stale if": "older than 8 calendar days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "SOMA Holdings",
            "Module": "SOMA",
            "Suggested frequency": "Weekly",
            "Fresh if": "within 8 calendar days",
            "Stale if": "older than 8 calendar days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "Market Share / Dealer Concentration",
            "Module": "Market Share",
            "Suggested frequency": "Quarterly",
            "Fresh if": "within 100 calendar days",
            "Stale if": "older than 100 calendar days",
            "Update method": "API refresh",
        },
        {
            "Dataset": "SME / Policy Expectations",
            "Module": "Policy Expectations",
            "Suggested frequency": "Manual",
            "Fresh if": "file exists and release date is parsed",
            "Stale if": "file missing or not updated",
            "Update method": "Replace local Excel/CSV file",
        },
    ]
