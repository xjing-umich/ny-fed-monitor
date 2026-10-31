-- Local fixtures only; assert transaction/CAS and privilege boundaries.
begin;
set local role service_role;
select public.write_valuation_publication(
  '{"key":"figi:BBG009S3NB30","ticker":"GOOG","figi":"BBG009S3NB30","cik":"0001652044","cusip":"02079K107","securityType":"Common Stock","source":"fixture","checkedAt":"2026-10-31"}',
  0, null, '{"status":"pending","reasons":["no_valuation"],"observedAt":"2026-10-31T00:00:00Z"}');
do $$ begin
  if (select generation from public.valuation_publication) <> 1 then raise exception 'generation'; end if;
  if (select tracking_result from public.valuation_publication) is not null then raise exception 'candidate promoted'; end if;
  begin
    perform public.write_valuation_publication((select identity from public.tracking_securities limit 1),0,null,
      '{"status":"invalid","reasons":["stale"],"observedAt":"2026-10-31T01:00:00Z"}');
    raise exception 'CAS accepted obsolete generation';
  exception when serialization_failure then null; end;
end $$;
reset role;
do $$ begin
  if has_table_privilege('authenticated','public.valuation_publication','INSERT') then raise exception 'browser write'; end if;
  if has_function_privilege('anon','public.write_valuation_publication(jsonb,bigint,jsonb,jsonb)','EXECUTE') then raise exception 'public RPC'; end if;
end $$;
-- Seed legacy + same-run candidate as owner, then exercise the service-only bridge.
insert into public.valuation_snapshot values('GOOG',true,true,'{"model_version":"fixture-v1","assessment_status":"valid"}',now());
set local role service_role;
do $$ declare v_identity jsonb; v_candidate jsonb; begin
  select identity into v_identity from public.tracking_securities limit 1;
  v_candidate=jsonb_build_object('record',jsonb_build_object('schemaVersion',1,'identity',v_identity,'revisionId','fixture','publishedAt',null),'presentation','{}'::jsonb);
  perform public.write_valuation_publication(v_identity,1,v_candidate,'{"status":"valid","reasons":[],"observedAt":"2026-10-31T02:00:00Z"}');
  if public.invalidate_valuation_publications(array['GOOG'],'2026-10-31T01:00:00Z','fixture-v1')<>0 then raise exception 'old failure overwrote newer candidate'; end if;
  if public.invalidate_valuation_publications(array['GOOG'],'2026-10-31T03:00:00Z','fixture-v1')<>1 then raise exception 'bridge count'; end if;
  if (select reliable from public.valuation_snapshot where ticker='GOOG') then raise exception 'legacy remains reliable'; end if;
  if (select safety->>'status' from public.valuation_publication) <> 'invalid' then raise exception 'new safety not revoked'; end if;
  if (select generation from public.valuation_publication)<>3 then raise exception 'safety must invalidate CAS'; end if;
  if public.invalidate_valuation_publications(array['GOOG'],'2026-10-31T04:00:00Z','fixture-v1')<>0 then raise exception 'invalidation not idempotent'; end if;
  begin
    perform public.write_valuation_publication(v_identity,3,v_candidate,'{"status":"valid","reasons":[],"observedAt":"2026-10-31T01:00:00Z"}');
    raise exception 'older observation restored invalid candidate';
  exception when serialization_failure then null; end;
  if (select public_result from public.valuation_publication) is distinct from v_candidate then raise exception 'invalidation mutated immutable candidate'; end if;
  begin
    perform public.write_valuation_publication(v_identity || '{"key":"figi:BBG000000002","figi":"BBG000000002"}',0,null,null);
    raise exception 'ticker reuse replaced verified identity';
  exception when invalid_parameter_value then null; end;
end $$;
reset role;
-- Neither candidates nor safety updates may overwrite a prior confirmed result/presentation.
update public.valuation_publication set tracking_result=public_result->'record',tracking_presentation='{"fixture":"confirmed"}',tracking_generation=2;
set local role service_role;
select public.write_valuation_publication(identity,3,null,null) from public.tracking_securities;
do $$ begin
 if (select tracking_presentation from public.valuation_publication) <> '{"fixture":"confirmed"}'::jsonb then raise exception 'lost confirmed presentation'; end if;
 if (select tracking_result from public.valuation_publication) is null then raise exception 'lost confirmed record'; end if;
 begin
   update public.valuation_publication set generation=99;
   raise exception 'service bypassed controlled writer';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
