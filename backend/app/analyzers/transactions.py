from __future__ import annotations

from .pd_common import build_single_series_section


def _activity_label(one_week_change, percentile, **_: object) -> str:
    if one_week_change is None:
        return "Unavailable"
    if one_week_change < 0:
        if percentile not in ("Unavailable", "Limited sample"):
            try:
                pct = float(percentile.replace("%", ""))
                if pct >= 75:
                    return "High activity despite weekly decline"
            except ValueError:
                pass
        return "Watch / Mild"
    return "Stable / improving"


def build_transactions_section() -> dict:
    return build_single_series_section(
        section_name="transactions",
        interpretation="Transactions represent primary dealer activity in the Treasury market. Lower activity can suggest softer liquidity, but it should be read together with fails, rates, and auction demand.",
        interpretation_zh="Transactions 表示 primary dealers 在美债市场的成交活动。成交下降可能说明流动性走弱，但需要和 fails、利率、auction demand 一起判断。",
        why_it_matters="Transaction activity helps monitor market depth and whether dealer intermediation remains active.",
        why_it_matters_zh="成交活动有助于观察市场深度，以及 dealer 中介功能是否仍然活跃。",
        label_func=_activity_label,
    )
