/** Local HTTP/contract fixtures only; these are NOT deployed page acceptance. */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { publicationTargets, publicationManifest, verifyPublishedPages, assertPublicationBinding, createPublicationClient, prepareTrackingPublication, confirmTrackingPublication, type PublicationContext, type PublicationManifest } from "./trackingPublication";
import { publicationSourceDigest, publicationRowAttributes, publicationSourceAttributes } from "../../src/lib/valuation/publicationProof";
import { refreshTrackingPublicationPaths } from "./valuationPublication";
import type { TrackingRecord } from "../../src/lib/valuation/trackingContract";

async function main() {
  // An actual HTTP 200 with stale numeric-container markers must never pass.
  const key = "figi:BBG009S3NB30", revision = "2".repeat(64), oldRevision = "1".repeat(64);
  const record = { identity: { key, ticker: "GOOG" }, revisionId: revision, status: "valid" } as TrackingRecord;
  const digest = publicationSourceDigest({ completeInputs: [{ key, revision }], filter: "all" });
  assert.notEqual(digest, publicationSourceDigest({ completeInputs: [{ key, revision }], filter: "cheap" }));
  assert.equal(publicationSourceDigest({ a: 1, b: 2 }), publicationSourceDigest({ b: 2, a: 1 }));
  const member = { identityKey: key, revisionId: revision };
  let mode = "fresh", hits = 0, active = 0, peak = 0;
  let queueManifests: PublicationManifest[]=[];
  let fairQueue=false;
  const scheduledBatchSizes:number[]=[];
  const rpcBodies: {path:string;body:Record<string,unknown>}[]=[];
  const attrs = (obj: Record<string,string>) => Object.entries(obj).map(([k,v]) => `${k}="${v}"`).join(" ");
  const server = createServer(async (req,res) => {
    if (req.url!.startsWith("/rest/v1/tracking_publication_intents")) {
      res.setHeader("content-type","application/json"); res.end(JSON.stringify(queueManifests.slice(0,Number(new URL(req.url!,"http://fixture.invalid").searchParams.get("limit") ?? 20)).map(manifest=>({manifest})))); return;
    }
    // Retry now reconciles actual producer inputs before reading its bounded intent queue.
    // This verifier-only fixture has no current candidates/holdings to reconcile.
    if (req.url!.startsWith("/rest/v1/") && !["next_tracking_publication_batch_v1","prepare_tracking_publication_v1","confirm_tracking_publication_v1"].some(name=>req.url!.includes(name))) {
      res.setHeader("content-type","application/json"); res.end("[]"); return;
    }
    if (req.method==="POST") {
      let body=""; for await(const chunk of req) body+=chunk;
      rpcBodies.push({path:req.url!,body:JSON.parse(body)});
      res.setHeader("content-type","application/json");
      if (req.url!.includes("next_tracking_publication_batch_v1")) {
        const batch=queueManifests.slice(0,20);
        queueManifests=[...queueManifests.slice(20),...batch];
        scheduledBatchSizes.push(batch.length);
        res.end(JSON.stringify(batch.map(manifest=>({manifest})))); return;
      }
      const parsed=JSON.parse(body);
      if (fairQueue && req.url!.includes("revalidate") && parsed.paths.some((path:string)=>path.includes("blocked="))) {
        res.statusCode=503;res.end('{"ok":false}');return;
      }
      if (fairQueue && req.url!.includes("confirm_tracking")) queueManifests=queueManifests.filter(manifest=>manifest.intentId!==parsed.p_proof.intentId);
      res.end(req.url!.includes("confirm_tracking") ? '{"confirmed":1,"pending":0}' : '{"ok":true}'); return;
    }
    assert.equal(req.headers.authorization,undefined,"ordinary GET must not carry credentials");
    assert.equal(req.headers["cache-control"],undefined,"must probe ordinary cached public URL");
    hits++; active++; peak = Math.max(peak,active);
    await new Promise(resolve => setTimeout(resolve,5));
    const path = req.url!;
    const absent = path.includes("page=2") || path.includes("cheap");
    const stale = mode === "stale" || mode === "zh-stale" && path.startsWith("/zh") || mode === "investor-stale" && path.includes("fixture-fund");
    const rows = absent && mode !== "ghost" ? "" : `<div ${attrs(publicationRowAttributes({ ...member, revisionId: stale ? oldRevision : revision }))}>100</div>`;
    const source = attrs(publicationSourceAttributes(path, digest));
    const html = `<html><body><main ${source}>${rows}</main></body></html>`;
    res.setHeader("content-type","text/html");
    res.end(mode === "script-only" ? `<script>${html}</script>` : mode === "noscript-only" ? `<noscript>${html}</noscript>` : mode === "metadata-only" ? `<html><head ${source}></head><body></body></html>` : mode === "hidden-region" ? html.replace("<main ", "<main hidden ") : mode === "hidden-row" ? html.replace("<div ", '<div style="display:none" ') : mode === "outside-region" ? `<main ${source}></main>${rows}` : mode === "old-digest" ? html.replaceAll(digest,"0".repeat(64)) : html);
    active--;
  });
  await new Promise<void>(resolve => server.listen(0,"127.0.0.1",resolve));
  try {
    const address = server.address() as {port:number};
    const origin = `http://127.0.0.1:${address.port}`;
    const routes = ["/", "/stocks", "/stocks/screener", "/investors/consensus", "/stocks/GOOG", "/investors/fixture-fund", "/stocks?page=2", "/stocks/screener/cheap"];
    const after = (["en","zh"] as const).flatMap(language => routes.map(route => ({ path: language === "en" ? route : `/zh${route === "/" ? "" : route}`, language,
      sourceDigest: digest, members: route.includes("page=2") || route.includes("cheap") ? [] : [member] })));
    const before = after.map(route => ({...route,members:[{ ...member,revisionId:oldRevision }]}));
    const context: PublicationContext = { schemaVersion:1,origin,watchedSecurityKeys:[key],generations:{[key]:2},before,after };
    const targets = publicationTargets([record],context);
    assert.equal(targets.length,16);
    assert.equal(publicationTargets([{...record,status:"pending"}],context).length,0,"unconfirmable candidates must not block the valid watched batch");
    assert.throws(()=>publicationTargets([record],{...context,after:after.map(route=>route.path==="/stocks/GOOG" ? {...route,members:[]} : route)}),/stock.*present/i,"valid individual stock cannot be confirmed through absence");
    assert.equal(targets.find(t=>t.url.endsWith("page=2"))!.expectations[0].presence,"absent");
    assert.equal(publicationTargets([record],{...context,watchedSecurityKeys:[]}).length,0,"no whole-market warming");
    assert.throws(()=>publicationTargets([record],{...context,after:after.filter(r=>r.path!=="/stocks?page=2")}),/missing.*after/i);
    assert.throws(()=>assertPublicationBinding(origin,"https://production.supabase.co",{origin:"https://thecompounder.fyi",supabaseUrl:"https://production.supabase.co"}),/binding/i);
    assert.throws(()=>assertPublicationBinding(origin,"https://preview.supabase.co",{origin,supabaseUrl:"https://production.supabase.co"}),/binding/i);
    assertPublicationBinding(origin,"http://127.0.0.1:54321",{origin,supabaseUrl:"http://127.0.0.1:54321"});
    const proof = await verifyPublishedPages([...targets,targets[0]],fetch);
    assert.equal(proof.targets.length,16,"deduplicate before probing");
    assert.equal(proof.generations[0].generation,2);
    assert.ok(peak<=3,"bounded probe concurrency");
    const db=createPublicationClient(origin,"fixture-service-key",{origin,supabaseUrl:origin});
    await prepareTrackingPublication(db,targets);
    assert.deepEqual(Object.keys(rpcBodies[0].body),["p_manifest"]);
    assert.equal((rpcBodies[0].body.p_manifest as {intentId:string}).intentId,proof.intentId);
    await refreshTrackingPublicationPaths(origin,targets.map(target=>target.path),"fixture-ingest-secret");
    assert.equal(rpcBodies[1].path,"/api/revalidate?source=tracking-publication");
    assert.equal((rpcBodies[1].body.paths as string[]).length,16);
    assert.deepEqual(await confirmTrackingPublication(db,proof),{confirmed:1,pending:0});
    assert.equal((rpcBodies[2].body.p_proof as {intentId:string}).intentId,proof.intentId);
    await assert.rejects(confirmTrackingPublication(db,{...proof}),/proof/i,"a serialized/unverified proof must be re-probed");
    proof.targets[0].expectedSourceDigest="0".repeat(64);
    await assert.rejects(confirmTrackingPublication(db,proof),/proof/i,"a caller cannot mutate a verified proof");
    proof.targets[0].expectedSourceDigest=digest;
    const wrongOriginDb=createPublicationClient(origin,"fixture-service-key",{origin:"https://preview.invalid",supabaseUrl:origin});
    await assert.rejects(confirmTrackingPublication(wrongOriginDb,proof),/binding/i);
    await assert.rejects(prepareTrackingPublication(wrongOriginDb,targets),/binding/i);

    queueManifests=[rpcBodies[0].body.p_manifest as PublicationManifest];
    async function runWorkflow(binding:unknown) {
      const child=spawn(process.execPath,["node_modules/tsx/dist/cli.mjs","--tsconfig","scripts/tsconfig.json","scripts/valuation-publication-verify.ts"],{
        env:{...process.env,VALUATION_PUBLICATION_VERIFY_ENABLED:"1",SUPABASE_URL:origin,SUPABASE_SERVICE_KEY:"fixture-service-key",INGEST_SECRET:"fixture-ingest-secret",
          VALUATION_PUBLICATION_BINDING:JSON.stringify(binding),VALUATION_PUBLICATION_SEED_KEYS:key},stdio:["ignore","pipe","pipe"],
      });
      let output=""; child.stdout.on("data",chunk=>output+=chunk);child.stderr.on("data",chunk=>output+=chunk);
      const code=await new Promise<number|null>((resolve,reject)=>{child.on("error",reject);child.on("close",resolve);});
      assert.ok(!output.includes(key) && !output.includes("GOOG") && !output.includes("fixture-fund") && !output.includes("fixture-service-key"),"workflow logs must not leak watch keys/paths/credentials");
      return {code,output};
    }
    assert.equal((await runWorkflow({origin,supabaseUrl:origin})).code,0,"durable queue runs without manual manifest input");
    const beforeFailure=rpcBodies.filter(call=>call.path.includes("confirm_tracking")).length;
    mode="investor-stale";
    const failedRun=await runWorkflow({origin,supabaseUrl:origin});
    assert.equal(failedRun.code,1);
    assert.match(failedRun.output,/pending=1, failed_batches=1/);
    assert.equal(rpcBodies.filter(call=>call.path.includes("confirm_tracking")).length,beforeFailure,"failed rendered proof never reaches confirmation RPC");
    const wrongBackend=await runWorkflow({origin,supabaseUrl:"https://production.supabase.co"});
    assert.equal(wrongBackend.code,1,"workflow rejects mismatched backend before probing");
    // >20 durable intents: the newest prefix is permanently blocked/ineligible, while
    // five older valid intents must progress on the next bounded workflow invocation.
    mode="fresh";fairQueue=true;
    const blocked=Array.from({length:20},(_,index)=>publicationManifest(targets.map((target,position)=>({
      ...target,
      ...(index>=10 && position===0 ? {path:`/stocks?blocked=${index}`,url:`${origin}/stocks?blocked=${index}`} : {}),
      expectations:target.expectations.map(expected=>({...expected,generation:100+index,...(index<10 ? {identityKey:"fixture:unwatched"}:{})})),
    }))));
    const olderValid=Array.from({length:5},(_,index)=>publicationManifest(targets.map(target=>({...target,
      expectations:target.expectations.map(expected=>({...expected,generation:200+index})),
    }))));
    queueManifests=[...blocked,...olderValid];
    const firstTurn=await runWorkflow({origin,supabaseUrl:origin});
    assert.equal(firstTurn.code,1,"blocked obligations remain pending");
    const secondTurn=await runWorkflow({origin,supabaseUrl:origin});
    assert.match(secondTurn.output,/confirmed=5,/ ,"older valid intents must progress across bounded runs");
    assert.equal(queueManifests.length,20,"blocked/ineligible intents remain durable after valid work completes");
    assert.deepEqual(new Set(queueManifests.map(manifest=>manifest.intentId)),new Set(blocked.map(manifest=>manifest.intentId)));
    assert.ok(scheduledBatchSizes.every(size=>size<=20),"each scheduler call remains bounded");
    assert.ok(scheduledBatchSizes.length>=2,"workflow uses durable scheduler progress");
    fairQueue=false;
    for (const failure of ["stale","zh-stale","investor-stale","ghost","old-digest","script-only","noscript-only","outside-region","hidden-region","hidden-row"]) {
      mode=failure;
      await assert.rejects(verifyPublishedPages(targets,fetch),/revision|absence|digest|marker/i,failure);
    }
    mode="metadata-only";
    await assert.rejects(verifyPublishedPages([targets.find(t=>t.path.includes("page=2"))!],fetch),/marker/i,"absence needs an actual body valuation region too");
    mode="stale"; hits=0;
    await assert.rejects(verifyPublishedPages([targets[0]],fetch),/revision/i);
    assert.equal(hits,4,"four attempts maximum");
    let timeouts=0;
    await assert.rejects(verifyPublishedPages([targets[0]],async (_url,init)=> {
      assert.ok(init?.signal,"timeout supplied"); timeouts++;
      throw new DOMException("fixture timeout","TimeoutError");
    }),/timeout/i);
    assert.equal(timeouts,4);
    console.log("tracking publication HTTP fixture checks OK (stale/bilingual/investor/absence/digest/retry/concurrency/binding)");
  } finally { server.closeAllConnections(); await new Promise<void>(resolve=>server.close(()=>resolve())); }
}
main().catch(error=>{console.error(error);process.exitCode=1;});
