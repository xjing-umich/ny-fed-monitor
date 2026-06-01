from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import pandas as pd
import yaml


def _project_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _load_config() -> dict[str, Any]:
    config_path = _project_root() / "config.yaml"
    if not config_path.exists():
        return {}
    return yaml.safe_load(config_path.read_text(encoding="utf-8")) or {}


def _resolve_sme_path(config: dict[str, Any]) -> Path:
    raw_path = config.get("policy_expectations", {}).get("sme_file_path", "data/manual/sme_latest.xlsx")
    path = Path(raw_path)
    return path if path.is_absolute() else _project_root() / path


def _to_float(value: Any) -> float | None:
    if value in (None, "", "*", "missing", "unavailable"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _format_percent(value: float | None, decimals: int = 2) -> str:
    if value is None:
        return "Unavailable"
    if value <= 1:
        value *= 100
    return f"{value:.{decimals}f}%"


def _format_dollars_from_billions(value: float | None) -> str:
    if value is None:
        return "Unavailable"
    dollars = value * 1_000_000_000
    sign = "-" if dollars < 0 else ""
    abs_value = abs(dollars)
    if abs_value >= 1_000_000_000_000:
        return f"{sign}${abs_value / 1_000_000_000_000:.2f} trillion"
    if abs_value >= 1_000_000_000:
        return f"{sign}${abs_value / 1_000_000_000:.0f} billion"
    return f"{sign}${abs_value:.2f}"


def _risk_label(recession_6m: float | None, core_pce_2026: float | None) -> str:
    if recession_6m is None and core_pce_2026 is None:
        return "Unavailable"
    if (recession_6m is not None and recession_6m >= 35) or (core_pce_2026 is not None and core_pce_2026 >= 3.5):
        return "Elevated"
    if (recession_6m is not None and recession_6m >= 20) or (core_pce_2026 is not None and core_pce_2026 >= 2.5):
        return "Watch"
    return "Normal"


def _read_workbook(file_path: Path) -> tuple[dict[str, pd.DataFrame], list[str]]:
    warnings: list[str] = []
    if file_path.suffix.lower() == ".csv":
        df = pd.read_csv(file_path)
        return {"csv": df}, ["Loaded SME from CSV file."]
    workbook = pd.read_excel(file_path, sheet_name=None)
    warnings.append(f"SME sheet names: {', '.join(workbook.keys())}")
    return workbook, warnings


def _normalize_df(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(col).strip().lower() for col in df.columns]
    for col in ["survey_release_date", "survey_due_date", "horizon_date"]:
        if col in df.columns:
            df[col] = pd.to_datetime(df[col], errors="coerce")
    string_cols = [
        "panel_type",
        "theme",
        "subject_group",
        "subject",
        "question_text",
        "question_tag",
        "value_tag",
        "top_header_value",
        "left_header_value",
        "horizon",
        "aggregation",
    ]
    for col in string_cols:
        if col not in df.columns:
            df[col] = ""
        df[col] = df[col].fillna("").astype(str)
    if "aggregation_value" not in df.columns:
        df["aggregation_value"] = pd.NA
    df["aggregation_value_num"] = pd.to_numeric(df["aggregation_value"], errors="coerce")
    return df


def _pick_long_sheet(workbook: dict[str, pd.DataFrame]) -> tuple[str, pd.DataFrame]:
    best_name = ""
    best_df = pd.DataFrame()
    best_score = -1
    for sheet_name, df in workbook.items():
        cols = {str(col).strip().lower() for col in df.columns}
        score = sum(
            1
            for required in [
                "survey_release_date",
                "theme",
                "subject_group",
                "subject",
                "question_tag",
                "aggregation",
                "aggregation_value",
            ]
            if required in cols
        )
        if score > best_score:
            best_name, best_df, best_score = sheet_name, df, score
    if best_score < 0:
        raise ValueError("Could not identify a usable SME sheet.")
    return best_name, best_df


def _save_structure_audit(workbook: dict[str, pd.DataFrame]) -> None:
    processed_dir = _project_root() / "data" / "processed"
    processed_dir.mkdir(parents=True, exist_ok=True)
    payload: dict[str, Any] = {"sheets": {}}
    for sheet_name, df in workbook.items():
        payload["sheets"][sheet_name] = {
            "columns": [str(col) for col in df.columns.tolist()],
            "row_count": int(len(df)),
            "preview_rows": df.head(10).fillna("").astype(str).to_dict(orient="records"),
        }
    try:
        (processed_dir / "sme_structure_audit.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass


def _filter_combined(df: pd.DataFrame) -> pd.DataFrame:
    if "panel_type" not in df.columns:
        return df
    combined = df[df["panel_type"].str.lower() == "combined"].copy()
    return combined if not combined.empty else df


def _agg_mask(df: pd.DataFrame, label: str) -> pd.Series:
    agg = df["aggregation"].str.lower()
    if label == "p50":
        return agg.isin(["pctl50", "median"]) | agg.eq("")
    if label == "p75":
        return agg.isin(["pctl75", "75th percentile"])
    if label == "p25":
        return agg.isin(["pctl25", "25th percentile"])
    return agg.eq(label)


def _pick_value(df: pd.DataFrame, mask: pd.Series, agg_label: str = "p50") -> float | None:
    subset = df.loc[mask & _agg_mask(df, agg_label) & df["aggregation_value_num"].notna()].copy()
    if subset.empty:
        return None
    if "survey_release_date" in subset.columns:
        subset = subset.sort_values(by=["survey_release_date"], ascending=False)
    return _to_float(subset.iloc[0]["aggregation_value_num"])


def _release_date(df: pd.DataFrame) -> str | None:
    series = df["survey_release_date"].dropna()
    if series.empty:
        return None
    return series.max().date().isoformat()


def _horizon_label_from_value_tag(value_tag: str, top_header: str, left_header: str, horizon: str, horizon_date: Any) -> str:
    tag = str(value_tag or "").lower()
    if top_header:
        th = str(top_header)
        if re.fullmatch(r"\d{4}", th.strip()):
            return th.strip()
        if "longer run" in th.lower():
            return "Longer run"
        if re.search(r"\b2026\b|\b2027\b|\b2028\b", th):
            match = re.search(r"(2026|2027|2028)", th)
            if match:
                return match.group(1)
    if left_header:
        lh = str(left_header)
        if "longer run" in lh.lower():
            return "Longer run"
        match = re.search(r"(2026|2027|2028)", lh)
        if match:
            return match.group(1)
    if horizon:
        h = str(horizon)
        if h in {"2026", "2027", "2028", "Longer run"}:
            return h
    if "longerrun" in tag:
        return "Longer run"
    match = re.search(r"(2026|2027|2028)", tag)
    if match:
        return match.group(1)
    if pd.notna(horizon_date):
        try:
            dt = pd.to_datetime(horizon_date)
            return str(dt.year)
        except Exception:
            pass
    return "Latest"


def _extract_fed_funds_table(df: pd.DataFrame) -> tuple[list[dict[str, Any]], float | None, float | None]:
    subset = df[df["question_tag"].str.contains("fftr_pathofmodes", case=False, na=False)].copy()
    if subset.empty:
        return [], None, None
    subset["horizon_label"] = subset.apply(
        lambda row: _horizon_label_from_value_tag(
            row.get("value_tag", ""),
            row.get("top_header_value", ""),
            row.get("left_header_value", ""),
            row.get("horizon", ""),
            row.get("horizon_date"),
        ),
        axis=1,
    )
    rows = []
    for horizon in sorted(subset["horizon_label"].dropna().unique(), key=lambda x: ("Longer" in str(x), str(x))):
        group = subset[subset["horizon_label"] == horizon]
        rows.append(
            {
                "Horizon": horizon,
                "Median": _format_percent(_pick_value(group, group.index == group.index, "p50")),
                "25th percentile": _format_percent(_pick_value(group, group.index == group.index, "p25")),
                "75th percentile": _format_percent(_pick_value(group, group.index == group.index, "p75")),
            }
        )
    dated = subset.copy()
    dated = dated[pd.notna(dated["horizon_date"])]
    latest_ff = None
    year_end_2026 = None
    if not dated.empty:
        earliest_date = dated["horizon_date"].min()
        soonest = dated[dated["horizon_date"] == earliest_date]
        latest_ff = _pick_value(soonest, soonest.index == soonest.index, "p50")
        y2026 = dated[dated["horizon_date"].dt.year == 2026].copy()
        if not y2026.empty:
            latest_2026_date = y2026["horizon_date"].max()
            latest_2026 = y2026[y2026["horizon_date"] == latest_2026_date]
            year_end_2026 = _pick_value(latest_2026, latest_2026.index == latest_2026.index, "p50")
    return rows, latest_ff, year_end_2026


def _extract_probability_table(df: pd.DataFrame) -> tuple[list[dict[str, Any]], float | None, float | None, float | None]:
    specs = [
        ("U.S. recession now", "usrecession_prob_current"),
        ("U.S. recession in 6 months", "usrecession_prob_6months"),
        ("Global recession in 6 months", "globalrecession_prob_6months"),
    ]
    rows = []
    now_prob = None
    us_6m = None
    global_6m = None
    for label, tag in specs:
        subset = df[df["question_tag"].str.fullmatch(tag, case=False, na=False)].copy()
        median = _pick_value(subset, subset.index == subset.index, "p50")
        p75 = _pick_value(subset, subset.index == subset.index, "p75")
        rows.append({"Measure": label, "Median probability": _format_percent(median, 1), "75th percentile": _format_percent(p75, 1)})
        if tag == "usrecession_prob_current":
            now_prob = median * 100 if median is not None and median <= 1 else median
        elif tag == "usrecession_prob_6months":
            us_6m = median * 100 if median is not None and median <= 1 else median
        elif tag == "globalrecession_prob_6months":
            global_6m = median * 100 if median is not None and median <= 1 else median
    return rows, now_prob, us_6m, global_6m


def _extract_inflation_table(df: pd.DataFrame, subject_name: str) -> list[dict[str, Any]]:
    subset = df[df["subject"].str.fullmatch(subject_name, case=False, na=False)].copy()
    if subset.empty:
        return []
    # prefer annual outlook rows over quarterly / percentile / probability distribution rows
    subset = subset[
        subset["question_tag"].str.contains("econoutlook_pathofmodes", case=False, na=False)
        | subset["value_tag"].str.contains("longerrun|2026|2027|2028", case=False, na=False)
    ].copy()
    subset["horizon_label"] = subset.apply(
        lambda row: _horizon_label_from_value_tag(
            row.get("value_tag", ""),
            row.get("top_header_value", ""),
            row.get("left_header_value", ""),
            row.get("horizon", ""),
            row.get("horizon_date"),
        ),
        axis=1,
    )
    rows = []
    for horizon in ["2026", "2027", "2028", "Longer run"]:
        group = subset[subset["horizon_label"] == horizon]
        if group.empty:
            continue
        rows.append({"Horizon": horizon, "Median": _format_percent(_pick_value(group, group.index == group.index, "p50"))})
    return rows


def _extract_balance_sheet_table(df: pd.DataFrame) -> list[dict[str, Any]]:
    mapping = {
        "Total Fed assets": "fed_assets_total_assets",
        "SOMA assets": "fed_assets_soma",
        "Treasury holdings": "fed_assets_treasury",
        "Agency MBS holdings": "fed_assets_ambs",
        "Reserve balances": "fed_liabilities_reserves",
        "ON RRP": "fed_liabilities_onrrp",
    }
    rows = []
    for label, subject in mapping.items():
        subset = df[df["subject"].str.fullmatch(subject, case=False, na=False)].copy()
        if subset.empty:
            continue
        dated_subset = subset[pd.notna(subset["horizon_date"])].copy()
        if not dated_subset.empty:
            earliest_date = dated_subset["horizon_date"].min()
            latest_group = dated_subset[dated_subset["horizon_date"] == earliest_date]
        else:
            label_value = subset["top_header_value"].replace("", pd.NA).fillna(subset["left_header_value"]).dropna()
            earliest_label = label_value.iloc[0] if not label_value.empty else None
            latest_group = subset[
                (subset["top_header_value"] == earliest_label) | (subset["left_header_value"] == earliest_label)
            ] if earliest_label is not None else subset.iloc[0:1]
        latest_period = latest_group.iloc[0]["top_header_value"] or latest_group.iloc[0]["left_header_value"] or latest_group.iloc[0]["horizon"] or "Latest"
        median = _pick_value(latest_group, latest_group.index == latest_group.index, "p50")
        rows.append({"Item": label, "Latest period": str(latest_period), "Median expectation": _format_dollars_from_billions(median)})
    return rows


def build_policy_expectations_section() -> dict[str, Any]:
    config = _load_config()
    file_path = _resolve_sme_path(config)
    now = datetime.now(timezone.utc).isoformat()
    if not file_path.exists():
        return {
            "title": "Policy Expectations and FOMC Risk",
            "title_zh": "政策预期 Policy Expectations",
            "mode": "manual-missing",
            "status": "unavailable",
            "source": "manual_sme_file",
            "freshness_status": "Missing",
            "expected_update_frequency": "manual",
            "data_date": None,
            "summary": "Policy Expectations data unavailable because the SME file is missing.",
            "summary_zh": "Policy Expectations 数据当前不可用，因为 SME 文件尚未放入 data/manual/。",
            "interpretation": "This section is based on a manually downloaded NY Fed SME file and is currently unavailable.",
            "interpretation_zh": "本模块依赖手动下载的 NY Fed SME 文件；当前文件缺失，因此数据不可用。",
            "why_it_matters": "Survey-based policy expectations help show whether market economists expect easing, steady policy, or a firmer policy path.",
            "why_it_matters_zh": "政策预期可以帮助判断市场是否预期降息、按兵不动，或更偏紧的政策路径。",
            "key_metrics": [
                {"label": "SME Release Date", "label_zh": "SME 发布时间 SME Release Date", "value": "Unavailable", "unit": ""},
                {"label": "Latest Fed Funds Median", "label_zh": "最新联邦基金利率中位数 Latest Fed Funds Median", "value": "Unavailable", "unit": ""},
                {"label": "Year-end 2026 Fed Funds Median", "label_zh": "2026年底联邦基金利率中位数 Year-end 2026 Fed Funds Median", "value": "Unavailable", "unit": ""},
                {"label": "U.S. Recession in 6 Months", "label_zh": "6个月美国衰退概率 U.S. Recession in 6 Months", "value": "Unavailable", "unit": ""},
                {"label": "Core PCE 2026 Median", "label_zh": "2026年 Core PCE 中位数 Core PCE 2026 Median", "value": "Unavailable", "unit": ""},
                {"label": "Policy Expectations Risk", "label_zh": "政策预期风险 Policy Expectations Risk", "value": "Unavailable", "unit": ""},
            ],
            "tables": [],
            "signals": ["Manual SME file not found."],
            "warnings": [f"SME file missing: {file_path}"],
            "caveat": "This section is based on a manually downloaded NY Fed SME file and should be interpreted as survey-based expectations, not forecast certainty.",
            "last_refreshed_at": now,
        }

    warnings: list[str] = []
    workbook, load_warnings = _read_workbook(file_path)
    warnings.extend(load_warnings)
    _save_structure_audit(workbook)

    try:
        sheet_name, long_df = _pick_long_sheet(workbook)
        df = _filter_combined(_normalize_df(long_df))
    except Exception as exc:
        return {
            "title": "Policy Expectations and FOMC Risk",
            "title_zh": "政策预期 Policy Expectations",
            "mode": "unavailable",
            "status": "unavailable",
            "source": "manual_sme_file",
            "freshness_status": "Manual",
            "expected_update_frequency": "manual",
            "data_date": None,
            "summary": "Policy Expectations data could not be parsed from the SME file.",
            "summary_zh": "Policy Expectations 数据存在文件，但当前无法成功解析。",
            "interpretation": "The SME file exists but could not be parsed defensively.",
            "interpretation_zh": "SME 文件已存在，但当前防御式解析失败。",
            "why_it_matters": "Survey-based policy expectations help show whether market economists expect easing, steady policy, or a firmer policy path.",
            "why_it_matters_zh": "政策预期可以帮助判断市场是否预期降息、按兵不动，或更偏紧的政策路径。",
            "key_metrics": [],
            "tables": [],
            "signals": ["Manual SME file exists but parser needs review."],
            "warnings": [str(exc)],
            "caveat": "This section is based on a manually downloaded NY Fed SME file and should be interpreted as survey-based expectations, not forecast certainty.",
            "last_refreshed_at": now,
        }

    release_date = _release_date(df)
    fed_funds_table, latest_ff_num, year_end_2026_num = _extract_fed_funds_table(df)
    recession_table, us_now_num, us_6m_num, global_6m_num = _extract_probability_table(df)
    core_pce_table = _extract_inflation_table(df, "core_pce")
    headline_pce_table = _extract_inflation_table(df, "headline_pce")
    headline_cpi_table = _extract_inflation_table(df, "headline_cpi")
    balance_sheet_table = _extract_balance_sheet_table(df)

    core_pce_2026_num = None
    for row in core_pce_table:
        if row["Horizon"] == "2026":
            core_pce_2026_num = _to_float(str(row["Median"]).replace("%", "")) if row["Median"] != "Unavailable" else None
            break

    risk = _risk_label(us_6m_num, core_pce_2026_num)
    latest_ff = _format_percent(latest_ff_num)
    year_end_2026_ff = _format_percent(year_end_2026_num)
    us_now = _format_percent(us_now_num, 1)
    us_6m = _format_percent(us_6m_num, 1)
    global_6m = _format_percent(global_6m_num, 1)
    core_pce_2026 = next((row["Median"] for row in core_pce_table if row["Horizon"] == "2026"), "Unavailable")

    tables = [
        {
            "title": "Fed Funds Path Expectations",
            "title_zh": "Fed Funds Path Expectations",
            "columns": ["Horizon", "Median", "25th percentile", "75th percentile"],
            "rows": fed_funds_table,
        },
        {
            "title": "Balance Sheet and SOMA Expectations",
            "title_zh": "Balance Sheet and SOMA Expectations",
            "columns": ["Item", "Latest period", "Median expectation"],
            "rows": balance_sheet_table,
        },
        {
            "title": "Recession Probabilities",
            "title_zh": "Recession Probabilities",
            "columns": ["Measure", "Median probability", "75th percentile"],
            "rows": recession_table,
        },
        {
            "title": "Core PCE Inflation Expectations",
            "title_zh": "Core PCE Inflation Expectations",
            "columns": ["Horizon", "Median"],
            "rows": core_pce_table,
        },
        {
            "title": "Headline PCE Inflation Expectations",
            "title_zh": "Headline PCE Inflation Expectations",
            "columns": ["Horizon", "Median"],
            "rows": headline_pce_table,
        },
    ]
    if headline_cpi_table:
        tables.append(
            {
                "title": "Headline CPI Inflation Expectations",
                "title_zh": "Headline CPI Inflation Expectations",
                "columns": ["Horizon", "Median"],
                "rows": headline_cpi_table,
            }
        )

    return {
        "title": "Policy Expectations and FOMC Risk",
        "title_zh": "政策预期 Policy Expectations",
        "mode": "manual-live",
        "status": "available",
        "source": "manual_sme_file",
        "freshness_status": "Manual",
        "expected_update_frequency": "manual",
        "data_date": release_date,
        "summary": (
            f"SME release date is {release_date}. Latest fed funds median is {latest_ff}, "
            f"year-end 2026 median is {year_end_2026_ff}, and Policy Expectations Risk is {risk}."
        ),
        "summary_zh": (
            f"SME 发布时间为 {release_date}。最新联邦基金利率中位数为 {latest_ff}，"
            f"2026 年底中位数为 {year_end_2026_ff}，政策预期风险为 {risk}。"
        ),
        "interpretation": "The SME median path summarizes survey-based expectations for the fed funds path, inflation, recession risk, and balance sheet assumptions.",
        "interpretation_zh": "SME 用于观察 market participants 对 Fed funds path、inflation、recession risk 和 balance sheet 的调查型预期。",
        "why_it_matters": "Survey-based policy expectations help show whether market economists expect easing, steady policy, or a firmer policy path.",
        "why_it_matters_zh": "政策预期可以帮助判断市场是否预期降息、按兵不动，或更偏紧的政策路径。",
        "key_metrics": [
            {"label": "SME Release Date", "label_zh": "SME 发布时间 SME Release Date", "value": release_date or "Unavailable", "unit": ""},
            {"label": "Latest Fed Funds Median", "label_zh": "最新联邦基金利率中位数 Latest Fed Funds Median", "value": latest_ff, "unit": ""},
            {"label": "Year-end 2026 Fed Funds Median", "label_zh": "2026年底联邦基金利率中位数 Year-end 2026 Fed Funds Median", "value": year_end_2026_ff, "unit": ""},
            {"label": "U.S. Recession Now", "label_zh": "当前美国衰退概率 U.S. Recession Now", "value": us_now, "unit": ""},
            {"label": "U.S. Recession in 6 Months", "label_zh": "6个月美国衰退概率 U.S. Recession in 6 Months", "value": us_6m, "unit": ""},
            {"label": "Core PCE 2026 Median", "label_zh": "2026年 Core PCE 中位数 Core PCE 2026 Median", "value": core_pce_2026, "unit": ""},
            {"label": "Policy Expectations Risk", "label_zh": "政策预期风险 Policy Expectations Risk", "value": risk, "unit": ""},
        ],
        "tables": tables,
        "signals": [
            f"SME sheet used: {sheet_name}.",
            f"Global recession in 6 months median: {global_6m}.",
        ],
        "warnings": warnings,
        "caveat": "This section is based on a manually downloaded NY Fed SME file and should be interpreted as survey-based expectations, not forecast certainty.",
        "normalized_data_preview": df.head(10).fillna("").astype(str).to_dict(orient="records"),
        "last_refreshed_at": now,
    }


def save_policy_expectations_cache(section: dict[str, Any]) -> None:
    cache_dir = _project_root() / "data" / "cache" / "sections"
    cache_dir.mkdir(parents=True, exist_ok=True)
    output_path = cache_dir / "policy-expectations.json"
    try:
        output_path.write_text(json.dumps(section, indent=2), encoding="utf-8")
    except OSError:
        pass
