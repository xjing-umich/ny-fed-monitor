from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import pandas as pd
import yaml

from ..services.nyfed_client import NYFedClient
from ..services.chart_service import format_y_axis_units, save_chart, setup_time_axis


RATE_ENDPOINTS = {
    "SOFR": "https://markets.newyorkfed.org/api/rates/secured/sofr/last/30.json",
    "EFFR": "https://markets.newyorkfed.org/api/rates/unsecured/effr/last/30.json",
    "OBFR": "https://markets.newyorkfed.org/api/rates/unsecured/obfr/last/30.json",
    "TGCR": "https://markets.newyorkfed.org/api/rates/secured/tgcr/last/30.json",
    "BGCR": "https://markets.newyorkfed.org/api/rates/secured/bgcr/last/30.json",
}


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
        return "Unavailable"
    try:
        as_of = datetime.strptime(data_date, "%Y-%m-%d").date()
    except ValueError:
        return "Unavailable"
    return "Fresh" if _business_days_between(as_of, date.today()) <= 2 else "Stale"


def _format_bps(spread_percent: float | None) -> str:
    if spread_percent is None:
        return "Unavailable"
    return f"{spread_percent * 100:+.1f} bps"


def _funding_rate_stress(sofr_effr_percent: float | None) -> str:
    if sofr_effr_percent is None:
        return "Unavailable"
    spread_bps = sofr_effr_percent * 100
    if spread_bps > 20:
        return "High"
    if spread_bps > 10:
        return "Elevated"
    return "Normal"


def _generate_reference_rates_chart(rows: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    if not rows:
        return None, "Reference Rates chart unavailable: no normalized rate history."

    df = pd.DataFrame(rows)
    if df.empty or "date" not in df.columns or "rate_name" not in df.columns or "rate_percent" not in df.columns:
        return None, "Reference Rates chart unavailable: normalized data missing required columns."

    df["date"] = pd.to_datetime(df["date"], errors="coerce")
    df["rate_percent"] = pd.to_numeric(df["rate_percent"], errors="coerce")
    df = df.dropna(subset=["date", "rate_percent"])
    if df.empty:
        return None, "Reference Rates chart unavailable: normalized rate history is empty after date parsing."

    pivot = df.pivot_table(index="date", columns="rate_name", values="rate_percent", aggfunc="last").sort_index()
    if pivot.empty or "SOFR" not in pivot.columns or "EFFR" not in pivot.columns:
        return None, "Reference Rates chart unavailable: SOFR/EFFR history missing."

    spread_df = pd.DataFrame(index=pivot.index)
    spread_df["SOFR-EFFR"] = (pivot["SOFR"] - pivot["EFFR"]) * 100

    spread_df = spread_df.dropna(how="all")
    if spread_df.empty:
        return None, "Reference Rates chart unavailable: spread history could not be computed."

    assets_dir = _project_root() / "data" / "reports" / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    chart_path = assets_dir / "sofr_effr_spread.png"

    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=140)
    marker = None if len(spread_df) > 80 else "o"
    ax.plot(
        spread_df.index,
        spread_df["SOFR-EFFR"],
        label="SOFR-EFFR",
        linewidth=2.0,
        color="#1d4ed8",
        marker=marker,
        markersize=2.5 if marker else None,
    )

    ax.axhline(0, color="#cbd5e1", linewidth=1)
    ax.set_title("SOFR-EFFR Spread")
    format_y_axis_units(ax, "bps")
    ax.grid(True, alpha=0.25)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.legend(frameon=False, loc="upper left")
    setup_time_axis(ax)

    try:
        save_chart(fig, chart_path)
    except OSError as exc:
        plt.close(fig)
        return None, f"Reference Rates chart write failed: {exc}"
    finally:
        plt.close(fig)

    return "/assets/sofr_effr_spread.png", None


def _normalize_record(record: dict[str, Any], rate_name: str) -> dict[str, Any]:
    return {
        "date": record.get("effectiveDate"),
        "rate_name": rate_name,
        "rate_percent": _to_float(record.get("percentRate")),
        "volume": _to_float(record.get("volumeInBillions")),
    }


def fetch_reference_rates(client: NYFedClient | None = None) -> tuple[list[dict[str, Any]], list[str]]:
    config = _load_config()
    client = client or NYFedClient()
    warnings: list[str] = []
    rates_config = config.get("reference_rates", {})
    rows: list[dict[str, Any]] = []

    for rate_name, default_url in RATE_ENDPOINTS.items():
        url = rates_config.get(rate_name.lower(), default_url)
        try:
            payload = client.get_json(url, save_raw=True)
        except RuntimeError as exc:
            warnings.append(str(exc))
            continue

        for item in payload.get("refRates", []):
            rows.append(_normalize_record(item, rate_name))

    warnings.extend(client.warnings)
    return rows, warnings


