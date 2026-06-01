from __future__ import annotations

from .pd_common import build_single_series_section


def _pressure_label(percentile: str, **_: object) -> str:
    if percentile in ("Unavailable", "Limited sample"):
        return percentile
    try:
        value = float(percentile.replace("%", ""))
    except ValueError:
        return "Unavailable"
    if value < 50:
        return "Low / Normal"
    if value < 75:
        return "Moderate"
    if value < 90:
        return "Elevated"
    return "Extreme"


def build_dealer_inventory_section() -> dict:
    return build_single_series_section(
        section_name="dealer-inventory",
        interpretation="Dealer Inventory represents primary dealers’ net U.S. Treasury inventory. High historical percentiles may indicate that dealers are absorbing more supply and using more balance-sheet capacity.",
        interpretation_zh="Dealer Inventory 表示 primary dealers 持有的美国国债净库存规模。库存处于较高历史分位时，可能说明 dealer 正在吸收更多供给，并占用更多 balance sheet capacity。",
        why_it_matters="Large dealer inventories may indicate that dealers are absorbing more Treasury supply, which can matter for auction and secondary-market digestion.",
        why_it_matters_zh="较大的交易商库存可能表示 dealer 正在承接更多 Treasury supply，后续拍卖和二级市场吸收压力可能上升。",
        label_func=_pressure_label,
    )
