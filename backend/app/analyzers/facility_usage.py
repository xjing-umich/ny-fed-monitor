from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd

from ..services.nyfed_client import NYFedClient
from ..services.chart_service import format_y_axis_units, normalize_time_series_df, save_chart, setup_time_axis


FACILITY_URL = "https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json"


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _to_float(value: Any) -> float | None:
    if value in (None, "", "*", "null", "NA", "N/A"):
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _safe_write_json(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass


def _to_date_str(value: Any) -> str | None:
    if value in (None, "", "null"):
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%Y/%m/%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text[: len(fmt)], fmt).date().isoformat()
        except ValueError:
            continue
    return text[:10] if len(text) >= 10 else text


def _business_days_between(start: date, end: date) -> int:
    if end <= start:
        return 0
    days = 0
    current = start
    while current < end:
        current += timedelta(days=1)
        if current.weekday() < 5:
            days += 1
    return days


def _freshness_status(data_date: str | None) -> str:
    if not data_date:
        return "Missing"
    try:
        as_of = datetime.strptime(data_date, "%Y-%m-%d").date()
    except ValueError:
        return "Missing"
    return "Fresh" if _business_days_between(as_of, date.today()) <= 2 else "Stale"


def _format_dollars(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    sign = "-" if value < 0 else ""
    abs_value = abs(value)
    if abs_value == 0:
        return f"{sign}$0"
    if abs_value >= 1_000_000_000_000:
        return f"{sign}${abs_value / 1_000_000_000_000:.2f} trillion"
    if abs_value >= 1_000_000_000:
        return f"{sign}${abs_value / 1_000_000_000:.1f} billion"
    if abs_value >= 1_000_000:
        return f"{sign}${abs_value / 1_000_000:.1f} million"
    return f"{sign}${abs_value:.2f}"


def _format_change(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    prefix = "+" if value > 0 else ""
    return f"{prefix}{_format_dollars(value)}"


def _find_record_lists(payload: Any) -> list[list[dict[str, Any]]]:
    lists: list[list[dict[str, Any]]] = []

    def visit(node: Any) -> None:
        if isinstance(node, list):
            if node and all(isinstance(item, dict) for item in node):
                lists.append(node)
            for item in node:
                visit(item)
        elif isinstance(node, dict):
            for value in node.values():
                visit(value)

    visit(payload)
    return lists


def _looks_like_operation(record: dict[str, Any]) -> bool:
    keys = {str(key).lower() for key in record.keys()}
    return any("operation" in key or "accepted" in key or "submitted" in key or "counterparty" in key for key in keys)


def _pick_operation_records(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    candidate_lists = _find_record_lists(payload)
    best: list[dict[str, Any]] = []
    best_score = -1
    for candidate in candidate_lists:
        score = sum(1 for row in candidate if _looks_like_operation(row))
        if score > best_score:
            best_score = score
            best = candidate
    if not best:
        warnings.append("Unexpected facility usage JSON structure: no operation records found.")
    return best, warnings


def _lower_dict(record: dict[str, Any]) -> dict[str, Any]:
    return {str(key).lower(): value for key, value in record.items()}


def _get_first(record: dict[str, Any], *keys: str) -> Any:
    lowered = _lower_dict(record)
    for key in keys:
        if key.lower() in lowered:
            return lowered[key.lower()]
    return None


def _is_small_value_exercise(text: str) -> bool:
    lowered = text.lower()
    return (
        "small value" in lowered
        or "small-value" in lowered
        or "exercise" in lowered
    )


def _classify_facility(operation_type: str, description: str) -> tuple[str, str]:
    op = operation_type.lower()
    desc = description.lower()
    if "reverse" in op or "rrp" in op or "reverse repo" in desc:
        return "ON RRP", "reverse_repo"
    if "repo" in op or "standing repo" in desc or "srp" in desc or "srf" in desc:
        return "Repo / SRP", "repo"
    return "Unavailable", "unknown"


def fetch_facility_usage(client: NYFedClient | None = None) -> tuple[dict[str, Any], list[str]]:
    client = client or NYFedClient()
    try:
        payload = client.get_json(FACILITY_URL, save_raw=True)
        return payload, list(client.warnings)
    except RuntimeError as exc:
        return {}, [str(exc), *client.warnings]


def inspect_facility_json(payload: dict[str, Any]) -> dict[str, Any]:
    top_level_keys = list(payload.keys()) if isinstance(payload, dict) else []
    record_lists = _find_record_lists(payload)
    sample_record = record_lists[0][0] if record_lists and record_lists[0] else {}
    audit = {
        "top_level_keys": top_level_keys,
        "record_list_count": len(record_lists),
        "largest_record_list_size": max((len(items) for items in record_lists), default=0),
        "sample_record_keys": list(sample_record.keys()) if isinstance(sample_record, dict) else [],
        "sample_record": sample_record,
    }
    _safe_write_json(_project_root() / "data" / "processed" / "facility_usage_structure_audit.json", audit)
    return audit


def normalize_facility_usage(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    inspect_facility_json(payload)
    records, detect_warnings = _pick_operation_records(payload)
    warnings.extend(detect_warnings)
    normalized: list[dict[str, Any]] = []
    for record in records:
        operation_type = str(_get_first(record, "operationType", "operation_type", "operation", "tradeType", "operationName") or "")
        description = str(_get_first(record, "description", "operationDescription", "opDesc", "statement") or "")
        facility, normalized_type = _classify_facility(operation_type, description)
        merged_text = f"{operation_type} {description}".strip()
        accepted_amount = _to_float(
            _get_first(record, "acceptedAmt", "acceptedAmount", "totalAccepted", "accepted", "totalAmtAccepted")
        )
        submitted_amount = _to_float(
            _get_first(record, "submittedAmt", "submittedAmount", "totalSubmitted", "submitted", "totalAmtSubmitted")
        )
        rate = _to_float(
            _get_first(
                record,
                "awardRate",
                "operationRate",
                "rate",
                "stopOutRate",
                "percentAwardRate",
                "percentStopOutRate",
                "percentHighRate",
                "minimumBidRate",
            )
        )
        counterparty_count = _to_float(
            _get_first(record, "counterpartyCount", "numberOfCounterparties", "participantCount", "participatingCpty", "acceptedCpty")
        )
        details = _get_first(record, "details")
        security_type = None
        if isinstance(details, list):
            non_zero_types = [item.get("securityType") for item in details if _to_float(item.get("amtAccepted")) not in (None, 0)]
            security_type = ", ".join(str(item) for item in non_zero_types if item) if non_zero_types else None
        normalized.append(
            {
                "date": _to_date_str(_get_first(record, "operationDate", "date", "tradeDate", "operation_date", "submissionDate")),
                "facility": facility,
                "operation_type": normalized_type,
                "accepted_amount": accepted_amount,
                "submitted_amount": submitted_amount,
                "rate": rate,
                "counterparty_count": counterparty_count,
                "security_type": security_type or _get_first(record, "securityType", "collateralType", "security_type"),
                "maturity_date": _to_date_str(_get_first(record, "maturityDate", "maturity_date")),
                "description": description or operation_type or "Unavailable",
                "is_small_value_exercise": _is_small_value_exercise(merged_text),
                "raw": record,
            }
        )
    if normalized and all(row["facility"] == "Unavailable" for row in normalized):
        warnings.append("Facility records were found, but repo vs reverse-repo classification was inconclusive.")
    if normalized and all(row.get("accepted_amount") is None for row in normalized):
        warnings.append("Facility records were parsed, but accepted amounts could not be mapped from the payload.")
    return normalized, warnings


def _series(rows: list[dict[str, Any]], facility_name: str, include_small_value: bool = False) -> list[dict[str, Any]]:
    subset = [
        row
        for row in rows
        if row.get("facility") == facility_name
        and row.get("date")
        and row.get("accepted_amount") is not None
        and (include_small_value or not row.get("is_small_value_exercise"))
    ]
    return sorted(subset, key=lambda item: item["date"])


def _closest_value_change(series: list[dict[str, Any]], days: int) -> tuple[float | None, str | None]:
    if len(series) < 2:
        return None, "Limited sample"
    latest = series[-1]
    latest_date = datetime.strptime(latest["date"], "%Y-%m-%d").date()
    target = latest_date - timedelta(days=days)
    prior = None
    best_distance = None
    for row in series[:-1]:
        try:
            row_date = datetime.strptime(row["date"], "%Y-%m-%d").date()
        except ValueError:
            continue
        distance = abs((row_date - target).days)
        if best_distance is None or distance < best_distance:
            best_distance = distance
            prior = row
    if prior is None:
        return None, "Unavailable"
    return latest["accepted_amount"] - prior["accepted_amount"], None


def _on_rrp_cash_buffer_label(series: list[dict[str, Any]]) -> str:
    if len(series) < 5:
        return "Limited sample"
    values = sorted(row["accepted_amount"] for row in series if row.get("accepted_amount") is not None)
    if not values:
        return "Unavailable"
    latest = series[-1]["accepted_amount"]
    below = sum(1 for value in values if value <= latest)
    percentile = below / len(values) * 100
    if percentile > 75:
        return "High"
    if percentile >= 25:
        return "Moderate"
    return "Low-Watch"


def _repo_active_label(series: list[dict[str, Any]]) -> str:
    if not series:
        return "Inactive"
    latest = series[-1]
    amount = latest.get("accepted_amount")
    if amount in (None, 0):
        return "Inactive"
    if latest.get("is_small_value_exercise"):
        return "Small value exercise only"
    return "Active"


def _sample_window_text(rows: list[dict[str, Any]]) -> str:
    dates = sorted({row.get("date") for row in rows if row.get("date")})
    if not dates:
        return "Unavailable"
    if len(dates) == 1:
        return dates[0]
    return f"{dates[0]} to {dates[-1]}"


def _sofr_effr_bps(reference_rates_section: dict[str, Any]) -> float | None:
    metric = next((item for item in reference_rates_section.get("key_metrics", []) if item.get("label") == "SOFR-EFFR"), None)
    if not metric:
        return None
    raw = str(metric.get("value", "")).replace("bps", "").strip()
    try:
        return float(raw)
    except ValueError:
        return None


def _generate_chart(series: list[dict[str, Any]], title: str, output_name: str, ylabel: str = "billion dollars") -> str | None:
    if len(series) < 3:
        return None
    assets_dir = _project_root() / "data" / "reports" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    output_path = assets_dir / output_name
    df = normalize_time_series_df(pd.DataFrame(series), "date", ["accepted_amount"])
    if df.empty:
        return None

    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=140)
    marker = None if len(df) > 80 else "o"
    ax.plot(
        df["date"],
        df["accepted_amount"] / 1_000_000_000,
        linewidth=1.8,
        marker=marker,
        markersize=2.5 if marker else None,
    )
    ax.set_title(title)
    format_y_axis_units(ax, "billions")
    ax.grid(True, alpha=0.25)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    setup_time_axis(ax)
    try:
        save_chart(fig, output_path)
        return f"/assets/{output_name}"
    except OSError:
        return None
    finally:
        plt.close(fig)


def build_facility_usage_section(reference_rates_section: dict[str, Any]) -> dict[str, Any]:
    payload, warnings = fetch_facility_usage()
    if not payload:
        return {
            "title": "Money Market Facilities: ON RRP and SRP",
            "title_zh": "资金工具 ON RRP / SRP",
            "mode": "unavailable",
            "status": "unavailable",
            "source": "nyfed_repo_reverse_repo",
            "freshness_status": "Unavailable",
            "expected_update_frequency": "daily",
            "data_date": None,
            "summary": "Facility usage data unavailable.",
            "summary_zh": "Facility usage 数据当前不可用。",
            "interpretation": "Facility usage data unavailable.",
            "interpretation_zh": "Facility usage 数据当前不可用。",
            "why_it_matters": "Facility usage helps distinguish between high repo financing usage and actual demand for Fed backstop liquidity.",
            "why_it_matters_zh": "这些工具的使用情况有助于区分 repo financing 使用量偏高与真正需要 Fed 流动性支持之间的差别。",
            "key_metrics": [
                {"label": "ON RRP Latest Usage", "label_zh": "ON RRP 最新使用量 ON RRP Latest Usage", "value": "Unavailable", "unit": ""},
                {"label": "ON RRP Recent Change", "label_zh": "ON RRP 近期变化 ON RRP Recent Change", "value": "Unavailable", "unit": ""},
                {"label": "ON RRP Cash Buffer Label", "label_zh": "现金缓冲标签 Cash Buffer Label", "value": "Unavailable", "unit": ""},
                {"label": "Repo / SRP Latest Usage", "label_zh": "Repo / SRP 最新使用量 Repo / SRP Latest Usage", "value": "Unavailable", "unit": ""},
                {"label": "Repo / SRP Active Label", "label_zh": "Repo / SRP 状态 Repo / SRP Active Label", "value": "Unavailable", "unit": ""},
                {"label": "Facility Usage Signal", "label_zh": "资金工具信号 Facility Usage Signal", "value": "Unavailable", "unit": ""},
                {"label": "Sample Window", "label_zh": "样本窗口 Sample Window", "value": "Unavailable", "unit": ""},
            ],
            "tables": [],
            "warnings": warnings or ["Facility usage data unavailable."],
            "signals": ["Endpoint unavailable or response parsing failed."],
            "data_note": "First version uses NY Fed lastTwoWeeks repo/reverse repo operations data, so historical percentile is limited.",
            "data_note_zh": "第一版使用 NY Fed 最近两周 repo / reverse repo operations 数据，因此历史分位数有限。",
            "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
        }

    rows, normalize_warnings = normalize_facility_usage(payload)
    warnings.extend(normalize_warnings)
    on_rrp_series = _series(rows, "ON RRP")
    repo_series = _series(rows, "Repo / SRP", include_small_value=True)

    on_rrp_latest = on_rrp_series[-1]["accepted_amount"] if on_rrp_series else None
    repo_latest = repo_series[-1]["accepted_amount"] if repo_series else None
    on_rrp_1w, on_rrp_1w_warning = _closest_value_change(on_rrp_series, 7)
    on_rrp_2w, on_rrp_2w_warning = _closest_value_change(on_rrp_series, 14)
    if on_rrp_1w_warning and on_rrp_1w_warning != "Limited sample":
        warnings.append(f"ON RRP 1-week change: {on_rrp_1w_warning}")
    if on_rrp_2w_warning and on_rrp_2w_warning != "Limited sample":
        warnings.append(f"ON RRP 2-week change: {on_rrp_2w_warning}")

    on_rrp_cash_buffer = _on_rrp_cash_buffer_label(on_rrp_series)
    repo_label = _repo_active_label(repo_series)
    latest_repo_is_small = bool(repo_series and repo_series[-1].get("is_small_value_exercise"))
    sofr_effr_bps = _sofr_effr_bps(reference_rates_section)

    facility_signal = "Normal"
    if len(on_rrp_series) < 3 and len(repo_series) < 3:
        facility_signal = "Limited sample"
    elif repo_label == "Active" and sofr_effr_bps is not None and sofr_effr_bps > 10:
        facility_signal = "Elevated"
    elif on_rrp_cash_buffer == "Low-Watch" or repo_label in {"Active", "Small value exercise only"}:
        facility_signal = "Watch"
    elif on_rrp_cash_buffer == "Limited sample":
        facility_signal = "Limited sample"

    data_date_candidates = [series[-1]["date"] for series in [on_rrp_series, repo_series] if series]
    data_date = max(data_date_candidates) if data_date_candidates else None
    sample_window = _sample_window_text(rows)

    on_rrp_chart = _generate_chart(on_rrp_series, "ON RRP Usage", "on_rrp_usage.png")
    repo_chart = _generate_chart(repo_series, "Repo / SRP Usage", "repo_srp_usage.png")
    chart_urls = [url for url in [on_rrp_chart, repo_chart] if url]

    recent_rows = []
    for row in sorted(rows, key=lambda item: item.get("date") or "", reverse=True)[:10]:
        recent_rows.append(
            {
                "Date": row.get("date") or "Unavailable",
                "Facility": row.get("facility") or "Unavailable",
                "Operation type": row.get("description") or row.get("operation_type") or "Unavailable",
                "Accepted amount": _format_dollars(row.get("accepted_amount")),
                "Rate": "Unavailable" if row.get("rate") is None else f"{row.get('rate'):.2f}%",
                "Counterparty count": "Unavailable" if row.get("counterparty_count") is None else str(int(row.get("counterparty_count"))),
                "Small value exercise": "Yes" if row.get("is_small_value_exercise") else "No",
            }
        )
    full_rows = []
    for row in sorted(rows, key=lambda item: item.get("date") or "", reverse=True):
        full_rows.append(
            {
                "Date": row.get("date") or "Unavailable",
                "Facility": row.get("facility") or "Unavailable",
                "Operation type": row.get("description") or row.get("operation_type") or "Unavailable",
                "Accepted amount": _format_dollars(row.get("accepted_amount")),
                "Submitted amount": _format_dollars(row.get("submitted_amount")),
                "Rate": "Unavailable" if row.get("rate") is None else f"{row.get('rate'):.2f}%",
                "Counterparty count": "Unavailable" if row.get("counterparty_count") is None else str(int(row.get("counterparty_count"))),
                "Small value exercise": "Yes" if row.get("is_small_value_exercise") else "No",
                "Security type": row.get("security_type") or "Unavailable",
            }
        )

    section = {
        "title": "Money Market Facilities: ON RRP and SRP",
        "title_zh": "资金工具 ON RRP / SRP",
        "mode": "live",
        "status": "available",
        "source": "nyfed_repo_reverse_repo",
        "freshness_status": _freshness_status(data_date),
        "expected_update_frequency": "daily",
        "data_date": data_date,
        "summary": f"Facility Usage Signal is {facility_signal}. ON RRP latest usage is {_format_dollars(on_rrp_latest)}.",
        "summary_zh": f"Facility Usage Signal 当前为 {facility_signal}。ON RRP 最新使用量为 {_format_dollars(on_rrp_latest)}。",
        "interpretation": (
            "ON RRP usage measures how much cash money-market participants place at the Fed overnight. "
            "Lower ON RRP usage may indicate that the system’s excess cash buffer has declined, but it does not necessarily indicate stress by itself.\n\n"
            "Repo / SRP usage measures demand for the Fed’s repo backstop. Positive or rising usage may indicate that some eligible counterparties are using Fed liquidity to meet repo funding needs."
        ),
        "interpretation_zh": (
            "ON RRP 使用量表示货币市场参与者隔夜放在 Fed 的现金规模。ON RRP 下降可能说明系统多余现金缓冲减少，但单独下降并不一定代表资金压力。\n\n"
            "Repo / SRP 使用量表示市场对 Fed 回购工具的需求。使用量为正或上升，可能说明部分合格机构正在使用 Fed 流动性来满足 repo funding needs。"
        ),
        "why_it_matters": "Facility usage helps distinguish between high repo financing usage and actual demand for Fed backstop liquidity.",
        "why_it_matters_zh": "这些工具的使用情况有助于区分 repo financing 使用量偏高与真正需要 Fed 流动性支持之间的差别。",
        "key_metrics": [
            {"label": "ON RRP Latest Usage", "label_zh": "ON RRP 最新使用量 ON RRP Latest Usage", "value": _format_dollars(on_rrp_latest), "unit": ""},
            {"label": "ON RRP Recent Change", "label_zh": "ON RRP 近期变化 ON RRP Recent Change", "value": _format_change(on_rrp_1w if on_rrp_1w is not None else on_rrp_2w), "unit": ""},
            {"label": "ON RRP Cash Buffer Label", "label_zh": "现金缓冲标签 Cash Buffer Label", "value": on_rrp_cash_buffer, "unit": ""},
            {"label": "Repo / SRP Latest Usage", "label_zh": "Repo / SRP 最新使用量 Repo / SRP Latest Usage", "value": _format_dollars(repo_latest), "unit": ""},
            {"label": "Repo / SRP Active Label", "label_zh": "Repo / SRP 状态 Repo / SRP Active Label", "value": repo_label, "unit": ""},
            {"label": "Facility Usage Signal", "label_zh": "资金工具信号 Facility Usage Signal", "value": facility_signal, "unit": ""},
            {"label": "Sample Window", "label_zh": "样本窗口 Sample Window", "value": sample_window, "unit": ""},
        ],
        "signals": [
            "Small value exercises are labeled separately and are not treated as funding stress by themselves."
            if any(row.get("is_small_value_exercise") for row in rows)
            else "No small value exercise flag detected in recent operations.",
            f"Reference SOFR-EFFR spread: {sofr_effr_bps:+.1f} bps" if sofr_effr_bps is not None else "Reference SOFR-EFFR spread unavailable.",
        ],
        "warnings": warnings,
        "tables": [
            {
                "title": "Recent Facility Operations",
                "title_zh": "近期 Facility Operations",
                "columns": list(recent_rows[0].keys()) if recent_rows else [],
                "rows": recent_rows,
            },
            {
                "title": "Full Facility Operations",
                "title_zh": "完整 Facility Operations",
                "columns": list(full_rows[0].keys()) if full_rows else [],
                "rows": full_rows,
            }
        ],
        "data_note": "First version uses NY Fed lastTwoWeeks repo/reverse repo operations data, so historical percentile is limited.",
        "data_note_zh": "第一版使用 NY Fed 最近两周 repo / reverse repo operations 数据，因此历史分位数有限。",
        "chart_urls": chart_urls,
        "chart_url": chart_urls[0] if chart_urls else None,
        "normalized_data": rows,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
        "latest_repo_is_small_value_exercise": latest_repo_is_small,
    }
    return section


def save_facility_usage_cache(section: dict[str, Any]) -> None:
    cache_dir = _project_root() / "data" / "cache" / "sections"
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / "facility-usage.json"
    try:
        output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")
    except OSError:
        pass
