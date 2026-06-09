from __future__ import annotations

import json
from collections import defaultdict
from typing import Any

from .models import NormalizedPeriod


FIELD_TAGS: dict[str, list[str]] = {
    "revenue": ["Revenues", "RevenueFromContractWithCustomerExcludingAssessedTax", "SalesRevenueNet"],
    "cost_of_revenue": ["CostOfRevenue", "CostOfGoodsAndServicesSold", "CostOfGoodsSold"],
    "gross_profit": ["GrossProfit"],
    "operating_income": ["OperatingIncomeLoss"],
    "net_income": ["NetIncomeLoss", "ProfitLoss"],
    "ebit": ["IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest"],
    "ebitda": ["EarningsBeforeInterestTaxesDepreciationAmortization"],
    "operating_cash_flow": ["NetCashProvidedByUsedInOperatingActivities"],
    "capital_expenditures": ["PaymentsToAcquirePropertyPlantAndEquipment"],
    "cash_and_equivalents": ["CashAndCashEquivalentsAtCarryingValue", "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents"],
    "total_assets": ["Assets"],
    "current_assets": ["AssetsCurrent"],
    "total_liabilities": ["Liabilities"],
    "current_liabilities": ["LiabilitiesCurrent"],
    "short_term_debt": ["ShortTermBorrowings", "ShortTermDebtCurrent", "ShortTermDebt"],
    "long_term_debt": ["LongTermDebtNoncurrent", "LongTermDebt"],
    "equity": ["StockholdersEquity", "StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest"],
    "shares_outstanding": ["EntityCommonStockSharesOutstanding", "CommonStockSharesOutstanding", "WeightedAverageNumberOfDilutedSharesOutstanding"],
    "dividends_paid": ["PaymentsOfDividends", "PaymentsOfDividendsCommonStock"],
    "buybacks": ["PaymentsForRepurchaseOfCommonStock", "PaymentsForRepurchaseOfEquity"],
}

INSTANT_FIELDS = {
    "cash_and_equivalents",
    "total_assets",
    "current_assets",
    "total_liabilities",
    "current_liabilities",
    "short_term_debt",
    "long_term_debt",
    "equity",
    "shares_outstanding",
}


def _usd_units(facts: dict[str, Any], tag: str) -> list[dict[str, Any]]:
    concept = facts.get("facts", {}).get("us-gaap", {}).get(tag, {})
    units = concept.get("units", {})
    return units.get("USD") or units.get("shares") or []


def _score_unit(unit: dict[str, Any], target_field: str) -> tuple[int, str]:
    form_score = {"10-K": 3, "10-Q": 2, "8-K": 1}.get(unit.get("form"), 0)
    frame = unit.get("frame") or ""
    period_score = 2 if frame.startswith("CY") and ("Q" not in frame or target_field in INSTANT_FIELDS) else 0
    filed = unit.get("filed") or ""
    return form_score + period_score, filed


def normalize_company_facts(ticker: str, cik: str, facts: dict[str, Any], annual_only: bool = True) -> list[NormalizedPeriod]:
    buckets: dict[tuple[int, str], dict[str, Any]] = defaultdict(lambda: {"values": {}, "raw": {}})
    meta: dict[tuple[int, str], dict[str, Any]] = defaultdict(dict)

    for field, tags in FIELD_TAGS.items():
        candidates: dict[tuple[int, str], list[tuple[tuple[int, str], str, dict[str, Any]]]] = defaultdict(list)
        for tag in tags:
            for unit in _usd_units(facts, tag):
                fy = unit.get("fy")
                fp = unit.get("fp")
                if not fy or not fp:
                    continue
                if annual_only and fp != "FY":
                    continue
                val = unit.get("val")
                if val is None:
                    continue
                key = (int(fy), str(fp))
                candidates[key].append((_score_unit(unit, field), tag, unit))

        for key, rows in candidates.items():
            rows.sort(reverse=True, key=lambda item: item[0])
            _, tag, unit = rows[0]
            value = float(unit["val"])
            if field in {"capital_expenditures", "dividends_paid", "buybacks"} and value > 0:
                value = -value
            buckets[key]["values"][field] = value
            buckets[key]["raw"][field] = {"tag": tag, "unit": unit}
            meta[key].update(
                {
                    "form": unit.get("form"),
                    "filed": unit.get("filed"),
                    "frame": unit.get("frame"),
                }
            )

    periods: list[NormalizedPeriod] = []
    for (fy, fp), payload in sorted(buckets.items()):
        values = payload["values"]
        if "gross_profit" not in values and values.get("revenue") is not None and values.get("cost_of_revenue") is not None:
            values["gross_profit"] = values["revenue"] - values["cost_of_revenue"]
        if "free_cash_flow" not in values and values.get("operating_cash_flow") is not None and values.get("capital_expenditures") is not None:
            values["free_cash_flow"] = values["operating_cash_flow"] + values["capital_expenditures"]
        short = values.get("short_term_debt") or 0
        long = values.get("long_term_debt") or 0
        if short or long:
            values["total_debt"] = short + long
        periods.append(
            NormalizedPeriod(
                ticker=ticker.upper(),
                cik=cik,
                fiscal_year=fy,
                fiscal_period=fp,
                form=meta[(fy, fp)].get("form"),
                filed=meta[(fy, fp)].get("filed"),
                frame=meta[(fy, fp)].get("frame"),
                statements={**values, "raw_values_json": json.dumps(payload["raw"], sort_keys=True)},
            )
        )
    return periods
