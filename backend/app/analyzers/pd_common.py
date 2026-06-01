from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
import yaml

from ..services.nyfed_client import NYFedClient
from ..services.chart_service import format_y_axis_units, normalize_time_series_df, save_chart, setup_time_axis


PD_LATEST_URL = "https://markets.newyorkfed.org/api/pd/latest/SBN2024.json"
PD_METADATA_URL = "https://markets.newyorkfed.org/api/pd/list/timeseries.json"

SERIES_DEFINITIONS = {
    "dealer-inventory": {
        "keyid": "PDPOSGST-TOT",
        "title": "Dealer Inventory",
        "title_zh": "交易商库存 Dealer Inventory",
        "metric_label": "Pressure Label",
        "metric_label_zh": "库存压力 Pressure Label",
        "chart_name": "dealer_inventory.png",
        "description_hint": "Total U.S. Treasury securities excluding TIPS dealer position long minus short.",
    },
    "transactions": {
        "keyid": "PDGSWOEXTTOT",
        "title": "Transactions and Liquidity",
        "title_zh": "成交与流动性 Transactions / Liquidity",
        "metric_label": "Activity Direction",
        "metric_label_zh": "成交方向 Activity Direction",
        "chart_name": "transactions.png",
        "description_hint": "Total U.S. Treasury securities excluding TIPS dealer transactions with inter-dealer brokers plus transactions with others.",
    },
    "repo-financing": {
        "keyid": "PDSORA-UTSETTOT",
        "title": "Repo Financing",
        "title_zh": "回购融资 Repo Financing",
        "metric_label": "Usage Label",
        "metric_label_zh": "使用标签 Usage Label",
        "chart_name": "repo_financing.png",
        "description_hint": "Total Repurchase Agreements: U.S. Treasury securities excluding TIPS.",
    },
    "fails-deliver": {
        "keyid": "PDFTD-USTET",
        "title": "Fails Deliver",
        "title_zh": "Fails to Deliver",
        "chart_name": "fails.png",
        "description_hint": "Fails to Deliver: U.S. Treasury securities excluding TIPS.",
    },
    "fails-receive": {
        "keyid": "PDFTR-USTET",
        "title": "Fails Receive",
        "title_zh": "Fails to Receive",
        "chart_name": "fails.png",
        "description_hint": "Fails to Receive: U.S. Treasury securities excluding TIPS.",
    },
    "long-end-inventory": {
        "keyid": "PDPOSGSC-G7L11",
        "title": "Long-end Inventory",
        "title_zh": "长端库存",
        "chart_name": "dealer_inventory.png",
        "description_hint": "Treasury coupons due in more than 7 years but less than or equal to 11 years net dealer position.",
    },
}


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_config() -> dict[str, Any]:
    config_path = _project_root() / "config.yaml"
    if not config_path.exists():
        return {}
    return yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}


