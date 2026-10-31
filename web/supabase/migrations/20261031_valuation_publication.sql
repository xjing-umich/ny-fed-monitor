-- Apply explicitly before account tables. No backfill from legacy valuation_snapshot.
begin;
create table public.tracking_securities (
  identity_key text primary key,
  ticker text not null,
  identity jsonb not null,
  is_current boolean not null default true,
  updated_at timestamptz not null default now(),
  check (identity->>'key' = identity_key and identity->>'ticker' = ticker)
);
create unique index tracking_securities_current_ticker on public.tracking_securities(ticker) where is_current;
create table public.valuation_publication (
  identity_key text primary key references public.tracking_securities(identity_key),
  generation bigint not null default 0 check (generation >= 0),
  public_result jsonb,
  tracking_result jsonb,
  tracking_presentation jsonb,
  tracking_generation bigint,
  publication_status text not null default 'pending' check (publication_status in ('pending','confirmed')),
  safety jsonb not null,
  prepared_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (tracking_generation is null or tracking_generation <= generation),
  check (public_result is null or (public_result->'record'->>'schemaVersion' = '1' and public_result->'record'->'identity'->>'key' = identity_key)),
  check (tracking_result is null or (tracking_result->>'schemaVersion' = '1' and tracking_result->'identity'->>'key' = identity_key)),
  check (safety->>'status' in ('valid','pending','invalid') and jsonb_typeof(safety->'reasons') = 'array' and safety->>'observedAt' is not null)
);
alter table public.tracking_securities enable row level security;
alter table public.valuation_publication enable row level security;
revoke all on public.tracking_securities, public.valuation_publication from public, anon, authenticated, service_role;
grant select on public.tracking_securities, public.valuation_publication to service_role;
create policy tracking_service_read on public.tracking_securities for select to service_role using (true);
create policy publication_service_read on public.valuation_publication for select to service_role using (true);

-- Directory, candidate and safety change atomically. The old confirmed record is immutable.
-- Null candidate/safety preserves the existing value (directory-only verification).
create function public.write_valuation_publication(p_identity jsonb, p_expected_generation bigint, p_public_result jsonb, p_safety jsonb)
returns bigint language plpgsql security definer set search_path = pg_catalog, public as $$
declare
  v_key text := p_identity->>'key';
  v_ticker text := p_identity->>'ticker';
  v_prior public.tracking_securities;
  v_generation bigint;
  v_safety jsonb;
