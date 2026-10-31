-- Apply explicitly AFTER 20261031_valuation_publication.sql. Feature remains off.
begin;
-- Prepared BEFORE replacing public candidates, so retries retain earlier route memberships.
create table public.tracking_publication_intents (
 intent_id text primary key check(intent_id ~ '^[a-f0-9]{64}$'),
 manifest jsonb not null,
 prepared_at timestamptz not null default now(),
 completed_at timestamptz,
 superseded_by text references public.tracking_publication_intents(intent_id),
 last_proof jsonb
);
create index tracking_publication_pending on public.tracking_publication_intents(prepared_at desc) where completed_at is null;
-- Optional Task8 hook absent today: publication must not lose pending baseline work.
create table public.tracking_publication_baseline_outbox (
 identity_key text not null references public.tracking_securities(identity_key),
 schema_version integer not null default 1 check(schema_version=1),
 generation bigint not null,
 record jsonb not null,
 revision_id text generated always as (record->>'revisionId') stored not null,
 published_at timestamptz not null,
 created_at timestamptz not null default now(),
 completed_at timestamptz,
 primary key(identity_key,generation)
);
create index tracking_baseline_revision_queue on public.tracking_publication_baseline_outbox(identity_key,revision_id,published_at,generation) where completed_at is null;
alter table public.tracking_publication_intents enable row level security;
alter table public.tracking_publication_baseline_outbox enable row level security;
revoke all on public.tracking_publication_intents, public.tracking_publication_baseline_outbox from public,anon,authenticated,service_role;
grant select on public.tracking_publication_intents, public.tracking_publication_baseline_outbox to service_role;
create policy intent_service_read on public.tracking_publication_intents for select to service_role using(true);
create policy baseline_outbox_service_read on public.tracking_publication_baseline_outbox for select to service_role using(true);

create function public.prepare_tracking_publication_v1(p_manifest jsonb) returns text
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_id text:=p_manifest->>'intentId'; v_existing jsonb;
begin
 if p_manifest->>'schemaVersion' is distinct from '1' or v_id is null or v_id !~ '^[a-f0-9]{64}$'
  or p_manifest->>'origin' is null or jsonb_typeof(p_manifest->'targets') is distinct from 'array'
  or jsonb_typeof(p_manifest->'generations') is distinct from 'array'
  or jsonb_array_length(p_manifest->'targets')=0 or jsonb_array_length(p_manifest->'generations') not between 1 and 500 then
  raise exception 'Invalid publication manifest' using errcode='22023';
 end if;
 insert into public.tracking_publication_intents(intent_id,manifest) values(v_id,p_manifest) on conflict do nothing;
 select manifest into v_existing from public.tracking_publication_intents where intent_id=v_id;
 if v_existing<>p_manifest then raise exception 'Immutable publication intent conflict' using errcode='22023'; end if;
 return v_id;
end $$;
revoke all on function public.prepare_tracking_publication_v1(jsonb) from public,anon,authenticated;
grant execute on function public.prepare_tracking_publication_v1(jsonb) to service_role;

-- Trust boundary: only the service workflow can attest ordinary public GET observations.
-- No browser writes, no DB-echo acceptance endpoint. All targets must pass before any promotion.
create function public.confirm_tracking_publication_v1(p_proof jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare
 v_manifest jsonb; v_target jsonb; v_observation jsonb; v_expected jsonb; v_generation jsonb;
 v_row public.valuation_publication; v_outbox public.tracking_publication_baseline_outbox; v_record jsonb; v_verified timestamptz;
 v_confirmed int:=0; v_pending int:=0; v_matches int;
begin
 -- Confirmation/supersession touches several intents; serialize confirmations to avoid lock inversion.
 -- Candidate writers still run concurrently and are guarded by each publication generation CAS.
 perform pg_advisory_xact_lock(hashtextextended('tracking-publication-confirmation-v1',0));
 select manifest into v_manifest from public.tracking_publication_intents where intent_id=p_proof->>'intentId' for update;
 if v_manifest is null or p_proof->>'schemaVersion' is distinct from '1'
  or p_proof->>'origin' is distinct from v_manifest->>'origin'
  or p_proof->'targets' is distinct from v_manifest->'targets'
  or p_proof->'generations' is distinct from v_manifest->'generations'
  or jsonb_typeof(p_proof->'observations') is distinct from 'array'
  or jsonb_array_length(p_proof->'observations')<>jsonb_array_length(v_manifest->'targets') then
  raise exception 'Proof must match complete durable intent' using errcode='22023';
 end if;
 v_verified:=(p_proof->>'verifiedAt')::timestamptz;
 if v_verified is null or v_verified<now()-interval '15 minutes' or v_verified>now()+interval '1 minute' then
  raise exception 'Fresh rendered proof required' using errcode='22023';
 end if;
 for v_target in select value from jsonb_array_elements(v_manifest->'targets') loop
  select count(*) into v_matches from jsonb_array_elements(p_proof->'observations') where value->>'url'=v_target->>'url';
  select value into v_observation from jsonb_array_elements(p_proof->'observations') where value->>'url'=v_target->>'url';
  if v_matches<>1 or v_observation->>'sourceDigest' is distinct from v_target->>'expectedSourceDigest'
   or jsonb_typeof(v_observation->'members') is distinct from 'array' then
   raise exception 'Rendered source digest mismatch' using errcode='22023';
  end if;
  if jsonb_typeof(v_target->'expectations') is distinct from 'array' or jsonb_array_length(v_target->'expectations')=0 then
   raise exception 'Missing row expectations' using errcode='22023';
  end if;
  for v_expected in select value from jsonb_array_elements(v_target->'expectations') loop
   select count(*) into v_matches from jsonb_array_elements(v_observation->'members') where value->>'identityKey'=v_expected->>'identityKey';
   if v_expected->>'presence' not in ('present','absent') or v_expected->>'presence' is null
    or (v_expected->>'presence'='absent' and v_matches<>0)
    or (v_expected->>'presence'='present' and (v_matches=0 or exists(select 1 from jsonb_array_elements(v_observation->'members')
       where value->>'identityKey'=v_expected->>'identityKey' and value->>'revisionId' is distinct from v_expected->>'revisionId'))) then
    raise exception 'Rendered revision or absence mismatch' using errcode='22023';
   end if;
  end loop;
 end loop;
 -- Lock in identity order; CAS includes generation (a safety revocation changes it even at same revision).
 for v_generation in select value from jsonb_array_elements(v_manifest->'generations') order by value->>'identityKey' loop
  if not exists(select 1 from jsonb_array_elements(v_manifest->'targets') t,
    lateral jsonb_array_elements(t.value->'expectations') e
    where e.value->>'identityKey'=v_generation->>'identityKey' and e.value->>'revisionId'=v_generation->>'revisionId'
      and e.value->>'generation'=v_generation->>'generation') then
   raise exception 'Generation has no rendered proof' using errcode='22023';
  end if;
  select p.* into v_row from public.valuation_publication p join public.tracking_securities s using(identity_key)
   where p.identity_key=v_generation->>'identityKey' and s.is_current for update of p;
  if not found or v_row.generation<>(v_generation->>'generation')::bigint
   or v_row.public_result->'record'->>'revisionId' is distinct from v_generation->>'revisionId'
   or v_row.public_result->'record'->>'status' is distinct from 'valid'
   or v_row.safety->>'status' is distinct from 'valid' then
   v_pending:=v_pending+1; continue;
  end if;
  if v_row.tracking_generation is distinct from v_row.generation then
   v_record=jsonb_set(v_row.public_result->'record','{publishedAt}',to_jsonb(v_verified));
   update public.valuation_publication set tracking_result=v_record,
    tracking_presentation=v_row.public_result->'presentation',tracking_generation=generation,
    publication_status='confirmed',confirmed_at=v_verified,updated_at=now() where identity_key=v_row.identity_key;
   insert into public.tracking_publication_baseline_outbox(identity_key,generation,record,published_at)
    values(v_row.identity_key,v_row.generation,v_record,v_verified) on conflict do nothing;
  end if;
  if to_regprocedure('public.attach_first_tracking_baselines(text,text)') is not null then
   -- R1 must reach first-baseline consumers before R2 even if the hook was absent for R1.
   -- Callback resolves this immutable compact record by identity+revision, oldest incomplete
   -- published_at/generation first. A successful return acknowledges this exact queue row.
   for v_outbox in select * from public.tracking_publication_baseline_outbox
    where identity_key=v_row.identity_key and completed_at is null
    order by published_at,generation for update loop
    execute 'select public.attach_first_tracking_baselines($1,$2)' using v_outbox.identity_key,v_outbox.revision_id;
    update public.tracking_publication_baseline_outbox set completed_at=now()
     where identity_key=v_outbox.identity_key and generation=v_outbox.generation;
   end loop;
  end if;
  v_confirmed:=v_confirmed+1;
 end loop;
 update public.tracking_publication_intents set last_proof=p_proof,
  completed_at=case when v_pending=0 then now() when superseded_by is not null then completed_at else null end where intent_id=p_proof->>'intentId';
 if v_pending=0 then
  -- Retire older intents only when this actually verified proof covers EVERY old route/key.
  -- Missing an old page (pagination/filter exit) keeps the old obligation durable.
  update public.tracking_publication_intents old set completed_at=now(),superseded_by=p_proof->>'intentId'
   where old.completed_at is null and old.intent_id<>p_proof->>'intentId'
   and old.manifest->>'origin'=v_manifest->>'origin'
   and not exists(select 1 from jsonb_array_elements(old.manifest->'generations') og
     where not exists(select 1 from jsonb_array_elements(v_manifest->'generations') ng
      where ng.value->>'identityKey'=og.value->>'identityKey' and (ng.value->>'generation')::bigint>=(og.value->>'generation')::bigint))
   and not exists(select 1 from jsonb_array_elements(old.manifest->'targets') ot,
     lateral jsonb_array_elements(ot.value->'expectations') oe
     where not exists(select 1 from jsonb_array_elements(v_manifest->'targets') nt,
      lateral jsonb_array_elements(nt.value->'expectations') ne
      where nt.value->>'url'=ot.value->>'url' and ne.value->>'identityKey'=oe.value->>'identityKey'));
 end if;
 return jsonb_build_object('confirmed',v_confirmed,'pending',v_pending);
end $$;
revoke all on function public.confirm_tracking_publication_v1(jsonb) from public,anon,authenticated;
grant execute on function public.confirm_tracking_publication_v1(jsonb) to service_role;
commit;
