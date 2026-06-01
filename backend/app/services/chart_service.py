from __future__ import annotations

from pathlib import Path
from typing import Iterable

import matplotlib

matplotlib.use("Agg")
import matplotlib.dates as mdates
import matplotlib.pyplot as plt
import pandas as pd


def setup_time_axis(ax) -> None:
    locator = mdates.AutoDateLocator(minticks=4, maxticks=7)
    formatter = mdates.ConciseDateFormatter(locator)
    ax.xaxis.set_major_locator(locator)
    ax.xaxis.set_major_formatter(formatter)
    plt.setp(ax.get_xticklabels(), rotation=0, ha="center")


def save_chart(fig, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    fig.autofmt_xdate()
    fig.tight_layout()
    fig.savefig(output_path, dpi=140, bbox_inches="tight")


def format_y_axis_units(ax, unit_type: str) -> None:
    mapping = {
        "billions": "billion dollars",
        "trillions": "trillion dollars",
        "bps": "basis points",
    }
    ax.set_ylabel(mapping.get(unit_type, unit_type))


def normalize_time_series_df(df: pd.DataFrame, date_col: str, value_cols: Iterable[str]) -> pd.DataFrame:
    normalized = df.copy()
    normalized[date_col] = pd.to_datetime(normalized[date_col], errors="coerce")
    for col in value_cols:
        normalized[col] = pd.to_numeric(normalized[col], errors="coerce")
    normalized = normalized.dropna(subset=[date_col, *value_cols]).sort_values(date_col)
    return normalized


def plot_time_series(
    df: pd.DataFrame,
    date_col: str,
    value_col: str,
    title: str,
    ylabel: str,
    output_path: Path,
    *,
    color: str = "#2563eb",
    linewidth: float = 1.8,
) -> None:
    normalized = normalize_time_series_df(df, date_col, [value_col])
    fig, ax = plt.subplots(figsize=(10, 4.5), dpi=140)
    marker = None if len(normalized) > 80 else "o"
    markersize = 2.5 if marker else None
    ax.plot(
        normalized[date_col],
        normalized[value_col],
        color=color,
        linewidth=linewidth,
        marker=marker,
        markersize=markersize,
    )
    ax.set_title(title)
    ax.grid(True, alpha=0.25)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.set_ylabel(ylabel)
    setup_time_axis(ax)
    save_chart(fig, output_path)
    plt.close(fig)
