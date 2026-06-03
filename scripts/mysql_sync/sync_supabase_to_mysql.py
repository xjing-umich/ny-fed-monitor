#!/usr/bin/env python3
"""Sync Supabase market monitor tables into a MySQL database.

This script is intentionally standalone. It does not import or modify the Next.js app.
Run it on a machine that can reach the internal MySQL host.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
from urllib.parse import quote_plus

import requests
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine

PAGE_SIZE = 1000
TABLE_ORDER = [
    "market_data_sources",
    "market_time_series_observations",
    "market_ingestion_runs",
    "market_freshness_status",
    "market_ai_analysis_runs",
]


@dataclass(frozen=True)
class TableSpec:
    name: str
    columns: list[str]
    json_columns: set[str]
    datetime_columns: set[str]


TABLE_SPECS: dict[str, TableSpec] = {
    "market_data_sources": TableSpec(
        name="market_data_sources",
        columns=[
            "id",
            "name",
            "provider",
            "official_url",
            "api_endpoint",
            "update_frequency",
            "expected_lag_days",
            "is_manual",
            "limitation_note",
            "created_at",
            "updated_at",
        ],
        json_columns=set(),
        datetime_columns={"created_at", "updated_at"},
    ),
    "market_time_series_observations": TableSpec(
        name="market_time_series_observations",
        columns=[
            "id",
            "source_id",
            "series_code",
            "observation_date",
            "value",
            "unit",
            "metadata",
            "created_at",
        ],
        json_columns={"metadata"},
        datetime_columns={"created_at"},
    ),
    "market_ingestion_runs": TableSpec(
        name="market_ingestion_runs",
        columns=[
            "id",
            "source_id",
            "started_at",
            "finished_at",
            "status",
            "rows_fetched",
            "latest_observation_date",
            "error_message",
            "raw_response_hash",
            "created_at",
        ],
        json_columns=set(),
        datetime_columns={"started_at", "finished_at", "created_at"},
    ),
    "market_freshness_status": TableSpec(
        name="market_freshness_status",
        columns=[
            "id",
            "source_id",
            "latest_observation_date",
            "last_successful_fetch",
            "freshness_status",
            "days_since_latest",
            "expected_frequency",
            "checked_at",
            "warning",
        ],
        json_columns=set(),
        datetime_columns={"last_successful_fetch", "checked_at"},
    ),
    "market_ai_analysis_runs": TableSpec(
        name="market_ai_analysis_runs",
        columns=[
            "id",
            "analysis_type",
            "model_name",
            "input_snapshot",
            "freshness_snapshot",
            "output_text",
            "warnings",
            "created_at",
        ],
        json_columns={"input_snapshot", "freshness_snapshot", "warnings"},
        datetime_columns={"created_at"},
    ),
}


def env_value(primary: str, alias: str | None = None, default: str | None = None) -> str | None:
    return os.getenv(primary) or (os.getenv(alias) if alias else None) or default


def require_env(name: str, alias: str | None = None) -> str:
    value = env_value(name, alias)
    if not value:
        suffix = f" or {alias}" if alias else ""
        raise RuntimeError(f"Missing required environment variable: {name}{suffix}")
    return value


def mysql_url(include_database: bool = True) -> str:
    user = require_env("DB_USER", "MYSQL_DB_USER")
    password = require_env("DB_PASSWORD", "MYSQL_DB_PASSWORD")
    host = require_env("DB_HOST", "MYSQL_DB_HOST")
    port = env_value("DB_PORT", "MYSQL_DB_PORT", "3306")
    database = env_value("DB_NAME_bloomberg", "MYSQL_DB_NAME", "bloomberg")
    charset = env_value("DB_CHARSET", "MYSQL_DB_CHARSET", "utf8mb4")
    database_part = f"/{database}" if include_database else ""
    return (
        f"mysql+pymysql://{quote_plus(user)}:{quote_plus(password)}"
        f"@{host}:{port}{database_part}?charset={quote_plus(charset or 'utf8mb4')}"
    )


def create_mysql_engine(include_database: bool = True) -> Engine:
    return create_engine(mysql_url(include_database=include_database), pool_pre_ping=True, future=True)


def supabase_config() -> tuple[str, dict[str, str]]:
    url = require_env("SUPABASE_URL").rstrip("/")
    key = require_env("SUPABASE_SERVICE_KEY")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
    }
    return url, headers


def safe_datetime(value: Any) -> Any:
    if not value or not isinstance(value, str):
        return value
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return value[:19].replace("T", " ")
    return parsed.replace(tzinfo=None).strftime("%Y-%m-%d %H:%M:%S")


def normalize_row(row: dict[str, Any], spec: TableSpec) -> dict[str, Any]:
    normalized: dict[str, Any] = {}
    for column in spec.columns:
        value = row.get(column)
        if column in spec.json_columns and value is not None:
            value = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        elif column in spec.datetime_columns and value is not None:
            value = safe_datetime(value)
        elif isinstance(value, bool):
            value = int(value)
        normalized[column] = value
    return normalized


def fetch_supabase_page(
    table: str,
    offset: int,
    limit: int,
    supabase_url: str,
    headers: dict[str, str],
) -> list[dict[str, Any]]:
    endpoint = f"{supabase_url}/rest/v1/{table}"
    params = {
        "select": "*",
        "order": "id.asc",
        "limit": str(limit),
        "offset": str(offset),
    }
    response = requests.get(endpoint, headers=headers, params=params, timeout=60)
    if not response.ok:
        raise RuntimeError(f"Supabase {table} fetch failed: HTTP {response.status_code} {response.text[:300]}")
    payload = response.json()
    if not isinstance(payload, list):
        raise RuntimeError(f"Supabase {table} returned non-list payload")
    return payload


def iter_supabase_rows(table: str, supabase_url: str, headers: dict[str, str]) -> Iterable[list[dict[str, Any]]]:
    offset = 0
    while True:
        rows = fetch_supabase_page(table, offset, PAGE_SIZE, supabase_url, headers)
        if not rows:
            break
        yield rows
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE


def upsert_rows(engine: Engine, spec: TableSpec, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    columns_sql = ", ".join(f"`{column}`" for column in spec.columns)
    values_sql = ", ".join(f":{column}" for column in spec.columns)
    updates_sql = ", ".join(
        f"`{column}` = values(`{column}`)" for column in spec.columns if column != "id"
    )
    statement = text(
        f"insert into `{spec.name}` ({columns_sql}) values ({values_sql}) "
        f"on duplicate key update {updates_sql}"
    )
    with engine.begin() as conn:
        conn.execute(statement, [normalize_row(row, spec) for row in rows])
    return len(rows)


def create_schema(engine: Engine) -> None:
    schema_path = Path(__file__).with_name("create_mysql_schema.sql")
    sql = schema_path.read_text(encoding="utf-8")
    statements = [statement.strip() for statement in sql.split(";") if statement.strip()]
    with engine.begin() as conn:
        for statement in statements:
            conn.execute(text(statement))
    logging.info("schema created or verified from %s", schema_path)


def sync_table(table: str, engine: Engine, supabase_url: str, headers: dict[str, str], dry_run: bool) -> dict[str, int]:
    if table not in TABLE_SPECS:
        raise RuntimeError(f"Unsupported table: {table}")
    spec = TABLE_SPECS[table]
    fetched = 0
    written = 0
    for page in iter_supabase_rows(table, supabase_url, headers):
        fetched += len(page)
        if dry_run:
            logging.info("[dry-run] %s fetched page rows=%s", table, len(page))
        else:
            written += upsert_rows(engine, spec, page)
    logging.info("%s fetched=%s written=%s", table, fetched, written)
    return {"fetched": fetched, "written": written}


def sync_once(table: str | None, dry_run: bool, create_schema_first: bool) -> None:
    supabase_url, headers = supabase_config()
    if create_schema_first:
        create_schema(create_mysql_engine(include_database=False))
    engine = create_mysql_engine()
    tables = [table] if table else TABLE_ORDER
    for table_name in tables:
        try:
            sync_table(table_name, engine, supabase_url, headers, dry_run)
        except Exception as exc:  # noqa: BLE001 - table-level sync should continue to log clearly
            logging.error("%s error=%s", table_name, exc)
            if table:
                raise


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Supabase market tables into MySQL bloomberg database.")
    parser.add_argument("--dry-run", action="store_true", help="Fetch rows and log counts without writing to MySQL.")
    parser.add_argument("--table", choices=TABLE_ORDER, help="Sync only one table.")
    parser.add_argument("--loop", action="store_true", help="Run continuously every MONITOR_INTERVAL seconds.")
    parser.add_argument("--create-schema", action="store_true", help="Create/verify MySQL schema before syncing.")
    args = parser.parse_args()

    load_dotenv(Path(__file__).with_name(".env"))
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    interval = int(env_value("MONITOR_INTERVAL", default="60") or "60")

    while True:
        sync_once(table=args.table, dry_run=args.dry_run, create_schema_first=args.create_schema)
        if not args.loop:
            break
        logging.info("sleeping %s seconds before next sync", interval)
        time.sleep(interval)


if __name__ == "__main__":
    main()
