#!/usr/bin/env bash
# Disposable local PostgreSQL only. Never reads application credentials.
set -euo pipefail
script_root=$(cd "$(dirname "$0")/../.." && pwd)
case "${1:-publication}" in publication) ;; *) echo "unsupported check" >&2; exit 2 ;; esac
for executable in initdb pg_ctl psql; do command -v "$executable" >/dev/null; done
scratch_pg=$(mktemp -d "${TMPDIR:-/tmp}/compounder-tracking-pg.XXXXXX")
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
create table public.valuation_snapshot(ticker text primary key,reliable boolean,in_strike_zone boolean,payload jsonb,updated_at timestamptz);
grant select on public.valuation_snapshot to service_role;
create schema auth;
create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
SQL
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 \
  -f "$script_root/supabase/migrations/20261031_valuation_publication.sql" \
  -f "$script_root/supabase/migrations/20261031_tracking_publication_confirmation.sql" \
  -f "$script_root/supabase/checks/valuation_publication.sql" \
  -f "$script_root/supabase/checks/tracking_publication.sql"
# Two sessions race the same initial generation. Exactly one may commit.
race_sql="select public.write_valuation_publication('{\"key\":\"figi:BBG000000099\",\"ticker\":\"RACE\",\"figi\":\"BBG000000099\",\"cik\":null,\"cusip\":null,\"securityType\":\"Common Stock\",\"source\":\"fixture\",\"checkedAt\":\"2026-10-31\"}',0,null,null)"
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -c "$race_sql" > "$scratch_pg/race-a.log" 2>&1 &
race_a=$!
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -c "$race_sql" > "$scratch_pg/race-b.log" 2>&1 &
race_b=$!
result_a=0; wait "$race_a" || result_a=$?
result_b=0; wait "$race_b" || result_b=$?
if ! { [[ "$result_a" -eq 0 && "$result_b" -ne 0 ]] || [[ "$result_b" -eq 0 && "$result_a" -ne 0 ]]; }; then
  cat "$scratch_pg/race-a.log" "$scratch_pg/race-b.log" >&2
  exit 1
fi
psql -X -h "$scratch_pg" -d postgres -v ON_ERROR_STOP=1 -c "do \$\$ begin if (select generation from public.valuation_publication where identity_key='figi:BBG000000099')<>1 then raise exception 'race overwrote generation'; end if; end \$\$;" >/dev/null
echo 'tracking publication PostgreSQL checks OK (including concurrent CAS)'
