import json
import os
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .analyzers.dealer_inventory import build_dealer_inventory_section
from .analyzers.auction import build_auction_section, save_auction_cache
from .analyzers.fails import build_fails_specialness_section
from .analyzers.facility_usage import build_facility_usage_section, save_facility_usage_cache
from .analyzers.market_share import build_market_share_section, save_market_share_cache
from .analyzers.pd_common import SERIES_DEFINITIONS, save_section_cache
from .analyzers.policy_expectations import (
    build_policy_expectations_section,
    save_policy_expectations_cache,
)
from .analyzers.reference_rates import build_reference_rates_section, save_reference_rates_cache
from .analyzers.repo_financing import build_repo_financing_section
from .analyzers.soma import build_soma_section, save_soma_cache
from .analyzers.transactions import build_transactions_section
from .mock_data import REFRESH_STATUS, SECTIONS
from .services.freshness_service import compute_global_freshness_summary, refresh_schedule_rows

app = FastAPI(
    title="NY Fed Treasury Web Agent",
    version="0.1.0",
    description="Clean mock-data FastAPI backend for the NY Fed Treasury dashboard.",
)


def allowed_origins() -> list[str]:
    origins = ["http://localhost:5174", "http://127.0.0.1:5174"]
    frontend_url = os.getenv("FRONTEND_URL", "").strip()
    if frontend_url and frontend_url not in origins:
        origins.append(frontend_url)
    return origins