def build_reference_rates_section() -> dict[str, Any]:
    rows, warnings = fetch_reference_rates()
    latest_by_rate: dict[str, dict[str, Any]] = {}
    for row in rows:
        rate_name = row["rate_name"]
        current = latest_by_rate.get(rate_name)
        if current is None or (row.get("date") or "") > (current.get("date") or ""):
            latest_by_rate[rate_name] = row

    data_date = max((row.get("date") for row in latest_by_rate.values() if row.get("date")), default=None)
    sofr = latest_by_rate.get("SOFR", {}).get("rate_percent")
    effr = latest_by_rate.get("EFFR", {}).get("rate_percent")
    obfr = latest_by_rate.get("OBFR", {}).get("rate_percent")
    tgcr = latest_by_rate.get("TGCR", {}).get("rate_percent")
    bgcr = latest_by_rate.get("BGCR", {}).get("rate_percent")

    sofr_effr = sofr - effr if sofr is not None and effr is not None else None
    obfr_effr = obfr - effr if obfr is not None and effr is not None else None
    tgcr_sofr = tgcr - sofr if tgcr is not None and sofr is not None else None
    bgcr_sofr = bgcr - sofr if bgcr is not None and sofr is not None else None
    funding_rate_stress = _funding_rate_stress(sofr_effr)
    chart_url, chart_warning = _generate_reference_rates_chart(rows)
    if chart_warning:
        warnings.append(chart_warning)

    section = {
        "title": "Reference Rates and Funding Conditions",
        "title_zh": "短端利率 Reference Rates",
        "freshness_status": _freshness_status(data_date),
        "expected_update_frequency": "daily",
        "data_date": data_date,
        "summary": (
            f"Funding Rate Stress is {funding_rate_stress}. "
            f"Latest SOFR-EFFR spread is {_format_bps(sofr_effr)}."
        ),
        "summary_zh": (
            f"Funding Rate Stress 当前为 {funding_rate_stress}。"
            f"最新 SOFR-EFFR 利差为 {_format_bps(sofr_effr)}。"
        ),
        "interpretation": (
            "SOFR-EFFR spread helps monitor whether repo-market funding pressure is rising "
            "relative to unsecured fed funds markets. It should be read together with repo "
            "financing and facility usage."
        ),
        "interpretation_zh": (
            "SOFR-EFFR spread 用于观察 repo market 是否比 unsecured fed funds market 更紧。"
            "单独一个 spread 不代表完整 funding stress，需要和 Repo Financing、ON RRP / SRP 一起看。"
        ),
        "why_it_matters": "Short-term reference rates help monitor money-market funding conditions.",
        "why_it_matters_zh": "短端利率是判断资金市场是否紧张的核心指标。",
        "key_metrics": [
            {"label": "SOFR-EFFR", "label_zh": "SOFR-EFFR", "value": _format_bps(sofr_effr), "unit": ""},
            {"label": "OBFR-EFFR", "label_zh": "OBFR-EFFR", "value": _format_bps(obfr_effr), "unit": ""},
            {"label": "TGCR-SOFR", "label_zh": "TGCR-SOFR", "value": _format_bps(tgcr_sofr), "unit": ""},
            {"label": "BGCR-SOFR", "label_zh": "BGCR-SOFR", "value": _format_bps(bgcr_sofr), "unit": ""},
            {
                "label": "Funding Rate Stress",
                "label_zh": "融资利率压力 Funding Rate Stress",
                "value": funding_rate_stress,
                "unit": "",
            },
        ],
        "signals": [
            f"Latest SOFR: {sofr:.2f}%" if sofr is not None else "SOFR unavailable.",
            f"Latest EFFR: {effr:.2f}%" if effr is not None else "EFFR unavailable.",
        ],
        "warnings": warnings,
        "normalized_data": rows,
        "spreads_bps": {
            "sofr_effr": _format_bps(sofr_effr),
            "obfr_effr": _format_bps(obfr_effr),
            "tgcr_sofr": _format_bps(tgcr_sofr),
            "bgcr_sofr": _format_bps(bgcr_sofr),
        },
        "chart_url": chart_url,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }
    return section


def save_reference_rates_cache(section: dict[str, Any]) -> None:
    project_root = _project_root()
    cache_dir = project_root / "data" / "cache" / "sections"
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / "reference-rates.json"
    try:
        output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")
    except OSError:
        pass