begin
  if v_key is null or v_ticker is null or p_identity->>'source' is null or p_identity->>'checkedAt' is null
     or p_identity->>'securityType' is null or p_expected_generation is null or p_expected_generation < 0 then
    raise exception 'Verified identity and generation required' using errcode='22023';
  end if;
  -- Serialize creation as well as updates; hash collisions only cause harmless extra serialization.
  perform pg_advisory_xact_lock(hashtextextended(v_ticker, 0));
  select * into v_prior from public.tracking_securities where identity_key=v_key for update;
  if found and (v_prior.ticker <> v_ticker or v_prior.identity->>'figi' is distinct from p_identity->>'figi'
    or v_prior.identity->>'cik' is distinct from p_identity->>'cik' or v_prior.identity->>'cusip' is distinct from p_identity->>'cusip'
    or v_prior.identity->>'securityType' is distinct from p_identity->>'securityType' or not v_prior.is_current) then
    raise exception 'Identity change requires explicit reconciliation' using errcode='22023';
  end if;
  if exists (select 1 from public.tracking_securities where ticker=v_ticker and is_current and identity_key<>v_key) then
    raise exception 'Ticker identity conflict' using errcode='22023';
  end if;
  select generation into v_generation from public.valuation_publication where identity_key=v_key for update;
  if coalesce(v_generation,0) <> p_expected_generation then
    raise exception 'Publication generation changed; retry from current state' using errcode='40001';
  end if;
  if p_public_result is not null and (
    p_public_result->'record'->>'schemaVersion' is distinct from '1' or
    p_public_result->'record'->'identity' is distinct from p_identity or
    p_public_result->'presentation' is null or
    p_public_result->'record'->>'publishedAt' is not null) then
    raise exception 'Candidate must contain same-run unpublished contract and presentation' using errcode='22023';
  end if;
  v_safety := coalesce(p_safety, (select safety from public.valuation_publication where identity_key=v_key),
    jsonb_build_object('status','pending','reasons',jsonb_build_array('no_valuation'),'observedAt',now()));
  if v_safety->>'status' is null or v_safety->>'status' not in ('valid','pending','invalid') or
    jsonb_typeof(v_safety->'reasons') is distinct from 'array' or v_safety->>'observedAt' is null then
    raise exception 'Safety provenance required' using errcode='22023';
  end if;
  if p_safety is not null and (p_safety->>'observedAt')::timestamptz <
    (select (safety->>'observedAt')::timestamptz from public.valuation_publication where identity_key=v_key) then
    raise exception 'Safety observation advanced; recompute candidate' using errcode='40001';
  end if;
  insert into public.tracking_securities(identity_key,ticker,identity)
    values(v_key,v_ticker,p_identity)
    on conflict(identity_key) do update set identity=excluded.identity, updated_at=now();
  insert into public.valuation_publication(identity_key,generation,public_result,safety,prepared_at)
    values(v_key,1,p_public_result,v_safety,case when p_public_result is not null then now() end)
    on conflict(identity_key) do update set generation=valuation_publication.generation+1,
      public_result=coalesce(excluded.public_result,valuation_publication.public_result), safety=excluded.safety,
      publication_status=case when p_public_result is not null then 'pending' else valuation_publication.publication_status end,
      prepared_at=case when p_public_result is not null then now() else valuation_publication.prepared_at end,updated_at=now()
    returning generation into v_generation;
  return v_generation;
end $$;
revoke all on function public.write_valuation_publication(jsonb,bigint,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.write_valuation_publication(jsonb,bigint,jsonb,jsonb) to service_role;
-- Existing invalidation callers must revoke the new safety channel in the same transaction.
create function public.invalidate_valuation_publications(p_tickers text[],p_observed_at timestamptz,p_model_version text)
returns integer language plpgsql security definer set search_path=pg_catalog,public as $$
declare
  v_ticker text; v_key text; v_observed timestamptz; v_changed boolean; v_count integer := 0; v_rows integer;
begin
  if p_observed_at is null or p_model_version is null then raise exception 'Invalid invalidation provenance'; end if;
  for v_ticker in select distinct unnest(p_tickers) order by 1 loop
    perform pg_advisory_xact_lock(hashtextextended(v_ticker,0));
    select s.identity_key,(p.safety->>'observedAt')::timestamptz into v_key,v_observed
      from public.tracking_securities s join public.valuation_publication p using(identity_key)
      where s.ticker=v_ticker and s.is_current for update of p;
    -- A delayed failure cannot overwrite evidence observed by a newer run.
    if v_observed is not null and p_observed_at < v_observed then continue; end if;
    update public.valuation_snapshot set reliable=false,in_strike_zone=false,
      payload=jsonb_build_object('model_version',p_model_version,'assessment_status','invalidated',
        'revalidation_pending',true,'suppressed_reason','valuation_suppressed','invalidated_at',p_observed_at),updated_at=p_observed_at
      where ticker=v_ticker and payload->>'model_version'=p_model_version and payload->>'assessment_status'='valid';
    get diagnostics v_rows=row_count;
    v_changed := v_rows>0;
    update public.valuation_publication set generation=generation+1,publication_status='pending',updated_at=now(),
      safety=jsonb_build_object('status','invalid','reasons',jsonb_build_array('valuation_suppressed'),'observedAt',p_observed_at)
      where identity_key=v_key and safety->>'status'<>'invalid';
    get diagnostics v_rows=row_count;
    if v_changed or v_rows>0 then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.invalidate_valuation_publications(text[],timestamptz,text) from public,anon,authenticated;
grant execute on function public.invalidate_valuation_publications(text[],timestamptz,text) to service_role;
commit;