PROJECT_ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = PROJECT_ROOT / "data" / "cache"
CACHE_DIR.mkdir(parents=True, exist_ok=True)
SUMMARY_CACHE_PATH = CACHE_DIR / "latest_summary.json"
ASSETS_DIR = PROJECT_ROOT / "data" / "reports" / "assets"
ASSETS_DIR.mkdir(parents=True, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "mode": "mixed",
        "service": "nyfed-treasury-web-agent",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/api/summary")
def summary() -> dict[str, Any]:
    sections_map = get_sections()
    live_keys = [key for key, value in sections_map.items() if value.get("mode") in {"live", "manual-live"}]
    data_mode = "partial-live" if live_keys and len(live_keys) < len(sections_map) else "live" if live_keys else "mock"
    sections = [
        {
            "key": key,
            "title": value["title"],
            "title_zh": value["title_zh"],
            "freshness_status": value["freshness_status"],
            "data_date": value["data_date"],
            "summary": value["summary"],
            "summary_zh": value["summary_zh"],
            "key_metrics": value["key_metrics"][:2],
            "mode": value.get("mode", "mock"),
        }
        for key, value in sections_map.items()
    ]
    funding_card = build_funding_rate_stress_card(sections_map["reference-rates"])
    dealer_inventory_card = build_dealer_inventory_card(sections_map["dealer-inventory"])
    repo_financing_card = build_repo_financing_card(sections_map["repo-financing"])
    liquidity_card = build_liquidity_stress_card(sections_map["transactions"], sections_map["fails"])
    auction_risk_card = build_auction_risk_card(sections_map["auction-risk"])
    policy_expectations_card = build_policy_expectations_card(sections_map["policy-expectations"])
    facility_usage_card = build_facility_usage_card(sections_map["facility-usage"])
    payload = {
        "mode": data_mode,
        "data_mode": data_mode,
        "live_sections": live_keys,
        "mock_sections": [key for key, value in sections_map.items() if value.get("mode") == "mock"],
        "partial_sections": [key for key, value in sections_map.items() if value.get("mode") in {"partial", "partial-live"}],
        "unavailable_sections": [
            key
            for key, value in sections_map.items()
            if value.get("mode") in {"unavailable", "manual-missing"} or value.get("freshness_status") == "Missing"
        ],
        "headline": "NY Fed Treasury dashboard partial live rebuild",
        "headline_zh": "NY Fed 美债仪表盘分阶段接线版",
        "subtitle": "Some modules are connected to live data; remaining modules may still show mock or unavailable values.",
        "subtitle_zh": "当前部分模块已接入实时数据，未接入模块仍显示 mock / unavailable。",
        "live_modules_note": (
            f"Live modules: {', '.join(live_keys) if live_keys else 'none'}. Other modules are not connected yet."
        ),
        "live_modules_note_zh": (
            f"已接入实时数据模块：{'、'.join(live_keys) if live_keys else '无'}。其他模块尚未接入真实数据。"
        ),
        "as_of": datetime.now(timezone.utc).isoformat(),
        "global_freshness_status": sections_map["reference-rates"]["freshness_status"],
        "global_freshness_summary": compute_global_freshness_summary(
            [
                {"freshness_status": value["freshness_status"]}
                for key, value in sections_map.items()
                if key not in {"overall-regime", "data-freshness", "appendix"}
            ]
        ),
        "sections": sections,
        "data_source_status": [
            {
                "section": key,
                "status": value["freshness_status"],
                "data_date": value["data_date"],
                "source": value.get("source", "mock"),
                "expected_update_frequency": value.get("expected_update_frequency"),
                "last_refreshed_at": value.get("last_refreshed_at"),
                "mode": value.get("mode", "mock"),
            }
            for key, value in sections_map.items()
        ],
        "data_coverage_summary": {
            "live_sections": live_keys,
            "partial_sections": [key for key, value in sections_map.items() if value.get("mode") in {"partial", "partial-live"}],
            "mock_sections": [key for key, value in sections_map.items() if value.get("mode") == "mock"],
            "unavailable_sections": [
                key
                for key, value in sections_map.items()
                if value.get("mode") in {"unavailable", "manual-missing"} or value.get("freshness_status") in {"Missing", "Unavailable"}
            ],
            "missing_critical_sections": [
                key
                for key in ["market-share", "policy-expectations", "facility-usage"]
                if sections_map.get(key, {}).get("mode") not in {"live", "manual-live"}
            ],
        },
        "cards": [
            dealer_inventory_card,
            repo_financing_card,
            {
                "id": "funding_rate_stress",
                "label": {"en": "Funding Rate Stress", "zh": "融资利率压力 Funding Rate Stress"},
                **funding_card,
            },
            liquidity_card,
            auction_risk_card,
            policy_expectations_card,
            facility_usage_card,
        ],
    }
    try:
        SUMMARY_CACHE_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass
    return payload


@app.get("/api/sections/{section_name}")
def section(section_name: str) -> dict[str, Any]:
    sections_map = get_sections()
    if section_name not in sections_map:
        raise HTTPException(status_code=404, detail=f"Unknown section: {section_name}")
    section_payload = {"key": section_name, **sections_map[section_name]}
    return section_payload


_refresh_lock = threading.Lock()


def _run_refresh() -> None:
    try:
        get_sections(force_refresh=True)
        REFRESH_STATUS.update(
            {
                "state": "completed",
                "last_finished_at": datetime.now(timezone.utc).isoformat(),
                "message": "Refresh completed. Live datasets were updated from the source APIs when available.",
            }
        )
    except Exception as exc:  # noqa: BLE001 - surface any refresh failure to the status endpoint
        REFRESH_STATUS.update(
            {
                "state": "error",
                "last_finished_at": datetime.now(timezone.utc).isoformat(),
                "message": f"Refresh failed: {exc}",
            }
        )
    finally:
        if _refresh_lock.locked():
            _refresh_lock.release()


@app.post("/api/refresh/all")
def refresh_all() -> dict[str, Any]:
    if not _refresh_lock.acquire(blocking=False):
        return REFRESH_STATUS
    REFRESH_STATUS.update(
        {
            "state": "running",
            "last_started_at": datetime.now(timezone.utc).isoformat(),
            "last_finished_at": None,
            "message": "Refresh in progress. Fetching live datasets from the source APIs.",
        }
    )
    threading.Thread(target=_run_refresh, daemon=True).start()
    return REFRESH_STATUS


@app.get("/api/status/refresh")
def refresh_status() -> dict[str, Any]:
    return REFRESH_STATUS


@app.get("/api/debug/analysis-keys")
def analysis_keys() -> dict[str, Any]:
    sections_map = get_sections()
    market_share_debug = sections_map.get("market-share", {}).get("debug", {})
    return {
        "mode": "mixed",
        "section_keys": list(sections_map.keys()),
        "cache_keys": [path.name for path in (CACHE_DIR / "sections").glob("*.json")] if (CACHE_DIR / "sections").exists() else [],
        "live_sections": [key for key, value in sections_map.items() if value.get("mode") in {"live", "manual-live"}],
        "mock_sections": [key for key, value in sections_map.items() if value.get("mode") == "mock"],
        "unavailable_sections": [
            key
            for key, value in sections_map.items()
            if value.get("mode") in {"unavailable", "manual-missing"} or value.get("freshness_status") in {"Missing", "Unavailable"}
        ],
        "future_real_data_modules": [
            "auction",
            "policy_expectations",
            "facility_usage",
        ],
        "reference_rates_keys": list(sections_map["reference-rates"].keys()),
        "soma_keys": list(sections_map["soma"].keys()),
        "market_share_raw_top_level_keys": market_share_debug.get("market_share_raw_top_level_keys", {}),
        "market_share_quarterly_row_count": market_share_debug.get("market_share_quarterly_row_count", 0),
        "market_share_ytd_row_count": market_share_debug.get("market_share_ytd_row_count", 0),
        "market_share_normalized_row_count": market_share_debug.get("market_share_normalized_row_count", 0),
        "market_share_selected_max_row": market_share_debug.get("market_share_selected_max_row"),
        "market_share_warnings": market_share_debug.get("market_share_warnings", []),
        "selected_primary_dealer_keyids": {
            "dealer_inventory": SERIES_DEFINITIONS["dealer-inventory"]["keyid"],
            "transactions": SERIES_DEFINITIONS["transactions"]["keyid"],
            "repo_financing": SERIES_DEFINITIONS["repo-financing"]["keyid"],
            "fails_deliver": SERIES_DEFINITIONS["fails-deliver"]["keyid"],
            "fails_receive": SERIES_DEFINITIONS["fails-receive"]["keyid"],
            "long_end_inventory": SERIES_DEFINITIONS["long-end-inventory"]["keyid"],
        },
        "warnings": sections_map.get("dealer-inventory", {}).get("warnings", [])
        + sections_map.get("transactions", {}).get("warnings", [])
        + sections_map.get("repo-financing", {}).get("warnings", [])
        + sections_map.get("fails", {}).get("warnings", [])
        + sections_map.get("auction-risk", {}).get("warnings", [])
        + sections_map.get("policy-expectations", {}).get("warnings", [])
        + sections_map.get("facility-usage", {}).get("warnings", []),
    }


def _finalize_live_mode(section: dict[str, Any]) -> dict[str, Any]:
    """Downgrade a section from 'live' to 'unavailable' when it carries no usable data.

    A live fetch can succeed at the HTTP level yet return an empty payload (e.g. a NY Fed
    connection reset), leaving a section with no data_date and a Missing/Unavailable
    freshness. Labeling that 'live' would misrepresent data coverage, so we correct it here.
    """
    if section.get("mode") != "live":
        return section
    if not section.get("data_date") or section.get("freshness_status") in {"Missing", "Unavailable", None}:
        section["mode"] = "unavailable"
    return section


SECTIONS_TTL_SECONDS = 60.0
_sections_lock = threading.Lock()
_sections_cache: dict[str, Any] | None = None
_sections_cache_at: float = 0.0


def _cache_is_fresh() -> bool:
    return _sections_cache is not None and (time.monotonic() - _sections_cache_at) < SECTIONS_TTL_SECONDS


def get_sections(force_refresh: bool = False) -> dict[str, Any]:
    """Return the assembled section map, served from a short-lived in-memory cache.

    Without this cache, every /summary, /sections, and /debug request rebuilt all
    sections (re-reading ~10 cache files and rewriting coverage artifacts each time).
    A live refresh (force_refresh=True) always rebuilds and repopulates the cache.
    """
    global _sections_cache, _sections_cache_at
    if not force_refresh and _cache_is_fresh():
        return _sections_cache
    with _sections_lock:
        if not force_refresh and _cache_is_fresh():
            return _sections_cache
        sections_map = _build_sections(force_refresh=force_refresh)
        _sections_cache = sections_map
        _sections_cache_at = time.monotonic()
        return sections_map


def _build_sections(force_refresh: bool = False) -> dict[str, Any]:
    sections_map = {key: dict(value) for key, value in SECTIONS.items()}
    sections_map["dealer-inventory"] = _finalize_live_mode(get_pd_section("dealer-inventory", force_refresh=force_refresh))
    sections_map["transactions"] = _finalize_live_mode(get_pd_section("transactions", force_refresh=force_refresh))
    sections_map["repo-financing"] = _finalize_live_mode(get_pd_section("repo-financing", force_refresh=force_refresh))
    sections_map["fails"] = _finalize_live_mode(get_pd_section("fails", force_refresh=force_refresh))
    sections_map["market-share"] = _finalize_live_mode(get_market_share_section(force_refresh=force_refresh))
    sections_map["reference-rates"] = _finalize_live_mode(get_reference_rates_section(force_refresh=force_refresh))
    sections_map["soma"] = _finalize_live_mode(get_soma_section(force_refresh=force_refresh))
    sections_map["policy-expectations"] = get_policy_expectations_section(force_refresh=force_refresh)
    sections_map["facility-usage"] = _finalize_live_mode(get_facility_usage_section(
        sections_map["reference-rates"], force_refresh=force_refresh
    ))
    sections_map["auction-risk"] = _finalize_live_mode(get_auction_section(
        sections_map["dealer-inventory"],
        sections_map["transactions"],
        sections_map["fails"],
        force_refresh=force_refresh,
    ))
    sections_map["overall-regime"] = build_overall_regime_section(sections_map)
    sections_map["data-freshness"] = build_data_freshness_section(sections_map)
    sections_map["appendix"] = build_appendix_section(sections_map)
    sections_map["data-coverage"] = build_data_coverage_section(sections_map)
    generate_data_coverage_artifacts(sections_map)
    return sections_map


def get_auction_section(
    dealer_inventory_section: dict[str, Any],
    transactions_section: dict[str, Any],
    fails_section: dict[str, Any],
    force_refresh: bool = False,
) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / "auction-risk.json"
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached["mode"] = "live"
            cached["source"] = "treasury_fiscaldata"
            return cached
        except json.JSONDecodeError:
            pass
    try:
        section = build_auction_section(dealer_inventory_section, transactions_section, fails_section)
        save_auction_cache(section)
        section["mode"] = "live"
        section["source"] = "treasury_fiscaldata"
        return section
    except Exception as exc:
        fallback = dict(SECTIONS["auction-risk"])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc)]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "treasury_fiscaldata"
    return fallback