def _to_float(value: Any) -> float | None:
    if value in (None, "", "*"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def format_millions_to_readable(value: float | None, decimals: int = 1) -> str:
    if value is None:
        return "Unavailable"
    sign = "-" if value < 0 else ""
    abs_value = abs(value)
    if abs_value >= 1_000_000:
        return f"{sign}${abs_value / 1_000_000:.1f} trillion"
    if abs_value >= 1_000:
        return f"{sign}${abs_value / 1_000:.1f} billion"
    return f"{sign}${abs_value:.{decimals}f} million"


def format_change_millions(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    prefix = "+" if value > 0 else ""
    return f"{prefix}{format_millions_to_readable(value)}"


def _freshness_status(data_date: str | None) -> str:
    if not data_date:
        return "Missing"
    try:
        as_of = datetime.strptime(data_date, "%Y-%m-%d").date()
    except ValueError:
        return "Missing"
    age = (date.today() - as_of).days
    if age <= 8:
        return "Fresh"
    if age <= 14:
        return "Stale"
    return "Old"


def fetch_metadata(client: NYFedClient | None = None) -> tuple[dict[str, str], list[str]]:
    client = client or NYFedClient()
    warnings: list[str] = []
    try:
        payload = client.get_json(PD_METADATA_URL, save_raw=True)
    except RuntimeError as exc:
        return {}, [str(exc)]
    lookup = {}
    for item in payload.get("pd", {}).get("timeseries", []):
        keyid = item.get("keyid")
        if keyid:
            lookup[keyid] = item.get("description", "")
    warnings.extend(client.warnings)
    return lookup, warnings


def fetch_history_for_keyid(keyid: str, client: NYFedClient | None = None) -> tuple[list[dict[str, Any]], list[str]]:
    client = client or NYFedClient()
    warnings: list[str] = []
    url = f"https://markets.newyorkfed.org/api/pd/get/{keyid}.json"
    try:
        payload = client.get_json(url, save_raw=True)
    except RuntimeError as exc:
        return [], [str(exc)]
    rows = []
    for item in payload.get("pd", {}).get("timeseries", []):
        rows.append(
            {
                "date": item.get("asofdate"),
                "keyid": item.get("keyid", keyid),
                "value": _to_float(item.get("value")),
                "source": "nyfed_pd_get",
            }
        )
    warnings.extend(client.warnings)
    return rows, warnings


def fetch_latest_pd_snapshot(client: NYFedClient | None = None) -> tuple[list[dict[str, Any]], list[str]]:
    client = client or NYFedClient()
    warnings: list[str] = []
    try:
        payload = client.get_json(PD_LATEST_URL, save_raw=True)
    except RuntimeError as exc:
        return [], [str(exc)]
    rows = []
    for item in payload.get("pd", {}).get("timeseries", []):
        rows.append(
            {
                "date": item.get("asofdate"),
                "keyid": item.get("keyid"),
                "value": _to_float(item.get("value")),
                "source": "nyfed_pd_latest",
            }
        )
    warnings.extend(client.warnings)
    return rows, warnings


def _closest_record(series: list[dict[str, Any]], target_date: date) -> dict[str, Any] | None:
    dated = []
    for row in series:
        try:
            row_date = datetime.strptime(row["date"], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        dated.append((abs((row_date - target_date).days), row_date, row))
    if not dated:
        return None
    dated.sort(key=lambda item: (item[0], item[1]))
    return dated[0][2]


def _change_from_weeks(series: list[dict[str, Any]], weeks: int) -> tuple[float | None, str | None]:
    if not series:
        return None, "No observations available."
    latest = series[-1]
    try:
        latest_date = datetime.strptime(latest["date"], "%Y-%m-%d").date()
    except ValueError:
        return None, "Latest date is invalid."
    prior = _closest_record(series[:-1] or series, latest_date - timedelta(weeks=weeks))
    if prior is None or prior.get("value") is None or latest.get("value") is None:
        return None, f"No nearby observation found for {weeks}-week change."
    return latest["value"] - prior["value"], None


def _rolling_zscore(series: list[dict[str, Any]], window: int = 52) -> float | None:
    values = [row["value"] for row in series if row.get("value") is not None]
    if len(values) < 2:
        return None
    sample = values[-window:] if len(values) >= window else values
    mean = sum(sample) / len(sample)
    variance = sum((value - mean) ** 2 for value in sample) / len(sample)
    std = variance ** 0.5
    if std == 0:
        return 0.0
    return (sample[-1] - mean) / std


def _historical_percentile(series: list[dict[str, Any]]) -> str:
    values = [row["value"] for row in series if row.get("value") is not None]
    if len(values) < 52:
        return "Limited sample"
    latest = values[-1]
    less_or_equal = sum(1 for value in values if value <= latest)
    percentile = less_or_equal / len(values) * 100
    return f"{percentile:.1f}%"


def _chart_url(section_name: str) -> str:
    return f"/assets/{SERIES_DEFINITIONS[section_name]['chart_name']}"


def _generate_single_series_chart(section_name: str, series: list[dict[str, Any]]) -> str | None:
    if len(series) < 10:
        return None
    assets_dir = _project_root() / "data" / "reports" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    output_path = assets_dir / SERIES_DEFINITIONS[section_name]["chart_name"]
    df = normalize_time_series_df(pd.DataFrame(series), "date", ["value"])
    if df.empty:
        return None

    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=140)
    marker = None if len(df) > 80 else "o"
    ax.plot(df["date"], df["value"] / 1_000, linewidth=1.8, marker=marker, markersize=2.5 if marker else None)
    ax.set_title(SERIES_DEFINITIONS[section_name]["title"])
    format_y_axis_units(ax, "billions")
    ax.grid(True, alpha=0.25)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    setup_time_axis(ax)
    try:
        save_chart(fig, output_path)
        return _chart_url(section_name)
    except OSError:
        return None
    finally:
        plt.close(fig)


def _generate_fails_chart(deliver_series: list[dict[str, Any]], receive_series: list[dict[str, Any]]) -> str | None:
    if len(deliver_series) < 10 or len(receive_series) < 10:
        return None
    assets_dir = _project_root() / "data" / "reports" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    output_path = assets_dir / "fails.png"
    deliver_df = normalize_time_series_df(pd.DataFrame(deliver_series), "date", ["value"])
    receive_df = normalize_time_series_df(pd.DataFrame(receive_series), "date", ["value"])
    if deliver_df.empty or receive_df.empty:
        return None

    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=140)
    marker = None if max(len(deliver_df), len(receive_df)) > 80 else "o"
    ax.plot(
        deliver_df["date"],
        deliver_df["value"] / 1_000,
        label="Fails to Deliver",
        linewidth=1.8,
        marker=marker,
        markersize=2.5 if marker else None,
    )
    ax.plot(
        receive_df["date"],
        receive_df["value"] / 1_000,
        label="Fails to Receive",
        linewidth=1.8,
        marker=marker,
        markersize=2.5 if marker else None,
    )
    ax.set_title("Fails to Deliver and Receive")
    format_y_axis_units(ax, "billions")
    ax.grid(True, alpha=0.25)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(frameon=False, loc="upper right")
    setup_time_axis(ax)
    try:
        save_chart(fig, output_path)
        return "/assets/fails.png"
    except OSError:
        return None
    finally:
        plt.close(fig)


def build_single_series_section(
    section_name: str,
    interpretation: str,
    interpretation_zh: str,
    why_it_matters: str,
    why_it_matters_zh: str,
    label_func,
) -> dict[str, Any]:
    series_meta = SERIES_DEFINITIONS[section_name]
    metadata, meta_warnings = fetch_metadata()
    history_rows, history_warnings = fetch_history_for_keyid(series_meta["keyid"])
    latest_rows, latest_warnings = fetch_latest_pd_snapshot()
    warnings = meta_warnings + history_warnings + latest_warnings

    latest_snapshot = next((row for row in latest_rows if row.get("keyid") == series_meta["keyid"]), None)
    series = [row for row in history_rows if row.get("value") is not None and row.get("date")]
    series.sort(key=lambda row: row["date"])
    if latest_snapshot and latest_snapshot.get("value") is not None and latest_snapshot.get("date"):
        if not series or latest_snapshot["date"] > series[-1]["date"]:
            series.append(latest_snapshot)

    latest = series[-1] if series else None
    one_week, warn = _change_from_weeks(series, 1)
    if warn:
        warnings.append(warn)
    four_week, warn = _change_from_weeks(series, 4)
    if warn:
        warnings.append(warn)
    thirteen_week, warn = _change_from_weeks(series, 13)
    if warn:
        warnings.append(warn)

    percentile = _historical_percentile(series)
    zscore = _rolling_zscore(series)
    label_value = label_func(percentile=percentile, one_week_change=one_week, four_week_change=four_week, series=series)
    chart_url = _generate_single_series_chart(section_name, series)
    description = metadata.get(series_meta["keyid"], series_meta["description_hint"])

    return {
        "title": series_meta["title"],
        "title_zh": series_meta["title_zh"],
        "mode": "live",
        "status": "available",
        "source": "nyfed",
        "freshness_status": _freshness_status(latest.get("date") if latest else None),
        "expected_update_frequency": "weekly",
        "data_date": latest.get("date") if latest else None,
        "summary": (
            f"Latest level is {format_millions_to_readable(latest.get('value') if latest else None)}; "
            f"{series_meta['metric_label']} is {label_value}."
        ),
        "summary_zh": (
            f"最新水平为 {format_millions_to_readable(latest.get('value') if latest else None)}；"
            f"{series_meta['metric_label_zh']} 为 {label_value}。"
        ),
        "interpretation": interpretation,
        "interpretation_zh": interpretation_zh,
        "why_it_matters": why_it_matters,
        "why_it_matters_zh": why_it_matters_zh,
        "key_metrics": [
            {"label": "Latest Level", "label_zh": "最新水平 Latest Level", "value": format_millions_to_readable(latest.get("value") if latest else None), "unit": ""},
            {"label": "1-week Change", "label_zh": "1周变化 1-week Change", "value": format_change_millions(one_week), "unit": ""},
            {"label": "4-week Change", "label_zh": "4周变化 4-week Change", "value": format_change_millions(four_week), "unit": ""},
            {"label": "13-week Change", "label_zh": "13周变化 13-week Change", "value": format_change_millions(thirteen_week), "unit": ""},
            {"label": "Historical Percentile", "label_zh": "历史分位 Historical Percentile", "value": percentile, "unit": ""},
            {"label": "Rolling z-score", "label_zh": "滚动 z-score Rolling z-score", "value": "Unavailable" if zscore is None else f"{zscore:.2f}", "unit": ""},
            {"label": "Observations Used", "label_zh": "样本数量 Observations Used", "value": str(len(series)), "unit": ""},
            {"label": series_meta["metric_label"], "label_zh": series_meta["metric_label_zh"], "value": label_value, "unit": ""},
        ],
        "signals": [f"Series keyid: {series_meta['keyid']}", f"Description: {description}"],
        "warnings": warnings,
        "chart_url": chart_url,
        "series_used": [
            {
                "metric": series_meta["title"],
                "keyid": series_meta["keyid"],
                "latest_date": latest.get("date") if latest else None,
                "formatted_value": format_millions_to_readable(latest.get("value") if latest else None),
                "status": "used" if latest else "missing",
                "description": description,
            }
        ],
        "normalized_data": series,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


def save_section_cache(section_name: str, section: dict[str, Any]) -> None:
    cache_dir = _project_root() / "data" / "cache" / "sections"
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / f"{section_name}.json"
    output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")


def build_fails_section() -> dict[str, Any]:
    metadata, meta_warnings = fetch_metadata()
    deliver_rows, deliver_warnings = fetch_history_for_keyid("PDFTD-USTET")
    receive_rows, receive_warnings = fetch_history_for_keyid("PDFTR-USTET")
    latest_rows, latest_warnings = fetch_latest_pd_snapshot()
    warnings = meta_warnings + deliver_warnings + receive_warnings + latest_warnings

    deliver = [row for row in deliver_rows if row.get("value") is not None and row.get("date")]
    receive = [row for row in receive_rows if row.get("value") is not None and row.get("date")]
    deliver.sort(key=lambda row: row["date"])
    receive.sort(key=lambda row: row["date"])
    for keyid, series in (("PDFTD-USTET", deliver), ("PDFTR-USTET", receive)):
        latest_snapshot = next((row for row in latest_rows if row.get("keyid") == keyid), None)
        if latest_snapshot and latest_snapshot.get("value") is not None and latest_snapshot.get("date"):
            if not series or latest_snapshot["date"] > series[-1]["date"]:
                series.append(latest_snapshot)

    combined = []
    receive_lookup = {row["date"]: row for row in receive}
    for row in deliver:
        other = receive_lookup.get(row["date"])
        if other and row.get("value") is not None and other.get("value") is not None:
            combined.append({"date": row["date"], "value": row["value"] + other["value"]})

    latest = combined[-1] if combined else None
    one_week, warn = _change_from_weeks(combined, 1)
    if warn:
        warnings.append(warn)
    four_week, warn = _change_from_weeks(combined, 4)
    if warn:
        warnings.append(warn)
    thirteen_week, warn = _change_from_weeks(combined, 13)
    if warn:
        warnings.append(warn)
    percentile = _historical_percentile(combined)
    zscore = _rolling_zscore(combined)
    direction = "rising" if one_week is not None and one_week > 0 else "stable / falling"
    chart_url = _generate_fails_chart(deliver, receive)

    return {
        "title": "Fails and Specialness",
        "title_zh": "结算失败 Fails / Specialness",
        "mode": "live",
        "status": "available",
        "source": "nyfed",
        "freshness_status": _freshness_status(latest.get("date") if latest else None),
        "expected_update_frequency": "weekly",
        "data_date": latest.get("date") if latest else None,
        "summary": f"Latest combined fails measure is {format_millions_to_readable(latest.get('value') if latest else None)} and direction is {direction}.",
        "summary_zh": f"最新合并 fails 指标为 {format_millions_to_readable(latest.get('value') if latest else None)}，方向为 {direction}。",
        "interpretation": "Fails represent settlement fails after trades are agreed. Rising fails can reflect settlement friction, collateral scarcity, or specialness.",
        "interpretation_zh": "Fails 表示交易成交后未能按时交割证券或现金的情况。Fails 上升可能反映 settlement friction、collateral scarcity 或 specialness。",
        "why_it_matters": "Rising fails can signal settlement frictions even when broader funding stress is not extreme.",
        "why_it_matters_zh": "Fails 上升可能意味着结算环节更紧，即使整体 funding stress 还没有到极端程度。",
        "key_metrics": [
            {"label": "Latest Fails Measure", "label_zh": "最新 fails 指标 Latest Fails Measure", "value": format_millions_to_readable(latest.get("value") if latest else None), "unit": ""},
            {"label": "Fails to Deliver", "label_zh": "Fails to Deliver", "value": format_millions_to_readable(deliver[-1]["value"] if deliver else None), "unit": ""},
            {"label": "Fails to Receive", "label_zh": "Fails to Receive", "value": format_millions_to_readable(receive[-1]["value"] if receive else None), "unit": ""},
            {"label": "1-week Change", "label_zh": "1周变化 1-week Change", "value": format_change_millions(one_week), "unit": ""},
            {"label": "4-week Change", "label_zh": "4周变化 4-week Change", "value": format_change_millions(four_week), "unit": ""},
            {"label": "13-week Change", "label_zh": "13周变化 13-week Change", "value": format_change_millions(thirteen_week), "unit": ""},
            {"label": "Historical Percentile", "label_zh": "历史分位 Historical Percentile", "value": percentile, "unit": ""},
            {"label": "Rolling z-score", "label_zh": "滚动 z-score Rolling z-score", "value": "Unavailable" if zscore is None else f"{zscore:.2f}", "unit": ""},
            {"label": "Observations Used", "label_zh": "样本数量 Observations Used", "value": str(len(combined)), "unit": ""},
            {"label": "Fails Direction", "label_zh": "Fails 方向 Fails Direction", "value": direction, "unit": ""},
        ],
        "signals": [
            f"Series keyid: PDFTD-USTET - {metadata.get('PDFTD-USTET', '')}",
            f"Series keyid: PDFTR-USTET - {metadata.get('PDFTR-USTET', '')}",
        ],
        "warnings": warnings,
        "chart_url": chart_url,
        "series_used": [
            {
                "metric": "Fails to Deliver",
                "keyid": "PDFTD-USTET",
                "latest_date": deliver[-1]["date"] if deliver else None,
                "formatted_value": format_millions_to_readable(deliver[-1]["value"] if deliver else None),
                "status": "used" if deliver else "missing",
                "description": metadata.get("PDFTD-USTET", ""),
            },
            {
                "metric": "Fails to Receive",
                "keyid": "PDFTR-USTET",
                "latest_date": receive[-1]["date"] if receive else None,
                "formatted_value": format_millions_to_readable(receive[-1]["value"] if receive else None),
                "status": "used" if receive else "missing",
                "description": metadata.get("PDFTR-USTET", ""),
            },
        ],
        "normalized_data": combined,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }
