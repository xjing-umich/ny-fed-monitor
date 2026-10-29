#!/usr/bin/env bash
# 仅创建本机临时 PostgreSQL,不使用项目凭据或连接生产库。需要 initdb/pg_ctl/psql 在 PATH 中。
set -euo pipefail
script_root=$(cd "$(dirname "$0")/../.." && pwd)
for executable in initdb pg_ctl psql; do command -v "$executable" >/dev/null; done
scratch_pg=$(mktemp -d "${TMPDIR:-/tmp}/compounder-derived-pg.XXXXXX")
cleanup() {
  pg_ctl -D "$scratch_pg/data" -m fast stop >/dev/null 2>&1 || true
  rm -rf "$scratch_pg"
}
trap cleanup EXIT
initdb -D "$scratch_pg/data" -A trust --no-locale > "$scratch_pg/init.log"
pg_ctl -D "$scratch_pg/data" -l "$scratch_pg/server.log" -o "-k '$scratch_pg' -h ''" start >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 <<'SQL'
create role anon;
create role authenticated;
create role service_role;
create table managers(cik text primary key);
create table filings(id bigint primary key,cik text,period date,filed_at date,holding_count int);
create table holdings(filing_id bigint,put_call text);
SQL
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 \
  -f "$script_root/supabase/migrations/20261028_split_adjustments_and_quarter_summary.sql" \
  -f "$script_root/supabase/migrations/20261029_atomic_derived_publication.sql" \
  -f "$script_root/supabase/migrations/20261030_derived_safe_delete.sql" \
  -f "$script_root/supabase/checks/derived_publication.sql"
echo 'derived-publication PostgreSQL checks OK'
