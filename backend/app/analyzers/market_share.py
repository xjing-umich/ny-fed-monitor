from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

from ..services.freshness_service import compute_freshness_status


QTRLY_URL = "https://markets.newyorkfed.org/api/marketshare/qtrly/latest.json"
YTD_URL = "https://markets.newyorkfed.org/api/marketshare/ytd/latest.json"


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _raw_dir() -> Path:
    path = _project_root() / "data" / "raw"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _processed_dir() -> Path:
    path = _project_root() / "data" / "processed"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _cache_dir() -> Path:
    path = _project_root() / "data" / "cache" / "sections"
    path.mkdir(parents=True, exist_ok=True)
    return path


def _save_json(path: Path, payload: Any) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass


def _to_float(value: Any) -> float | None:
    if value in (None, "", "*", "null", "NA", "N/A"):
        return None
    text = str(value).strip().replace(",", "")
    if text.endswith("%"):
        text = text[:-1]
    try:
        return float(text)
    except (TypeError, ValueError):
        return None


def _format_percent(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    if value <= 1:
        value *= 100
    return f"{value:.1f}%"


def _format_volume_millions(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    dollars = value * 1_000_000
    if dollars >= 1_000_000_000:
        return f"${dollars / 1_000_000_000:.1f} billion"
    return f"${dollars / 1_000_000:.1f} million"


def _parse_date_string(value: Any) -> str | None:
    if value in (None, "", "*", "null"):
        return None
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%m/%d/%Y"):
        try:
            return datetime.strptime(text[: len(fmt)], fmt).date().isoformat()
        except ValueError:
            continue
    return text[:10] if len(text) >= 10 else text


def _extract_json_payload(text: str) -> dict[str, Any]:
    decoder = json.JSONDecoder()
    payload, _ = decoder.raw_decode(text)
    if not isinstance(payload, dict):
        raise ValueError("top-level payload is not an object")
    return payload


def _load_saved_payload(filename: str) -> dict[str, Any] | None:
    path = _raw_dir() / filename
    candidates = []
    if path.exists():
        candidates.append(path)
    stem = filename.replace(".json", "")
    tokens = [token for token in stem.split("_") if token and token not in {"json"}]
    candidates.extend(sorted(_raw_dir().glob(f"*{stem}*.json"), reverse=True))
    if tokens:
        wildcard = "*" + "*".join(tokens) + "*.json"
        candidates.extend(sorted(_raw_dir().glob(wildcard), reverse=True))
    seen: set[str] = set()
    for candidate in candidates:
        key = str(candidate)
        if key in seen:
            continue
        seen.add(key)
        try:
            return json.loads(candidate.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            continue
    return None


def _fetch_or_load(url: str, filename: str) -> tuple[dict[str, Any], list[str]]:
    warnings: list[str] = []
    path = _raw_dir() / filename
    try:
        response = requests.get(url, timeout=30)
        response.raise_for_status()
        payload = _extract_json_payload(response.text)
        _save_json(path, payload)
        return payload, warnings
    except Exception as exc:
        warnings.append(f"request or parse issue for {url}: {exc}")
        saved = _load_saved_payload(filename)
        if saved:
            warnings.append(f"Using saved raw payload from {filename}.")
            return saved, warnings
        return {}, warnings


def fetch_market_share_data() -> tuple[dict[str, Any], dict[str, Any], list[str]]:
    qtrly_payload, qtrly_warnings = _fetch_or_load(QTRLY_URL, "market_share_qtrly_latest.json")
    ytd_payload, ytd_warnings = _fetch_or_load(YTD_URL, "market_share_ytd_latest.json")
    warnings = [*qtrly_warnings, *ytd_warnings]
    if not qtrly_payload and not ytd_payload:
        warnings.append("Market Share API unavailable.")
    return qtrly_payload, ytd_payload, warnings


def _container(payload: dict[str, Any], frequency: str) -> dict[str, Any]:
    return payload.get("pd", {}).get("marketshare", {}).get(frequency, {})


def _list_names(container: dict[str, Any]) -> list[str]:
    return [key for key, value in container.items() if isinstance(value, list)]


def _security_rows(container: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for channel_name in _list_names(container):
        for row in container.get(channel_name, []) or []:
            if isinstance(row, dict):
                rows.append({**row, "__tradeChannel": channel_name})
    return rows


def save_structure_audit(qtrly_raw: dict[str, Any], ytd_raw: dict[str, Any], qtrly_rows: list[dict[str, Any]], ytd_rows: list[dict[str, Any]]) -> None:
    audit = {
        "quarterly_top_level_keys": list(qtrly_raw.keys()) if isinstance(qtrly_raw, dict) else [],
        "ytd_top_level_keys": list(ytd_raw.keys()) if isinstance(ytd_raw, dict) else [],
        "quarterly_container_keys": list(_container(qtrly_raw, "qtrly").keys()) if qtrly_raw else [],
        "ytd_container_keys": list(_container(ytd_raw, "ytd").keys()) if ytd_raw else [],
        "quarterly_record_count": len(qtrly_rows),
        "ytd_record_count": len(ytd_rows),
        "quarterly_first_3_records": qtrly_rows[:3],
        "ytd_first_3_records": ytd_rows[:3],
        "quarterly_field_names": sorted({key for row in qtrly_rows[:20] for key in row.keys()}),
        "ytd_field_names": sorted({key for row in ytd_rows[:20] for key in row.keys()}),
    }
    _save_json(_processed_dir() / "market_share_structure_audit.json", audit)


def normalize_market_share_json(raw_json: dict[str, Any], frequency: str) -> tuple[list[dict[str, Any]], list[str]]:
    warnings: list[str] = []
    container = _container(raw_json, frequency)
    if not container:
        return [], warnings

    rows = _security_rows(container)
    normalized: list[dict[str, Any]] = []
    for row in rows:
        first = _to_float(row.get("percentFirstQuintMktShare") or row.get("first_quintile_market_share") or row.get("firstQuintileMarketShare"))
        second = _to_float(row.get("percentSecondQuintMktShare"))
        third = _to_float(row.get("percentThirdQuintMktShare"))
        fourth = _to_float(row.get("percentFourthQuintMktShare"))
        fifth = _to_float(row.get("percentFifthQuintMktShare"))
        daily_avg = _to_float(
            row.get("dailyAvgVolInMillions")
            or row.get("daily_avg_volume_millions")
            or row.get("dailyAvgVolMillions")
            or row.get("dailyAvgVol")
        )
        release_date = _parse_date_string(container.get("releaseDate") or container.get("period") or container.get("date"))
        security_type = row.get("securityType") or row.get("security_type") or row.get("product") or row.get("sector")
        security = row.get("security") or row.get("instrument") or row.get("instrumentType") or security_type
        trade_channel = row.get("__tradeChannel") or row.get("tradeChannel") or row.get("trade_channel") or row.get("channel")

        normalized.append(
            {
                "frequency": "quarterly" if frequency == "qtrly" else "ytd",
                "period_or_release_date": release_date,
                "security_type": str(security_type) if security_type not in (None, "") else "Unavailable",
                "security": str(security) if security not in (None, "") else "Unavailable",
                "sector": str(security_type) if security_type not in (None, "") else "Unavailable",
                "trade_channel": str(trade_channel) if trade_channel not in (None, "") else "Unavailable",
                "first_quintile_market_share": first,
                "second_quintile_market_share": second,
                "third_quintile_market_share": third,
                "fourth_quintile_market_share": fourth,
                "fifth_quintile_market_share": fifth,
                "daily_avg_volume_millions": daily_avg,
                "raw_record": row,
            }
        )

    if not normalized:
        warnings.append(f"No usable {frequency} market share rows were parsed.")
    return normalized, warnings


def compute_market_share_indicators(records: list[dict[str, Any]]) -> dict[str, Any]:
    usable = [row for row in records if row.get("first_quintile_market_share") is not None]
    if not usable:
        return {
            "max_row": None,
            "latest_date": None,
            "concentration_label": "Unavailable",
            "sparse_category_warning": "Unavailable",
            "warnings": ["No usable market share rows available."],
            "quarterly_row_count": 0,
            "ytd_row_count": 0,
            "normalized_row_count": 0,
        }

    max_row = max(usable, key=lambda row: row.get("first_quintile_market_share") or -1)
    max_share = max_row.get("first_quintile_market_share")
    daily_avg = max_row.get("daily_avg_volume_millions")
    security_text = f"{max_row.get('security', '')} {max_row.get('sector', '')}".upper()

    if max_share is None:
        concentration_label = "Unavailable"
    elif max_share >= 85:
        concentration_label = "Extreme concentration"
    elif max_share >= 65:
        concentration_label = "High concentration"
    elif max_share >= 50:
        concentration_label = "Moderate concentration"
    else:
        concentration_label = "Normal concentration"

    sparse_notes: list[str] = []
    if daily_avg is None or daily_avg < 10:
        sparse_notes.append("High concentration may come from a small or sparse category.")
    if any(token in security_text for token in ["OTHER", "CMBS", "ABS"]):
        sparse_notes.append("This should not be interpreted as broad Treasury market concentration.")

    latest_date = max((row.get("period_or_release_date") for row in usable if row.get("period_or_release_date")), default=None)
    quarterly_row_count = sum(1 for row in usable if row.get("frequency") == "quarterly")
    ytd_row_count = sum(1 for row in usable if row.get("frequency") == "ytd")

    return {
        "max_row": max_row,
        "latest_date": latest_date,
        "concentration_label": concentration_label,
        "sparse_category_warning": " | ".join(sparse_notes) if sparse_notes else "No sparse category warning",
        "warnings": sparse_notes,
        "quarterly_row_count": quarterly_row_count,
        "ytd_row_count": ytd_row_count,
        "normalized_row_count": len(usable),
    }


def _row_label(row: dict[str, Any]) -> str:
    share = row.get("first_quintile_market_share")
    if share is None:
        return "Unavailable"
    if share >= 85:
        return "Extreme"
    if share >= 65:
        return "High"
    if share >= 50:
        return "Moderate"
    return "Normal"


def _sparse_note(row: dict[str, Any]) -> str:
    daily_avg = row.get("daily_avg_volume_millions")
    security_text = f"{row.get('security', '')} {row.get('sector', '')}".upper()
    notes: list[str] = []
    if daily_avg is None or daily_avg < 10:
        notes.append("Sparse / small")
    if any(token in security_text for token in ["OTHER", "CMBS", "ABS"]):
        notes.append("Non-core category")
    return "; ".join(notes)


def _table_rows(records: list[dict[str, Any]], frequency: str) -> list[dict[str, Any]]:
    rows = [
        row for row in records
        if row.get("frequency") == frequency and row.get("first_quintile_market_share") is not None
    ]
    rows = sorted(rows, key=lambda row: row.get("first_quintile_market_share") or -1, reverse=True)
    return [
        {
            "Security / Sector": row.get("security") or row.get("sector") or "Unavailable",
            "Trade Channel": row.get("trade_channel") or "Unavailable",
            "First Quintile Share": _format_percent(row.get("first_quintile_market_share")),
            "Daily Avg Volume": _format_volume_millions(row.get("daily_avg_volume_millions")),
            "Concentration Label": _row_label(row),
            "Sparse Category Note": _sparse_note(row),
        }
        for row in rows[:10]
    ]


def build_market_share_section() -> dict[str, Any]:
    qtrly_raw, ytd_raw, fetch_warnings = fetch_market_share_data()
    qtrly_records, qtrly_warnings = normalize_market_share_json(qtrly_raw, "qtrly")
    ytd_records, ytd_warnings = normalize_market_share_json(ytd_raw, "ytd")
    save_structure_audit(qtrly_raw, ytd_raw, _security_rows(_container(qtrly_raw, "qtrly")), _security_rows(_container(ytd_raw, "ytd")))

    all_records = qtrly_records + ytd_records
    indicators = compute_market_share_indicators(all_records)
    max_row = indicators.get("max_row")
    latest_date = indicators.get("latest_date")
    available_frequencies = []
    if qtrly_records:
        available_frequencies.append("Quarterly")
    if ytd_records:
        available_frequencies.append("YTD")
    mode = "live" if all_records else "unavailable"

    warnings = [*fetch_warnings, *qtrly_warnings, *ytd_warnings, *indicators.get("warnings", [])]

    section = {
        "title": "Market Share and Dealer Concentration",
        "title_zh": "交易商集中度 Market Share",
        "mode": mode,
        "status": "available" if mode == "live" else "unavailable",
        "source": "nyfed_marketshare",
        "freshness_status": compute_freshness_status(latest_date, "quarterly") if latest_date else "Missing",
        "expected_update_frequency": "quarterly",
        "data_date": latest_date,
        "summary": (
            f"Highest first-quintile share is {_format_percent(max_row.get('first_quintile_market_share') if max_row else None)} "
            f"in {max_row.get('security') if max_row else 'Unavailable'}."
        ),
        "summary_zh": (
            f"最高第一五分位份额为 {_format_percent(max_row.get('first_quintile_market_share') if max_row else None)}，"
            f"对应板块 / 券种为 {max_row.get('security') if max_row else 'Unavailable'}。"
        ),
        "interpretation": (
            "Market share data helps monitor whether trading activity is concentrated among the largest primary dealers. "
            "High concentration in a small or sparse category should not be interpreted as broad market stress."
        ),
        "interpretation_zh": (
            "Market Share 数据用于观察交易活动是否集中在少数 primary dealers 手中。"
            "如果最高集中度来自小规模或稀疏类别，不应直接解读为整个市场流动性恶化。"
        ),
        "why_it_matters": "Higher dealer concentration may suggest that market activity depends more heavily on fewer balance sheets.",
        "why_it_matters_zh": "更高的 dealer concentration 可能说明市场活动更依赖少数交易商的 balance sheet。",
        "key_metrics": [
            {
                "label": "Max First-Quintile Share",
                "label_zh": "最高第一五分位份额 Max First-Quintile Share",
                "value": _format_percent(max_row.get("first_quintile_market_share") if max_row else None),
                "unit": "",
            },
            {
                "label": "Sector",
                "label_zh": "最高集中度板块 Sector",
                "value": max_row.get("security") if max_row else "Unavailable",
                "unit": "",
            },
            {
                "label": "Trade Channel",
                "label_zh": "交易渠道 Trade Channel",
                "value": max_row.get("trade_channel") if max_row else "Unavailable",
                "unit": "",
            },
            {
                "label": "Daily Avg Volume",
                "label_zh": "日均成交量 Daily Avg Volume",
                "value": _format_volume_millions(max_row.get("daily_avg_volume_millions") if max_row else None),
                "unit": "",
            },
            {
                "label": "Concentration Label",
                "label_zh": "集中度标签 Concentration Label",
                "value": indicators.get("concentration_label", "Unavailable"),
                "unit": "",
            },
            {
                "label": "Sparse Category Warning",
                "label_zh": "稀疏类别提示 Sparse Category Warning",
                "value": indicators.get("sparse_category_warning", "Unavailable"),
                "unit": "",
            },
            {
                "label": "Data Frequency Available",
                "label_zh": "可用频率 Data Frequency Available",
                "value": " / ".join(available_frequencies) if available_frequencies else "Unavailable",
                "unit": "",
            },
        ],
        "tables": [
            {
                "title": "Quarterly Market Share Summary",
                "title_zh": "Quarterly Market Share Summary",
                "columns": ["Security / Sector", "Trade Channel", "First Quintile Share", "Daily Avg Volume", "Concentration Label", "Sparse Category Note"],
                "rows": _table_rows(all_records, "quarterly"),
            },
            {
                "title": "YTD Market Share Summary",
                "title_zh": "YTD Market Share Summary",
                "columns": ["Security / Sector", "Trade Channel", "First Quintile Share", "Daily Avg Volume", "Concentration Label", "Sparse Category Note"],
                "rows": _table_rows(all_records, "ytd"),
            },
        ],
        "signals": [
            "High concentration in a sparse category should not be generalized to the full Treasury market.",
            "Quarterly and YTD summaries are shown separately when available.",
        ],
        "warnings": warnings,
        "normalized_data": all_records,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
        "endpoints": {
            "quarterly": QTRLY_URL,
            "ytd": YTD_URL,
        },
        "debug": {
            "market_share_raw_top_level_keys": {
                "quarterly": list(qtrly_raw.keys()) if qtrly_raw else [],
                "ytd": list(ytd_raw.keys()) if ytd_raw else [],
            },
            "market_share_quarterly_row_count": indicators.get("quarterly_row_count", 0),
            "market_share_ytd_row_count": indicators.get("ytd_row_count", 0),
            "market_share_normalized_row_count": indicators.get("normalized_row_count", 0),
            "market_share_selected_max_row": max_row,
            "market_share_warnings": warnings,
        },
    }
    return section


def save_market_share_cache(section: dict[str, Any]) -> None:
    output_path = _cache_dir() / "market-share.json"
    try:
        output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")
    except OSError:
        pass