def get_market_share_section(force_refresh: bool = False) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / "market-share.json"
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached["source"] = "nyfed_marketshare"
            if cached.get("mode") == "live":
                return cached
            if cached.get("freshness_status") in {"Missing", "Unavailable"} or not cached.get("data_date"):
                cached["mode"] = "unavailable"
            return cached
        except json.JSONDecodeError:
            pass

    try:
        section = build_market_share_section()
        save_market_share_cache(section)
        section["source"] = "nyfed_marketshare"
        if section.get("freshness_status") in {"Missing", "Unavailable"} or not section.get("data_date"):
            section["mode"] = "unavailable" if section.get("mode") != "live" else section.get("mode")
        return section
    except Exception as exc:
        fallback = dict(SECTIONS["market-share"])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc), "Market Share not yet connected to live data."]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "nyfed_marketshare"
        fallback["freshness_status"] = "Unavailable"
        fallback["data_date"] = None
        fallback["expected_update_frequency"] = "quarterly"
        fallback["summary"] = "Market Share data unavailable."
        fallback["summary_zh"] = "Market Share 数据当前不可用。"
        return fallback


def get_facility_usage_section(reference_rates_section: dict[str, Any], force_refresh: bool = False) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / "facility-usage.json"
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached["source"] = "nyfed_repo_reverse_repo"
            latest_metric = next(
                (m for m in cached.get("key_metrics", []) if m.get("label") == "ON RRP Latest Usage"),
                None,
            )
            should_rebuild = (
                cached.get("freshness_status") in {"Missing", "Unavailable"}
                or not cached.get("data_date")
                or (latest_metric or {}).get("value") in {None, "", "Unavailable"}
            )
            if not should_rebuild:
                return cached
        except json.JSONDecodeError:
            pass

    try:
        section = build_facility_usage_section(reference_rates_section)
        save_facility_usage_cache(section)
        section["source"] = "nyfed_repo_reverse_repo"
        if section.get("freshness_status") in {"Missing", "Unavailable"} or not section.get("data_date"):
            section["mode"] = "unavailable"
        return section
    except Exception as exc:
        fallback = dict(SECTIONS["facility-usage"])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc)]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "nyfed_repo_reverse_repo"
        return fallback


