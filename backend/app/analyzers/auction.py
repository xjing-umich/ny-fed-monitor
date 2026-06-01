from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from ..services.treasury_client import TreasuryClient


BASE_URL = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/od/auctions_query"


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _to_float(value: Any) -> float | None:
    if value in (None, "", "null"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _to_date_str(value: Any) -> str | None:
    if value in (None, "", "null"):
        return None
    return str(value)


def _format_dollars(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    sign = "-" if value < 0 else ""
    abs_value = abs(value)
    if abs_value >= 1_000_000_000_000:
        return f"{sign}${abs_value / 1_000_000_000_000:.2f} trillion"
    if abs_value >= 1_000_000_000:
        return f"{sign}${abs_value / 1_000_000_000:.0f} billion"
    if abs_value >= 1_000_000:
        return f"{sign}${abs_value / 1_000_000:.1f} million"
    return f"{sign}${abs_value:.2f}"


def _format_percent_share(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    return f"{value * 100:.1f}%"


def _freshness_status(data_date: str | None) -> str:
    if not data_date:
        return "Missing"
    try:
        as_of = datetime.strptime(data_date, "%Y-%m-%d").date()
    except ValueError:
        return "Missing"
    business_days = 0
    cursor = as_of
    while cursor < date.today():
        cursor += timedelta(days=1)
        if cursor.weekday() < 5:
            business_days += 1
    return "Fresh" if business_days <= 2 else "Stale"


def fetch_upcoming_auctions(client: TreasuryClient | None = None) -> tuple[list[dict[str, Any]], list[str]]:
    client = client or TreasuryClient()
    today = date.today().isoformat()
    url = f"{BASE_URL}?filter=auction_date:gte:{today}&page[size]=100&sort=auction_date"
    warnings: list[str] = []
    try:
        payload = client.get_json(url)
    except RuntimeError as exc:
        return [], [str(exc)]
    warnings.extend(client.warnings)
    return payload.get("data", []), warnings


def fetch_recent_auction_results(client: TreasuryClient | None = None) -> tuple[list[dict[str, Any]], list[str]]:
    client = client or TreasuryClient()
    start = (date.today() - timedelta(days=90)).isoformat()
    url = f"{BASE_URL}?filter=auction_date:gte:{start}&page[size]=500&sort=-auction_date"
    warnings: list[str] = []
    try:
        payload = client.get_json(url)
    except RuntimeError as exc:
        return [], [str(exc)]
    warnings.extend(client.warnings)
    return payload.get("data", []), warnings


def normalize_auction_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    normalized = []
    required = [
        "auction_date",
        "announcemt_date",
        "issue_date",
        "security_type",
        "security_term",
        "offering_amt",
        "cusip",
    ]
    for row in rows:
        missing_fields = [field for field in required if field not in row]
        if missing_fields:
            warnings.append(f"Missing fields in auction row: {', '.join(missing_fields)}")
        normalized_row = {
            "auction_date": _to_date_str(row.get("auction_date")),
            "announcement_date": _to_date_str(row.get("announcemt_date")),
            "issue_date": _to_date_str(row.get("issue_date")),
            "security_type": row.get("security_type"),
            "security_term": row.get("security_term"),
            "offering_amount": _to_float(row.get("offering_amt")),
            "cusip": row.get("cusip"),
            "maturity_date": _to_date_str(row.get("maturity_date")),
            "high_yield": _to_float(row.get("high_yield")),
            "high_rate": _to_float(row.get("high_investment_rate")) or _to_float(row.get("high_discnt_rate")),
            "bid_to_cover_ratio": _to_float(row.get("bid_to_cover_ratio")),
            "primary_dealer_accepted": _to_float(row.get("primary_dealer_accepted")),
            "direct_bidder_accepted": _to_float(row.get("direct_bidder_accepted")),
            "indirect_bidder_accepted": _to_float(row.get("indirect_bidder_accepted")),
            "total_accepted": _to_float(row.get("total_accepted")) or _to_float(row.get("offering_amt")),
            "source": "treasury_fiscaldata",
            "raw": row,
        }
        normalized.append(normalized_row)
    return normalized, warnings


def _share(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _btc_label(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    if value < 2.3:
        return "Weak"
    if value > 2.7:
        return "Strong"
    return "Normal"


def _dealer_label(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    if value > 0.40:
        return "High"
    if value >= 0.25:
        return "Moderate"
    return "Low"


def _indirect_label(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    if value > 0.65:
        return "Strong"
    if value >= 0.50:
        return "Normal"
    return "Weak"


def _upcoming_supply_label(amount_14d: float) -> str:
    if amount_14d >= 300_000_000_000:
        return "Large"
    if amount_14d >= 150_000_000_000:
        return "Moderate"
    return "Normal"


def _liquidity_watch(transactions_section: dict[str, Any], fails_section: dict[str, Any]) -> bool:
    txn_metric = next((m for m in transactions_section.get("key_metrics", []) if m.get("label") == "Activity Direction"), None)
    fails_metric = next((m for m in fails_section.get("key_metrics", []) if m.get("label") == "Fails Direction"), None)
    return (txn_metric or {}).get("value") in ("Watch / Mild", "Unavailable") or (fails_metric or {}).get("value") == "rising"


def _dealer_inventory_extreme(section: dict[str, Any]) -> tuple[bool, bool]:
    metric = next((m for m in section.get("key_metrics", []) if m.get("label") == "Pressure Label"), None)
    value = (metric or {}).get("value", "")
    return value == "Extreme", value in ("Elevated", "Extreme")


def _long_end_inventory_elevated() -> bool:
    return False


def compute_auction_section(
    upcoming_rows: list[dict[str, Any]],
    recent_rows: list[dict[str, Any]],
    dealer_inventory_section: dict[str, Any],
    transactions_section: dict[str, Any],
    fails_section: dict[str, Any],
) -> dict[str, Any]:
    warnings: list[str] = []
    upcoming_amount_7d = 0.0
    upcoming_amount_14d = 0.0
    today = date.today()
    upcoming_table = []

    for row in sorted(upcoming_rows, key=lambda item: item.get("auction_date") or ""):
        auction_date = row.get("auction_date")
        try:
            auction_dt = datetime.strptime(auction_date, "%Y-%m-%d").date() if auction_date else None
        except ValueError:
            auction_dt = None
        amount = row.get("offering_amount") or 0.0
        if auction_dt:
            if auction_dt <= today + timedelta(days=7):
                upcoming_amount_7d += amount
            if auction_dt <= today + timedelta(days=14):
                upcoming_amount_14d += amount
        upcoming_table.append(
            {
                "Auction date": auction_date or "Unavailable",
                "Security type": row.get("security_type") or "Unavailable",
                "Term": row.get("security_term") or "Unavailable",
                "Offering amount": _format_dollars(amount),
                "Issue date": row.get("issue_date") or "Unavailable",
            }
        )

    completed_table = []
    pending_table = []
    weak_btc = False
    high_dealer = False
    weak_indirect = False
    latest_completed_date = None

    for row in sorted(recent_rows, key=lambda item: item.get("auction_date") or "", reverse=True):
        primary_share = _share(row.get("primary_dealer_accepted"), row.get("total_accepted"))
        direct_share = _share(row.get("direct_bidder_accepted"), row.get("total_accepted"))
        indirect_share = _share(row.get("indirect_bidder_accepted"), row.get("total_accepted"))
        btc_label = _btc_label(row.get("bid_to_cover_ratio"))
        dealer_label = _dealer_label(primary_share)
        indirect_label = _indirect_label(indirect_share)
        demand_summary = f"BTC: {btc_label} | Dealer: {dealer_label} | Indirect: {indirect_label}"

        has_results = row.get("bid_to_cover_ratio") is not None or any(
            share is not None for share in [primary_share, direct_share, indirect_share]
        )
        if has_results:
            completed_table.append(
                {
                    "Auction date": row.get("auction_date") or "Unavailable",
                    "Security type": row.get("security_type") or "Unavailable",
                    "Term": row.get("security_term") or "Unavailable",
                    "Offering amount": _format_dollars(row.get("offering_amount")),
                    "Bid-to-cover": "Unavailable" if row.get("bid_to_cover_ratio") is None else f"{row.get('bid_to_cover_ratio'):.2f}",
                    "Primary dealer share": _format_percent_share(primary_share),
                    "Indirect bidder share": _format_percent_share(indirect_share),
                    "Demand summary": demand_summary,
                }
            )
            weak_btc = weak_btc or btc_label == "Weak"
            high_dealer = high_dealer or dealer_label == "High"
            weak_indirect = weak_indirect or indirect_label == "Weak"
            latest_completed_date = latest_completed_date or row.get("auction_date")
        else:
            pending_table.append(
                {
                    "Auction date": row.get("auction_date") or "Unavailable",
                    "Security type": row.get("security_type") or "Unavailable",
                    "Term": row.get("security_term") or "Unavailable",
                    "Offering amount": _format_dollars(row.get("offering_amount")),
                    "Status": "Results not yet available",
                }
            )

    upcoming_label = _upcoming_supply_label(upcoming_amount_14d)
    dealer_inventory_extreme, dealer_inventory_elevated = _dealer_inventory_extreme(dealer_inventory_section)
    liquidity_watch = _liquidity_watch(transactions_section, fails_section)
    long_end_elevated = _long_end_inventory_elevated()
    large_upcoming = upcoming_label == "Large"

    high_conditions = sum(
        [
            1 if dealer_inventory_extreme else 0,
            1 if long_end_elevated else 0,
            1 if weak_btc else 0,
            1 if high_dealer else 0,
            1 if weak_indirect else 0,
            1 if large_upcoming else 0,
            1 if liquidity_watch else 0,
        ]
    )

    if high_conditions >= 2:
        auction_risk = "High"
    elif dealer_inventory_elevated or large_upcoming or weak_btc or high_dealer or weak_indirect:
        auction_risk = "Medium"
    else:
        auction_risk = "Low"

    summary = (
        "Auction risk is higher when new Treasury supply is coming while dealer inventory is elevated or recent auction demand has weakened."
    )
    summary_zh = (
        "当即将发行的 Treasury supply 较大，同时 Dealer Inventory 偏高或近期 auction demand 走弱时，Auction Risk 会更高。"
    )

    return {
        "title": "Auction Calendar and Auction Risk",
        "title_zh": "拍卖风险 Auction Risk",
        "mode": "live",
        "status": "available",
        "source": "treasury_fiscaldata",
        "freshness_status": _freshness_status(latest_completed_date or (upcoming_rows[0].get("auction_date") if upcoming_rows else None)),
        "expected_update_frequency": "daily",
        "data_date": latest_completed_date or (upcoming_rows[0].get("auction_date") if upcoming_rows else None),
        "summary": summary,
        "summary_zh": summary_zh,
        "interpretation": summary,
        "interpretation_zh": summary_zh,
        "why_it_matters": "Treasury auctions are where new supply enters the market; weak demand can require greater dealer absorption.",
        "why_it_matters_zh": "Treasury auction 是新增供给进入市场的主要渠道；需求走弱时，dealer 可能需要承担更多承接压力。",
        "caveat": "Auction risk is rule-based and not a forecast.",
        "key_metrics": [
            {"label": "Auction Risk", "label_zh": "拍卖风险 Auction Risk", "value": auction_risk, "unit": ""},
            {"label": "Upcoming 7-day Supply", "label_zh": "未来7天供给 Upcoming 7-day Supply", "value": _format_dollars(upcoming_amount_7d), "unit": ""},
            {"label": "Upcoming 14-day Supply", "label_zh": "未来14天供给 Upcoming 14-day Supply", "value": _format_dollars(upcoming_amount_14d), "unit": ""},
            {"label": "Upcoming Supply Label", "label_zh": "未来供给标签 Upcoming Supply Label", "value": upcoming_label, "unit": ""},
        ],
        "tables": [
            {"title": "Upcoming Auctions", "title_zh": "即将进行的拍卖 Upcoming Auctions", "rows": upcoming_table[:12]},
            {"title": "Completed Recent Auction Results", "title_zh": "已完成拍卖结果 Completed Recent Auction Results", "rows": completed_table[:12]},
            {"title": "Pending / Results Not Yet Available", "title_zh": "待公布结果 Pending / Results Not Yet Available", "rows": pending_table[:12]},
        ],
        "warnings": warnings,
        "series_used": [
            {
                "metric": "Upcoming 14-day Supply",
                "keyid": "auction-risk",
                "latest_date": latest_completed_date,
                "formatted_value": _format_dollars(upcoming_amount_14d),
                "status": "used",
                "description": "Computed from Treasury FiscalData auctions_query upcoming auction rows.",
            }
        ],
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


def build_auction_section(dealer_inventory_section: dict[str, Any], transactions_section: dict[str, Any], fails_section: dict[str, Any]) -> dict[str, Any]:
    client = TreasuryClient()
    upcoming_raw, upcoming_warnings = fetch_upcoming_auctions(client)
    recent_raw, recent_warnings = fetch_recent_auction_results(client)
    upcoming_rows, normalize_upcoming_warnings = normalize_auction_rows(upcoming_raw)
    recent_rows, normalize_recent_warnings = normalize_auction_rows(recent_raw)
    section = compute_auction_section(upcoming_rows, recent_rows, dealer_inventory_section, transactions_section, fails_section)
    section["warnings"] = upcoming_warnings + recent_warnings + normalize_upcoming_warnings + normalize_recent_warnings + section.get("warnings", [])
    return section


def save_auction_cache(section: dict[str, Any]) -> None:
    cache_dir = _project_root() / "data" / "cache" / "sections"
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / "auction-risk.json"
    output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")
