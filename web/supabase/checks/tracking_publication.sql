-- Disposable database fixtures; no assertion of live renderer acceptance.
begin;
create temporary table proof_fixture(manifest jsonb, proof jsonb);
grant select,update on proof_fixture to service_role;
insert into proof_fixture(manifest)
select jsonb_build_object('schemaVersion',1,'intentId',repeat('a',64),'origin','https://fixture.invalid',
 'generations',jsonb_build_array(jsonb_build_object('identityKey','figi:BBG009S3NB30','revisionId',repeat('2',64),'generation',1)),
 'targets',jsonb_build_array(jsonb_build_object('url','https://fixture.invalid/stocks/GOOG','path','/stocks/GOOG','language','en',
  'expectedSourceDigest',repeat('d',64),'expectations',jsonb_build_array(jsonb_build_object('identityKey','figi:BBG009S3NB30','revisionId',repeat('2',64),'generation',1,'presence','present')))));
update proof_fixture set proof=manifest || jsonb_build_object('verifiedAt',now(),'observations',jsonb_build_array(jsonb_build_object(
 'url','https://fixture.invalid/stocks/GOOG','sourceDigest',repeat('d',64),
 'members',jsonb_build_array(jsonb_build_object('identityKey','figi:BBG009S3NB30','revisionId',repeat('2',64))))));
set local role service_role;
select public.prepare_tracking_publication_v1(manifest) from proof_fixture;
-- Another old intent contains a page omitted from the later proof: it must survive supersession.
select public.prepare_tracking_publication_v1(jsonb_set(jsonb_set(manifest,'{intentId}',to_jsonb(repeat('c',64))),
 '{targets,0,url}','"https://fixture.invalid/stocks?page=2"')) from proof_fixture;
select public.write_valuation_publication(
 '{"key":"figi:BBG009S3NB30","ticker":"GOOG","figi":"BBG009S3NB30","cik":null,"cusip":null,"securityType":"Common Stock","source":"fixture","checkedAt":"2026-10-31"}',0,
 jsonb_build_object('record',jsonb_build_object('schemaVersion',1,'identity','{"key":"figi:BBG009S3NB30","ticker":"GOOG","figi":"BBG009S3NB30","cik":null,"cusip":null,"securityType":"Common Stock","source":"fixture","checkedAt":"2026-10-31"}'::jsonb,'revisionId',repeat('2',64),'status','valid','publishedAt',null),
 'presentation','{"fixture":"same-run"}'::jsonb),'{"status":"valid","reasons":[],"observedAt":"2026-10-31T00:00:00Z"}');
do $$ declare p jsonb; result jsonb; begin
 select proof into p from proof_fixture;
 begin
  perform public.confirm_tracking_publication_v1(jsonb_set(p,'{observations,0,sourceDigest}',to_jsonb(repeat('0',64))));
  raise exception 'stale digest promoted';
 exception when invalid_parameter_value then null; end;
 if (select tracking_result from public.valuation_publication) is not null then raise exception 'failed proof mutated latest'; end if;
 result=public.confirm_tracking_publication_v1(p);
 if result <> '{"confirmed":1,"pending":0}' then raise exception 'confirmation result %',result; end if;
 if (select tracking_presentation from public.valuation_publication)<>'{"fixture":"same-run"}'::jsonb then raise exception 'presentation not paired'; end if;
 if (select tracking_result->>'publishedAt' from public.valuation_publication) is null then raise exception 'publication date missing'; end if;
 if (select count(*) from public.tracking_publication_baseline_outbox where completed_at is null)<>1 then raise exception 'missing hook lost durable intent'; end if;
 result=public.confirm_tracking_publication_v1(p);
 if result <> '{"confirmed":1,"pending":0}' then raise exception 'retry not idempotent'; end if;
 if (select count(*) from public.tracking_publication_baseline_outbox)<>1 then raise exception 'duplicate baseline intent'; end if;
 -- A concurrent writer with unchanged revision and valid safety still invalidates the old CAS.
 perform public.write_valuation_publication((select identity from public.tracking_securities),1,null,null);
 result=public.confirm_tracking_publication_v1(p);
 if result <> '{"confirmed":0,"pending":1}' then raise exception 'concurrent writer accepted obsolete CAS'; end if;
 if (select tracking_generation from public.valuation_publication)<>1 then raise exception 'writer race overwrote latest'; end if;
 -- A newer safety-only generation invalidates proof even if revisionId is unchanged.
 perform public.invalidate_valuation_publications(array['GOOG'],'2026-10-31T01:00:00Z','fixture');
 result=public.confirm_tracking_publication_v1(p);
 if result <> '{"confirmed":0,"pending":1}' then raise exception 'stale CAS proof promoted'; end if;
 if (select tracking_generation from public.valuation_publication)<>1 then raise exception 'concurrent generation overwritten'; end if;
 if (select safety->>'status' from public.valuation_publication)<>'invalid' then raise exception 'proof restored revoked safety'; end if;
 begin
  update public.tracking_publication_intents set completed_at=now();
  raise exception 'service bypassed controlled confirmation';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
-- Versioned optional hook runs within confirmation transaction; failure keeps intent durable.
create function public.attach_first_tracking_baselines(text,text) returns void language plpgsql as $$
begin raise exception 'fixture hook failure'; end $$;
update public.valuation_publication set generation=2,
 public_result=jsonb_set(public_result,'{record,revisionId}',to_jsonb(repeat('3',64))),safety='{"status":"valid","reasons":[],"observedAt":"2026-10-31T00:00:00Z"}';