def get_policy_expectations_section(force_refresh: bool = False) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / "policy-expectations.json"
    from .analyzers.policy_expectations import _load_config, _resolve_sme_path
    config = _load_config()
    sme_path = _resolve_sme_path(config)
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            if cached.get("mode") in {"live", "manual-live"}:
                cached["source"] = "manual_sme_file"
            if cached.get("mode") == "manual-missing" and sme_path.exists():
                pass
            elif cached.get("mode") == "manual-live" and not sme_path.exists():
                pass
            else:
                return cached
        except json.JSONDecodeError:
            pass

    try:
        section = build_policy_expectations_section()
        try:
            save_policy_expectations_cache(section)
        except OSError:
            section["warnings"] = list(section.get("warnings", [])) + ["Policy Expectations cache write skipped."]
        section["source"] = "manual_sme_file"
        return section
    except Exception as exc:
        fallback = dict(SECTIONS["policy-expectations"])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc)]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "manual_sme_file"
        return fallback


def get_pd_section(section_name: str, force_refresh: bool = False) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / f"{section_name}.json"
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached["mode"] = "live"
            cached["source"] = "nyfed"
            return cached
        except json.JSONDecodeError:
            pass

    builders = {
        "dealer-inventory": build_dealer_inventory_section,
        "transactions": build_transactions_section,
        "repo-financing": build_repo_financing_section,
        "fails": build_fails_specialness_section,
    }
    try:
        section = builders[section_name]()
        save_section_cache(section_name, section)
        section["mode"] = "live"
        section["source"] = "nyfed"
        return section
    except Exception as exc:
        fallback = dict(SECTIONS[section_name])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc)]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "nyfed"
        fallback["freshness_status"] = "Unavailable"
        fallback["data_date"] = None
        fallback["expected_update_frequency"] = "weekly"
        fallback["summary"] = f"{fallback['title']} data unavailable."
        fallback["summary_zh"] = f"{fallback['title_zh']} 数据当前不可用。"
        return fallback


def get_reference_rates_section(force_refresh: bool = False) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / "reference-rates.json"
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached["mode"] = "live"
            cached["source"] = "nyfed"
            should_rebuild = (
                not cached.get("chart_url")
                and cached.get("normalized_data")
                and cached.get("data_date")
            )
            if not should_rebuild:
                return cached
        except json.JSONDecodeError:
            pass

    try:
        section = build_reference_rates_section()
        save_reference_rates_cache(section)
        section["mode"] = "live"
        section["source"] = "nyfed"
        return section
    except Exception as exc:
        fallback = dict(SECTIONS["reference-rates"])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc)]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "nyfed"
        fallback["freshness_status"] = "Unavailable"
        fallback["data_date"] = None
        return fallback


