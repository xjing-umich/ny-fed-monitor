from __future__ import annotations

from .pd_common import build_single_series_section


def _usage_label(percentile: str, **_: object) -> str:
    if percentile in ("Unavailable", "Limited sample"):
        return percentile
    try:
        value = float(percentile.replace("%", ""))
    except ValueError:
        return "Unavailable"
    if value < 50:
        return "Normal"
    if value < 75:
        return "Moderate"
    if value < 90:
        return "Elevated"
    return "Elevated / High usage"


def build_repo_financing_section() -> dict:
    return build_single_series_section(
        section_name="repo-financing",
        interpretation="Repo Financing represents dealer secured funding usage for Treasury inventories. Higher usage can mean higher balance-sheet usage, but it does not automatically imply funding stress.",
        interpretation_zh="Repo Financing 表示 dealer 通过回购市场为证券库存融资的规模。使用量偏高可能说明 balance sheet usage 上升，但不一定代表 funding stress。",
        why_it_matters="Repo financing helps separate inventory funding needs from rate-based funding stress.",
        why_it_matters_zh="回购融资有助于区分库存融资需求上升，与真正的利率型 funding stress 之间的差别。",
        label_func=_usage_label,
    )
