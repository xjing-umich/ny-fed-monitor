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


DEFAULT_SOMA_URL = "https://markets.newyorkfed.org/api/soma/summary.json"


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_config() -> dict[str, Any]:
    config_path = _project_root() / "config.yaml"
    if not config_path.exists():
        return {}
    return yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}


def _to_float(value: Any) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_dollars_to_readable(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "Unavailable"
    sign = "-" if value < 0 else ""
    abs_value = abs(value)
    if abs_value >= 1_000_000_000_000:
        scaled = abs_value / 1_000_000_000_000
        return f"{sign}${scaled:.{decimals}f} trillion"
    if abs_value >= 1_000_000_000:
        scaled = abs_value / 1_000_000_000
        return f"{sign}${scaled:.{decimals}f} billion"
    if abs_value >= 1_000_000:
        scaled = abs_value / 1_000_000
        return f"{sign}${scaled:.{decimals}f} million"
    return f"{sign}${abs_value:.{decimals}f}"


def _format_change(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    prefix = "+" if value > 0 else ""
    return f"{prefix}{_format_dollars_to_readable(value)}"


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


def fetch_soma_data(client: NYFedClient | None = None, config: dict[str, Any] | None = None) -> tuple[dict[str, Any], list[str]]:
    config = config or _load_config()
    client = client or NYFedClient()
    endpoint = config.get("soma", {}).get("summary_endpoint", DEFAULT_SOMA_URL)
    warnings: list[str] = []
    try:
        payload = client.get_json(endpoint, save_raw=True)
    except RuntimeError as exc:
        warnings.append(str(exc))
        return {}, warnings
    warnings.extend(client.warnings)
    return payload, warnings


def normalize_soma_data(raw_json: dict[str, Any]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for record in raw_json.get("soma", {}).get("summary", []):
        notes_bonds = _to_float(record.get("notesbonds")) or 0.0
        bills = _to_float(record.get("bills")) or 0.0
        tips = _to_float(record.get("tips")) or 0.0
        tips_inflation = _to_float(record.get("tipsInflationCompensation")) or 0.0
        frn = _to_float(record.get("frn")) or 0.0
        agencies = _to_float(record.get("agencies")) or 0.0
        treasury_total = notes_bonds + bills + tips + tips_inflation + frn + agencies
        mbs_total = (_to_float(record.get("mbs")) or 0.0) + (_to_float(record.get("cmbs")) or 0.0)
        rows.append(
            {
                "date": record.get("asOfDate"),
                "category": "Treasury",
                "par_value": treasury_total,
                "source": "nyfed_soma_summary",
                "raw_total": _to_float(record.get("total")),
            }
        )
        rows.append(
            {
                "date": record.get("asOfDate"),
                "category": "MBS",
                "par_value": mbs_total,
                "source": "nyfed_soma_summary",
                "raw_total": _to_float(record.get("total")),
            }
        )
        rows.append(
            {
                "date": record.get("asOfDate"),
                "category": "Total",
                "par_value": _to_float(record.get("total")),
                "source": "nyfed_soma_summary",
                "raw_total": _to_float(record.get("total")),
            }
        )
    return rows


def _series_by_category(rows: list[dict[str, Any]], category: str) -> list[dict[str, Any]]:
    series = [row for row in rows if row.get("category") == category and row.get("date") and row.get("par_value") is not None]
    return sorted(series, key=lambda item: item["date"])


def _closest_record(series: list[dict[str, Any]], target_date: date) -> dict[str, Any] | None:
    if not series:
        return None
    dated = []
    for row in series:
        try:
            row_date = datetime.strptime(row["date"], "%Y-%m-%d").date()
        except ValueError:
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
    target = latest_date - timedelta(weeks=weeks)
    prior = _closest_record(series[:-1] or series, target)
    if prior is None or prior.get("par_value") is None or latest.get("par_value") is None:
        return None, f"No nearby observation found for {weeks}-week change."
    return latest["par_value"] - prior["par_value"], None


def compute_soma_indicators(rows: list[dict[str, Any]]) -> dict[str, Any]:
    treasury = _series_by_category(rows, "Treasury")
    mbs = _series_by_category(rows, "MBS")
    total = _series_by_category(rows, "Total")
    warnings: list[str] = []

    latest_total = total[-1] if total else None
    latest_treasury = treasury[-1] if treasury else None
    latest_mbs = mbs[-1] if mbs else None
    data_date = latest_total.get("date") if latest_total else None

    total_1w, warn = _change_from_weeks(total, 1)
    if warn:
        warnings.append(warn)
    total_4w, warn = _change_from_weeks(total, 4)
    if warn:
        warnings.append(warn)
    total_13w, warn = _change_from_weeks(total, 13)
    if warn:
        warnings.append(warn)
    treasury_4w, warn = _change_from_weeks(treasury, 4)
    if warn:
        warnings.append(warn)
    mbs_4w, warn = _change_from_weeks(mbs, 4)
    if warn:
        warnings.append(warn)

    return {
        "latest_treasury_holdings": latest_treasury.get("par_value") if latest_treasury else None,
        "latest_mbs_holdings": latest_mbs.get("par_value") if latest_mbs else None,
        "latest_total_soma_holdings": latest_total.get("par_value") if latest_total else None,
        "total_soma_1w_change": total_1w,
        "total_soma_4w_change": total_4w,
        "total_soma_13w_change": total_13w,
        "treasury_4w_change": treasury_4w,
        "mbs_4w_change": mbs_4w,
        "data_date": data_date,
        "observations_used": len(total),
        "warnings": warnings,
        "treasury_series": treasury,
        "mbs_series": mbs,
    }


def _generate_soma_chart(indicators: dict[str, Any]) -> str | None:
    treasury = indicators.get("treasury_series", [])
    mbs = indicators.get("mbs_series", [])
    if len(treasury) < 10 or len(mbs) < 10:
        return None

    assets_dir = _project_root() / "data" / "reports" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    output_path = assets_dir / "soma_holdings.png"

    treasury_df = normalize_time_series_df(pd.DataFrame(treasury), "date", ["par_value"])
    mbs_df = normalize_time_series_df(pd.DataFrame(mbs), "date", ["par_value"])
    if treasury_df.empty or mbs_df.empty:
        return None

    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=140)
    marker = None if max(len(treasury_df), len(mbs_df)) > 80 else "o"
    ax.plot(
        treasury_df["date"],
        treasury_df["par_value"] / 1_000_000_000_000,
        label="Treasury holdings",
        linewidth=1.8,
        marker=marker,
        markersize=2.5 if marker else None,
    )
    ax.plot(
        mbs_df["date"],
        mbs_df["par_value"] / 1_000_000_000_000,
        label="MBS holdings",
        linewidth=1.8,
        marker=marker,
        markersize=2.5 if marker else None,
    )
    ax.set_title("SOMA Treasury and MBS Holdings")
    format_y_axis_units(ax, "trillions")
    ax.grid(True, alpha=0.25)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(frameon=False, loc="upper left")
    setup_time_axis(ax)
    try:
        save_chart(fig, output_path)
        return "/assets/soma_holdings.png"
    except OSError:
        return None
    finally:
        plt.close(fig)


def build_soma_section() -> dict[str, Any]:
    raw_json, warnings = fetch_soma_data()
    rows = normalize_soma_data(raw_json)
    indicators = compute_soma_indicators(rows)
    warnings.extend(indicators.pop("warnings", []))
    chart_url = _generate_soma_chart(indicators)

    section = {
        "title": "SOMA and Balance Sheet Pressure",
        "title_zh": "美联储持仓 SOMA",
        "mode": "live",
        "status": "available",
        "source": "nyfed",
        "freshness_status": _freshness_status(indicators.get("data_date")),
        "expected_update_frequency": "weekly",
        "data_date": indicators.get("data_date"),
        "summary": (
            f"Latest Treasury holdings are {_format_dollars_to_readable(indicators.get('latest_treasury_holdings'))} "
            f"and latest MBS holdings are {_format_dollars_to_readable(indicators.get('latest_mbs_holdings'))}."
        ),
        "summary_zh": (
            f"最新 Treasury 持仓为 {_format_dollars_to_readable(indicators.get('latest_treasury_holdings'))}，"
            f"最新 MBS 持仓为 {_format_dollars_to_readable(indicators.get('latest_mbs_holdings'))}。"
        ),
        "interpretation": (
            "SOMA holdings represent the Federal Reserve’s System Open Market Account securities holdings. "
            "Changes in Treasury and MBS holdings affect how much duration private investors need to absorb."
        ),
        "interpretation_zh": (
            "SOMA 表示美联储系统公开市场账户持有的证券。Treasury 和 MBS 持仓变化会影响私人部门需要吸收的 duration。"
        ),
        "why_it_matters": (
            "SOMA changes help assess whether the Fed is absorbing duration or whether more Treasury and MBS duration "
            "must be absorbed by private markets."
        ),
        "why_it_matters_zh": (
            "SOMA 持仓变化可以帮助判断 Fed 是否仍在吸收 duration，或是否需要私人市场吸收更多 Treasury / MBS 供给。"
        ),
        "key_metrics": [
            {
                "label": "Latest Treasury Holdings",
                "label_zh": "最新 Treasury 持仓 Latest Treasury Holdings",
                "value": _format_dollars_to_readable(indicators.get("latest_treasury_holdings")),
                "unit": "",
            },
            {
                "label": "Latest MBS Holdings",
                "label_zh": "最新 MBS 持仓 Latest MBS Holdings",
                "value": _format_dollars_to_readable(indicators.get("latest_mbs_holdings")),
                "unit": "",
            },
            {
                "label": "Total SOMA 1-week Change",
                "label_zh": "SOMA 1周变化 Total SOMA 1-week Change",
                "value": _format_change(indicators.get("total_soma_1w_change")),
                "unit": "",
            },
            {
                "label": "Total SOMA 4-week Change",
                "label_zh": "SOMA 4周变化 Total SOMA 4-week Change",
                "value": _format_change(indicators.get("total_soma_4w_change")),
                "unit": "",
            },
            {
                "label": "Total SOMA 13-week Change",
                "label_zh": "SOMA 13周变化 Total SOMA 13-week Change",
                "value": _format_change(indicators.get("total_soma_13w_change")),
                "unit": "",
            },
            {
                "label": "Treasury 4-week Change",
                "label_zh": "Treasury 4周变化 Treasury 4-week Change",
                "value": _format_change(indicators.get("treasury_4w_change")),
                "unit": "",
            },
            {
                "label": "MBS 4-week Change",
                "label_zh": "MBS 4周变化 MBS 4-week Change",
                "value": _format_change(indicators.get("mbs_4w_change")),
                "unit": "",
            },
        ],
        "signals": [
            f"Observations used: {indicators.get('observations_used', 0)}",
            "Chart available." if chart_url else "Chart unavailable because the time series is too short or missing.",
        ],
        "warnings": warnings,
        "chart_url": chart_url,
        "normalized_data": rows,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }
    return section


def save_soma_cache(section: dict[str, Any]) -> None:
    cache_dir = _project_root() / "data" / "cache" / "sections"
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / "soma.json"
    output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")