def get_soma_section(force_refresh: bool = False) -> dict[str, Any]:
    cache_path = CACHE_DIR / "sections" / "soma.json"
    if cache_path.exists() and not force_refresh:
        try:
            cached = json.loads(cache_path.read_text(encoding="utf-8"))
            cached["mode"] = "live"
            cached["source"] = "nyfed"
            return cached
        except json.JSONDecodeError:
            pass

    try:
        section = build_soma_section()
        save_soma_cache(section)
        section["mode"] = "live"
        section["source"] = "nyfed"
        return section
    except Exception as exc:
        fallback = dict(SECTIONS["soma"])
        fallback["warnings"] = list(fallback.get("warnings", [])) + [str(exc)]
        fallback["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
        fallback["mode"] = "unavailable"
        fallback["source"] = "nyfed"
        fallback["freshness_status"] = "Unavailable"
        fallback["data_date"] = None
        return fallback


def build_funding_rate_stress_card(reference_section: dict[str, Any]) -> dict[str, Any]:
    spread_metric = next(
        (metric for metric in reference_section.get("key_metrics", []) if metric.get("label") == "SOFR-EFFR"),
        None,
    )
    stress_metric = next(
        (
            metric
            for metric in reference_section.get("key_metrics", [])
            if metric.get("label") == "Funding Rate Stress"
        ),
        None,
    )
    return {
        "value": (stress_metric or {}).get("value", "Unavailable"),
        "detail": {
            "en": f"SOFR-EFFR spread: {(spread_metric or {}).get('value', 'Unavailable')}",
            "zh": f"SOFR-EFFR 利差: {(spread_metric or {}).get('value', 'Unavailable')}",
        },
    }


def build_dealer_inventory_card(section: dict[str, Any]) -> dict[str, Any]:
    label_metric = next((metric for metric in section.get("key_metrics", []) if metric.get("label") == "Pressure Label"), None)
    latest_metric = next((metric for metric in section.get("key_metrics", []) if metric.get("label") == "Latest Level"), None)
    return {
        "id": "dealer_inventory_pressure",
        "label": {"en": "Dealer Inventory Pressure", "zh": "交易商库存压力 Dealer Inventory Pressure"},
        "value": (label_metric or {}).get("value", "Unavailable"),
        "detail": {
            "en": f"Latest level: {(latest_metric or {}).get('value', 'Unavailable')}",
            "zh": f"当前规模: {(latest_metric or {}).get('value', 'Unavailable')}",
        },
    }


def build_repo_financing_card(section: dict[str, Any]) -> dict[str, Any]:
    label_metric = next((metric for metric in section.get("key_metrics", []) if metric.get("label") == "Usage Label"), None)
    latest_metric = next((metric for metric in section.get("key_metrics", []) if metric.get("label") == "Latest Level"), None)
    return {
        "id": "repo_financing_usage",
        "label": {"en": "Repo Financing Usage", "zh": "回购融资使用 Repo Financing Usage"},
        "value": (label_metric or {}).get("value", "Unavailable"),
        "detail": {
            "en": f"Latest level: {(latest_metric or {}).get('value', 'Unavailable')}",
            "zh": f"当前规模: {(latest_metric or {}).get('value', 'Unavailable')}",
        },
    }


def build_liquidity_stress_card(transactions_section: dict[str, Any], fails_section: dict[str, Any]) -> dict[str, Any]:
    txn_dir = next((metric for metric in transactions_section.get("key_metrics", []) if metric.get("label") == "Activity Direction"), None)
    fails_dir = next((metric for metric in fails_section.get("key_metrics", []) if metric.get("label") == "Fails Direction"), None)
    value = "Normal"
    if (txn_dir or {}).get("value") in ("Watch / Mild", "Unavailable") and (fails_dir or {}).get("value") == "rising":
        value = "Watch"
    return {
        "id": "liquidity_stress",
        "label": {"en": "Liquidity Stress", "zh": "流动性压力 Liquidity Stress"},
        "value": value,
        "detail": {
            "en": f"Transactions: {(txn_dir or {}).get('value', 'Unavailable')} | Fails: {(fails_dir or {}).get('value', 'Unavailable')}",
            "zh": f"成交: {(txn_dir or {}).get('value', 'Unavailable')} | Fails: {(fails_dir or {}).get('value', 'Unavailable')}",
        },
    }


def build_auction_risk_card(section: dict[str, Any]) -> dict[str, Any]:
    risk_metric = next((metric for metric in section.get("key_metrics", []) if metric.get("label") == "Auction Risk"), None)
    supply_metric = next((metric for metric in section.get("key_metrics", []) if metric.get("label") == "Upcoming 14-day Supply"), None)
    return {
        "id": "auction_risk",
        "label": {"en": "Auction Risk", "zh": "拍卖风险 Auction Risk"},
        "value": (risk_metric or {}).get("value", "Unavailable"),
        "detail": {
            "en": f"Upcoming 14-day supply: {(supply_metric or {}).get('value', 'Unavailable')}",
            "zh": f"未来14天供给: {(supply_metric or {}).get('value', 'Unavailable')}",
        },
    }


def build_policy_expectations_card(section: dict[str, Any]) -> dict[str, Any]:
    risk_metric = next((m for m in section.get("key_metrics", []) if m.get("label") == "Policy Expectations Risk"), None)
    release_metric = next((m for m in section.get("key_metrics", []) if m.get("label") == "SME Release Date"), None)
    return {
        "id": "policy_expectations_risk",
        "label": {"en": "Policy Expectations Risk", "zh": "政策预期风险 Policy Expectations Risk"},
        "value": (risk_metric or {}).get("value", "Unavailable"),
        "detail": {
            "en": f"SME release date: {(release_metric or {}).get('value', 'Unavailable')}",
            "zh": f"SME 发布时间: {(release_metric or {}).get('value', 'Unavailable')}",
        },
    }


def build_facility_usage_card(section: dict[str, Any]) -> dict[str, Any]:
    signal_metric = next((m for m in section.get("key_metrics", []) if m.get("label") == "Facility Usage Signal"), None)
    on_rrp_metric = next((m for m in section.get("key_metrics", []) if m.get("label") == "ON RRP Latest Usage"), None)
    return {
        "id": "facility_usage_signal",
        "label": {"en": "Facility Usage Signal", "zh": "资金工具信号 Facility Usage Signal"},
        "value": (signal_metric or {}).get("value", "Unavailable"),
        "detail": {
            "en": f"ON RRP latest usage: {(on_rrp_metric or {}).get('value', 'Unavailable')}",
            "zh": f"ON RRP 最新使用量: {(on_rrp_metric or {}).get('value', 'Unavailable')}",
        },
    }


def build_data_freshness_section(sections_map: dict[str, Any]) -> dict[str, Any]:
    live_sections = [key for key, section in sections_map.items() if section.get("mode") in {"live", "manual-live"}]
    unavailable_sections = [key for key, section in sections_map.items() if section.get("mode") in {"unavailable", "manual-missing"}]
    section = dict(SECTIONS["data-freshness"])
    section["mode"] = "live"
    section["status"] = "available"
    section["source"] = "derived"
    section["freshness_status"] = "Fresh"
    section["expected_update_frequency"] = "derived"
    section["data_date"] = datetime.now(timezone.utc).date().isoformat()
    section["summary"] = "Refresh guide and update schedule for every module."
    section["summary_zh"] = "展示各模块的数据更新频率、刷新方式和新鲜度规则。"
    section["interpretation"] = (
        "Clicking Refresh updates all API-based datasets and reruns the analyzer. "
        "SME policy expectations update only after the local Excel/CSV file is replaced."
    )
    section["interpretation_zh"] = (
        "点击 Refresh 会更新所有可通过 API 获取的数据，并重新运行分析器。"
        "SME 政策预期数据需要先手动替换 Excel/CSV 文件后才会更新。"
    )
    section["why_it_matters"] = "Freshness labels help distinguish between current, stale, manual, and unavailable data."
    section["why_it_matters_zh"] = "新鲜度标签有助于区分当前、过期、手动更新和不可用的数据状态。"
    section["key_metrics"] = [
        {"label": "Connected Feeds", "label_zh": "已连接数据源 Connected Feeds", "value": str(len(live_sections)), "unit": ""},
        {"label": "Unavailable Sections", "label_zh": "不可用模块 Unavailable Sections", "value": str(len(unavailable_sections)), "unit": ""},
        {"label": "Refresh Button", "label_zh": "刷新按钮 Refresh Button", "value": "Refresh Data", "unit": ""},
    ]
    section["tables"] = [
        {
            "title": "Update Schedule",
            "title_zh": "更新频率 Update Schedule",
            "columns": ["Dataset", "Module", "Suggested frequency", "Fresh if", "Stale if", "Update method"],
            "rows": refresh_schedule_rows(),
        }
    ]
    section["signals"] = [
        "Daily datasets refresh through API calls when available.",
        "Manual SME updates require replacing the local file before clicking Refresh.",
    ]
    section["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
    return section


def build_appendix_section(sections_map: dict[str, Any]) -> dict[str, Any]:
    appendix_rows = [
        {
            "Metric": "Dealer Inventory",
            "Source": "NY Fed PD",
            "Keyid or endpoint": SERIES_DEFINITIONS["dealer-inventory"]["keyid"],
            "Latest date": sections_map["dealer-inventory"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["dealer-inventory"].get("key_metrics", []) if m.get("label") == "Latest Level"), "Unavailable"),
            "Status": sections_map["dealer-inventory"].get("freshness_status"),
        },
        {
            "Metric": "Transactions",
            "Source": "NY Fed PD",
            "Keyid or endpoint": SERIES_DEFINITIONS["transactions"]["keyid"],
            "Latest date": sections_map["transactions"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["transactions"].get("key_metrics", []) if m.get("label") == "Latest Level"), "Unavailable"),
            "Status": sections_map["transactions"].get("freshness_status"),
        },
        {
            "Metric": "Repo Financing",
            "Source": "NY Fed PD",
            "Keyid or endpoint": SERIES_DEFINITIONS["repo-financing"]["keyid"],
            "Latest date": sections_map["repo-financing"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["repo-financing"].get("key_metrics", []) if m.get("label") == "Latest Level"), "Unavailable"),
            "Status": sections_map["repo-financing"].get("freshness_status"),
        },
        {
            "Metric": "Fails",
            "Source": "NY Fed PD",
            "Keyid or endpoint": "PDFTD-USTET / PDFTR-USTET",
            "Latest date": sections_map["fails"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["fails"].get("key_metrics", []) if m.get("label") == "Latest Fails Measure"), "Unavailable"),
            "Status": sections_map["fails"].get("freshness_status"),
        },
        {
            "Metric": "Reference Rates",
            "Source": "NY Fed Rates",
            "Keyid or endpoint": "SOFR / EFFR / OBFR / TGCR / BGCR",
            "Latest date": sections_map["reference-rates"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["reference-rates"].get("key_metrics", []) if m.get("label") == "SOFR-EFFR"), "Unavailable"),
            "Status": sections_map["reference-rates"].get("freshness_status"),
        },
        {
            "Metric": "Market Share",
            "Source": "NY Fed Market Share",
            "Keyid or endpoint": "qtrly/latest.json + ytd/latest.json",
            "Latest date": sections_map["market-share"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["market-share"].get("key_metrics", []) if m.get("label") == "Max First-Quintile Share"), "Unavailable"),
            "Status": sections_map["market-share"].get("freshness_status"),
        },
        {
            "Metric": "SOMA",
            "Source": "NY Fed SOMA",
            "Keyid or endpoint": "https://markets.newyorkfed.org/api/soma/summary.json",
            "Latest date": sections_map["soma"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["soma"].get("key_metrics", []) if m.get("label") == "Latest Treasury Holdings"), "Unavailable"),
            "Status": sections_map["soma"].get("freshness_status"),
        },
        {
            "Metric": "Auction Risk",
            "Source": "U.S. Treasury FiscalData",
            "Keyid or endpoint": "auctions_query",
            "Latest date": sections_map["auction-risk"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["auction-risk"].get("key_metrics", []) if m.get("label") == "Auction Risk"), "Unavailable"),
            "Status": sections_map["auction-risk"].get("freshness_status"),
        },
        {
            "Metric": "Policy Expectations",
            "Source": "Manual SME file",
            "Keyid or endpoint": "data/manual/sme_latest.xlsx",
            "Latest date": sections_map["policy-expectations"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["policy-expectations"].get("key_metrics", []) if m.get("label") == "Policy Expectations Risk"), "Unavailable"),
            "Status": sections_map["policy-expectations"].get("freshness_status"),
        },
        {
            "Metric": "Facility Usage",
            "Source": "NY Fed RP/RRP",
            "Keyid or endpoint": "https://markets.newyorkfed.org/api/rp/all/all/results/lastTwoWeeks.json",
            "Latest date": sections_map["facility-usage"].get("data_date"),
            "Formatted value": next((m.get("value") for m in sections_map["facility-usage"].get("key_metrics", []) if m.get("label") == "Facility Usage Signal"), "Unavailable"),
            "Status": sections_map["facility-usage"].get("freshness_status"),
        },
    ]
    full_details = []
    for section_key in ["dealer-inventory", "transactions", "repo-financing", "fails"]:
        for row in sections_map.get(section_key, {}).get("series_used", []):
            full_details.append(
                {
                    "Metric": row.get("metric"),
                    "Keyid": row.get("keyid"),
                    "Latest date": row.get("latest_date"),
                    "Formatted value": row.get("formatted_value"),
                    "Status": row.get("status"),
                    "Description": row.get("description", ""),
                }
            )
    return {
        "title": "Data Appendix and Series Used",
        "title_zh": "数据来源 Appendix",
        "mode": "live",
        "status": "available",
        "source": "derived",
        "freshness_status": "Fresh",
        "expected_update_frequency": "derived",
        "data_date": datetime.now(timezone.utc).date().isoformat(),
        "summary": "Compact provenance view for the key metrics used in the dashboard.",
        "summary_zh": "展示当前仪表盘核心指标所使用的数据来源和序列。",
        "interpretation": "This appendix shows the main data sources, keyids, endpoints, and latest values used in the dashboard.",
        "interpretation_zh": "本附录展示仪表盘使用的主要数据来源、keyid、endpoint 和最新取值。",
        "why_it_matters": "A compact audit trail makes it easier to verify whether a section is live, manual, stale, or unavailable.",
        "why_it_matters_zh": "简洁的审计信息有助于快速判断某个模块当前是实时、手动、过期还是不可用。",
        "key_metrics": [
            {"label": "Appendix Rows", "label_zh": "附录行数 Appendix Rows", "value": str(len(appendix_rows)), "unit": ""},
            {"label": "Detailed Series Rows", "label_zh": "详细序列行数 Detailed Series Rows", "value": str(len(full_details)), "unit": ""},
        ],
        "tables": [
            {
                "title": "Compact Source Table",
                "title_zh": "简表 Compact Source Table",
                "columns": ["Metric", "Source", "Keyid or endpoint", "Latest date", "Formatted value", "Status"],
                "rows": appendix_rows,
            },
            {
                "title": "Full Series Details",
                "title_zh": "详细序列 Full Series Details",
                "columns": ["Metric", "Keyid", "Latest date", "Formatted value", "Status", "Description"],
                "rows": full_details,
            },
        ],
        "warnings": [],
        "signals": ["Appendix rows are compiled from live and manual sections.", "Descriptions come from section-level provenance where available."],
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


def _section_expected_table(section_key: str) -> bool:
    return section_key in {
        "auction-risk",
        "policy-expectations",
        "facility-usage",
        "data-freshness",
        "appendix",
        "data-coverage",
    }


def _section_expected_chart(section_key: str) -> bool:
    return section_key in {
        "dealer-inventory",
        "transactions",
        "repo-financing",
        "fails",
        "soma",
        "facility-usage",
    }


def _count_unavailable_metrics(section: dict[str, Any]) -> int:
    return sum(1 for metric in section.get("key_metrics", []) if str(metric.get("value")) == "Unavailable")


def build_data_coverage_section(sections_map: dict[str, Any]) -> dict[str, Any]:
    rows = []
    notes = []
    for section_key in [
        "dealer-inventory",
        "transactions",
        "repo-financing",
        "fails",
        "market-share",
        "auction-risk",
        "soma",
        "reference-rates",
        "policy-expectations",
        "facility-usage",
        "data-freshness",
        "appendix",
    ]:
        section = sections_map.get(section_key, {})
        unavailable_metrics = _count_unavailable_metrics(section)
        tables_present = bool(section.get("tables"))
        chart_present = bool(section.get("chart_url") or section.get("chart_urls"))
        missing_fields = []
        if unavailable_metrics:
            missing_fields.append(f"{unavailable_metrics} key metrics unavailable")
        if _section_expected_table(section_key) and not tables_present:
            missing_fields.append("expected tables missing")
        if _section_expected_chart(section_key) and not chart_present:
            missing_fields.append("expected chart missing")
        if section_key == "market-share" and section.get("mode") != "live":
            notes.append("Market Share not yet connected to live data.")
        rows.append(
            {
                "Section": section_key,
                "Mode": section.get("mode", "mock"),
                "Data Source": section.get("source", "mock"),
                "Data Date": section.get("data_date") or "Unavailable",
                "Freshness": section.get("freshness_status", "Unavailable"),
                "Missing Fields": "; ".join(missing_fields) if missing_fields else "None",
                "Status": "OK" if section.get("mode") in {"live", "manual-live"} and not missing_fields else "Review",
                "Notes": "Market Share not yet connected to live data." if section_key == "market-share" and section.get("mode") != "live" else "; ".join(section.get("warnings", [])[:2]) if section.get("warnings") else "",
            }
        )
    return {
        "title": "Data Coverage Audit",
        "title_zh": "数据覆盖 Data Coverage",
        "mode": "live",
        "status": "available",
        "source": "derived",
        "freshness_status": "Fresh",
        "expected_update_frequency": "derived",
        "data_date": datetime.now(timezone.utc).date().isoformat(),
        "summary": "Coverage audit for current live, mock, and unavailable sections.",
        "summary_zh": "审计当前各模块的数据接入状态，包括 live、mock 和 unavailable。",
        "interpretation": "This audit shows which sections are truly live, which are still mock, and which remain unavailable or manual-missing.",
        "interpretation_zh": "该审计用于区分哪些模块已经真正接入 live data，哪些仍是 mock，以及哪些仍不可用或缺少手动文件。",
        "why_it_matters": "A clean coverage view helps avoid treating missing or fallback values as real market information.",
        "why_it_matters_zh": "清晰的数据覆盖视图可以避免把缺失值或回退占位值误当成真实市场信息。",
        "key_metrics": [
            {"label": "Live Sections", "label_zh": "实时模块 Live Sections", "value": str(sum(1 for row in rows if row["Mode"] in {"live", "manual-live"})), "unit": ""},
            {"label": "Mock Sections", "label_zh": "模拟模块 Mock Sections", "value": str(sum(1 for row in rows if row["Mode"] == "mock")), "unit": ""},
            {"label": "Unavailable Sections", "label_zh": "不可用模块 Unavailable Sections", "value": str(sum(1 for row in rows if row["Mode"] in {"unavailable", "manual-missing"})), "unit": ""},
        ],
        "tables": [
            {
                "title": "Data Coverage Table",
                "title_zh": "数据覆盖表 Data Coverage Table",
                "columns": ["Section", "Mode", "Data Source", "Data Date", "Freshness", "Missing Fields", "Status", "Notes"],
                "rows": rows,
            }
        ],
        "signals": [
            "Market Share is still not connected to live data." if any("Market Share not yet connected" in note for note in notes) else "All planned Step 2 sections were checked.",
            "Unavailable values are retained when the source is missing or the endpoint fails.",
        ],
        "warnings": notes,
        "last_refreshed_at": datetime.now(timezone.utc).isoformat(),
    }


def generate_data_coverage_artifacts(sections_map: dict[str, Any]) -> None:
    coverage = build_data_coverage_section(sections_map)
    cache_dir = CACHE_DIR
    reports_dir = PROJECT_ROOT / "data" / "reports"
    cache_dir.mkdir(parents=True, exist_ok=True)
    reports_dir.mkdir(parents=True, exist_ok=True)
    json_path = cache_dir / "data_coverage_audit.json"
    md_path = reports_dir / "data_coverage_audit.md"
    try:
        json_path.write_text(json.dumps(coverage, indent=2), encoding="utf-8")
        rows = coverage["tables"][0]["rows"]
        lines = [
            "# Data Coverage Audit",
            "",
            "| Section | Mode | Data Source | Data Date | Freshness | Missing Fields | Status | Notes |",
            "|---|---|---|---|---|---|---|---|",
        ]
        for row in rows:
            lines.append(
                f"| {row['Section']} | {row['Mode']} | {row['Data Source']} | {row['Data Date']} | {row['Freshness']} | {row['Missing Fields']} | {row['Status']} | {row['Notes']} |"
            )
        md_path.write_text("\n".join(lines), encoding="utf-8")
    except OSError:
        pass


def build_overall_regime_section(sections_map: dict[str, Any]) -> dict[str, Any]:
    section = dict(SECTIONS["overall-regime"])
    reference_section = sections_map.get("reference-rates", {})
    live_sections = [key for key, value in sections_map.items() if value.get("mode") == "live"]
    section["mode"] = "mock"
    section["source"] = "derived"
    section["summary"] = (
        "Overall regime is still partial mock because only these sections are currently connected to live data: "
        f"{', '.join(live_sections) if live_sections else 'none'}."
    )
    section["summary_zh"] = (
        "总体状态仍为 partial mock，因为目前接入真实数据的模块只有："
        f"{'、'.join(live_sections) if live_sections else '无'}。"
    )
    section["key_metrics"] = [
        {"label": "Liquidity Bias", "label_zh": "流动性倾向", "value": "Partial mock", "unit": ""},
        {
            "label": "Funding Stress",
            "label_zh": "融资压力",
            "value": next(
                (
                    metric.get("value")
                    for metric in reference_section.get("key_metrics", [])
                    if metric.get("label") == "Funding Rate Stress"
                ),
                "Unavailable",
            ),
            "unit": "",
        },
        {"label": "Data Mode", "label_zh": "数据模式", "value": "Partial live", "unit": ""},
    ]
    section["signals"] = [
        "Reference Rates are live.",
        "Other sections are still mock or unavailable until reconnected.",
    ]
    section["last_refreshed_at"] = datetime.now(timezone.utc).isoformat()
    return section
