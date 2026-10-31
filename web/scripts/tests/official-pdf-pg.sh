#!/usr/bin/env bash
# Disposable local upgrade; never uses production credentials or a linked project.
set -euo pipefail
script_root=$(cd "$(dirname "$0")/../.." && pwd)
scratch_pg=$(mktemp -d "${TMPDIR:-/tmp}/compounder-pdf-pg.XXXXXX")
cleanup(){ pg_ctl -D "$scratch_pg/data" -m fast stop >/dev/null 2>&1 || true;rm -rf "$scratch_pg"; }
trap cleanup EXIT
initdb -D "$scratch_pg/data" -A trust --no-locale > "$scratch_pg/init.log"
pg_ctl -D "$scratch_pg/data" -l "$scratch_pg/server.log" -o "-k '$scratch_pg' -h ''" start >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 \
 -f "$script_root/supabase/migrations/20260608_create_sec_company_fundamentals.sql" \
 -f "$script_root/supabase/migrations/20261031_native_40f_financials.sql" \
 -f "$script_root/supabase/migrations/20261031_official_financial_periods.sql" >/dev/null
node "$script_root/scripts/tests/official-pdf-seed.mjs" "$script_root" "$scratch_pg"
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -f "$scratch_pg/legacy.sql" >/dev/null
psql -X -h "$scratch_pg" -d postgres -At -c "select conname||': '||pg_get_constraintdef(oid) from pg_constraint where conrelid='public.official_financial_periods'::regclass" > "$scratch_pg/constraints-before.txt"
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -c 'create role service_role; create role pdf_fixture_anon; create role anon; create role authenticated; alter default privileges in schema public grant execute on functions to anon, authenticated;' >/dev/null
if [ -f "$script_root/supabase/migrations/20261031_official_pdf_financials.sql" ];then
 psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -f "$script_root/supabase/migrations/20261031_official_pdf_financials.sql" >/dev/null
fi
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -f "$script_root/supabase/migrations/20261031_official_pdf_function_privileges.sql" >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 \
 -c "do \$\$ begin if not exists(select from information_schema.columns where table_schema='public' and table_name='official_financial_periods' and column_name='source_pdf_page_count') then raise exception 'PDF capability migration missing';end if;end \$\$;" >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -c 'alter role service_role bypassrls;grant select,insert,update on official_financial_periods to service_role;' >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -c 'set role service_role' -f "$scratch_pg/pdf.sql" >/dev/null
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -f "$script_root/supabase/checks/official_pdf_financials.sql"
echo 'official PDF PostgreSQL roll-forward and isolation checks OK'
