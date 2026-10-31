#!/usr/bin/env bash
# Local disposable PostgreSQL; no production credentials or connection.
set -euo pipefail
script_root=$(cd "$(dirname "$0")/../.." && pwd)
for executable in initdb pg_ctl psql;do command -v "$executable" >/dev/null;done
scratch_pg=$(mktemp -d "${TMPDIR:-/tmp}/compounder-official-pg.XXXXXX")
cleanup(){ pg_ctl -D "$scratch_pg/data" -m fast stop >/dev/null 2>&1 || true;rm -rf "$scratch_pg"; }
trap cleanup EXIT
initdb -D "$scratch_pg/data" -A trust --no-locale > "$scratch_pg/init.log"
pg_ctl -D "$scratch_pg/data" -l "$scratch_pg/server.log" -o "-k '$scratch_pg' -h ''" start >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 \
 -f "$script_root/supabase/migrations/20260608_create_sec_company_fundamentals.sql" \
 -f "$script_root/supabase/migrations/20261031_native_40f_financials.sql" \
 -f "$script_root/supabase/migrations/20261031_official_financial_periods.sql" \
 -f "$script_root/supabase/checks/official_financial_periods.sql"
echo 'official-financials PostgreSQL checks OK'