update proof_fixture set manifest=jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(manifest,
 '{intentId}',to_jsonb(repeat('b',64))),'{generations,0,generation}','2'),'{generations,0,revisionId}',to_jsonb(repeat('3',64))),
 '{targets,0,expectations,0,generation}','2'),'{targets,0,expectations,0,revisionId}',to_jsonb(repeat('3',64)));
update proof_fixture set proof=manifest || jsonb_build_object('verifiedAt',now(),'observations',jsonb_build_array(jsonb_build_object(
 'url','https://fixture.invalid/stocks/GOOG','sourceDigest',repeat('d',64),
 'members',jsonb_build_array(jsonb_build_object('identityKey','figi:BBG009S3NB30','revisionId',repeat('3',64))))));
set local role service_role;
select public.prepare_tracking_publication_v1(manifest) from proof_fixture;
do $$ begin
 begin
  perform public.confirm_tracking_publication_v1((select proof from proof_fixture));
  raise exception 'hook should fail';
 exception when raise_exception then if sqlerrm <> 'fixture hook failure' then raise; end if; end;
 if (select count(*) from public.tracking_publication_baseline_outbox where completed_at is null)<>1 then raise exception 'hook failure dropped intent'; end if;
 if (select tracking_generation from public.valuation_publication)<>1 then raise exception 'hook failure partly promoted candidate'; end if;
 if exists(select 1 from public.tracking_publication_intents where intent_id=repeat('b',64) and completed_at is not null) then raise exception 'failed hook completed intent'; end if;
end $$;
reset role;
create temporary table attached_fixture(id bigint generated always as identity, revision_id text, record jsonb);
grant select on attached_fixture to service_role;
create or replace function public.attach_first_tracking_baselines(text,text) returns void language plpgsql as $$
declare v_record jsonb; begin
 select record into strict v_record from public.tracking_publication_baseline_outbox
  where identity_key=$1 and revision_id=$2 and completed_at is null
  order by published_at,generation limit 1;
 insert into attached_fixture(revision_id,record) values($2,v_record);
end $$;
set local role service_role;
select public.confirm_tracking_publication_v1(proof) from proof_fixture;
do $$ begin
 if exists(select 1 from public.tracking_publication_baseline_outbox where generation=2 and completed_at is null) then raise exception 'hook never completed'; end if;
 if not exists(select 1 from public.tracking_publication_baseline_outbox where generation=1 and record->>'revisionId'=repeat('2',64)) then raise exception 'older immutable record was lost'; end if;
 if (select tracking_generation from public.valuation_publication)<>2 then raise exception 'retry failed to promote candidate'; end if;
 if (select revision_id from attached_fixture order by id limit 1)<>repeat('2',64) then raise exception 'R2 attached before queued R1'; end if;
 if (select count(*) from attached_fixture)<>2 then raise exception 'ordered pending hook drain incomplete'; end if;
 if exists(select 1 from public.tracking_publication_intents where intent_id=repeat('a',64) and completed_at is null) then raise exception 'obsolete covered intent retries forever'; end if;
 if not exists(select 1 from public.tracking_publication_intents where intent_id=repeat('c',64) and completed_at is null) then raise exception 'unverified old page obligation discarded'; end if;
end $$;
reset role;
do $$ begin
 if has_function_privilege('authenticated','public.confirm_tracking_publication_v1(jsonb)','execute') then raise exception 'browser confirmation'; end if;
 if has_function_privilege('anon','public.prepare_tracking_publication_v1(jsonb)','execute') then raise exception 'anon intent'; end if;
end $$;
rollback;

-- Fair durable retry turns: failed/ineligible work stays queued without starving older work.
begin;
set local role service_role;
select public.prepare_tracking_publication_v1(jsonb_build_object('schemaVersion',1,'intentId',lpad(to_hex(n),64,'0'),
 'origin',case when n<=10 then 'https://ineligible.invalid' else 'https://fixture.invalid' end,
 'generations',jsonb_build_array(jsonb_build_object('identityKey','fixture','generation',n)),
 'targets',jsonb_build_array(jsonb_build_object('fixture',n)))) from generate_series(1,25) n;
reset role;
-- The confirmable tail is older by publication date; scheduling must not keep choosing newest 20.
update public.tracking_publication_intents set prepared_at=now()-interval '1 day' where intent_id>lpad(to_hex(20),64,'0');
create temporary table retry_turns(turn int, manifest jsonb);
grant insert,select on retry_turns to service_role;
set local role service_role;
insert into retry_turns select 1,manifest from public.next_tracking_publication_batch_v1();
insert into retry_turns select 2,manifest from public.next_tracking_publication_batch_v1();
do $$ begin
 if (select count(*) from retry_turns where turn=1)<>20 or (select count(*) from retry_turns where turn=2)<>20 then raise exception 'retry budget changed'; end if;
 if (select count(distinct manifest->>'intentId') from retry_turns)<>25 then raise exception 'older queued intents starved'; end if;
 if (select count(*) from public.tracking_publication_intents where completed_at is null)<>25 then raise exception 'scheduler dropped blocked obligations'; end if;
 begin
  update public.tracking_publication_intents set retry_order=0;
  raise exception 'service bypassed retry scheduler';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
do $$ begin
 if has_function_privilege('anon','public.next_tracking_publication_batch_v1()','execute') or has_function_privilege('authenticated','public.next_tracking_publication_batch_v1()','execute') then raise exception 'browser scheduled private queue'; end if;
end $$;
rollback;
