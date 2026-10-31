import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";
import type { TrackingRecord } from "../../src/lib/valuation/trackingContract";
import { publicationSourceDigest, type RenderedPublicationMember } from "../../src/lib/valuation/publicationProof";
import { publicationPath, requiredPublicationPaths } from "../../src/lib/revalidate/paths";

export type PublicationRouteSnapshot = {
  /** Canonical PUBLIC path, including the exact filter/view/page query. English uses bare URLs. */
  path: string; language: "en" | "zh"; sourceDigest: string;
  members: RenderedPublicationMember[];
};
export type PublicationContext = {
  schemaVersion: 1; origin: string;
  /** Task7 active keys; until then an explicit bounded seed set, never the whole universe. */
  watchedSecurityKeys: string[];
  /** Intended writer generation tokens, including first confirmations. */
  generations: Record<string,number>;
  /** Producer must capture/persist BEFORE replacing candidates. Include outstanding older
   * intent memberships too: the cache may still contain any unconfirmed generation.
   * after includes every prior affected path, even if the row/page becomes empty.
   * Task6 supplies these from shared actual page projection inputs, not duplicated filters.
   */
  before: PublicationRouteSnapshot[]; after: PublicationRouteSnapshot[];
};
export type PublicationExpectation = RenderedPublicationMember & { generation: number; presence: "present" | "absent" };
export type PublicationTarget = {
  url: string; path: string; language: "en" | "zh"; expectedSourceDigest: string;
  expectations: PublicationExpectation[];
};
export type PublicationGeneration = RenderedPublicationMember & { generation:number };
export type PublicationProof = {
  schemaVersion: 1; intentId: string; verifiedAt: string; origin: string;
  targets: PublicationTarget[]; generations: PublicationGeneration[];
  observations: { url:string; sourceDigest:string; members:RenderedPublicationMember[] }[];
};
export type PublicationManifest = {
  schemaVersion:1; intentId:string; origin:string; targets:PublicationTarget[]; generations:PublicationGeneration[];
};
export type PublicationBinding = { origin:string; supabaseUrl:string };
const HASH=/^[a-f0-9]{64}$/;
const verifiedProofs=new WeakMap<PublicationProof,string>();
const clientBindings=new WeakMap<SupabaseClient,PublicationBinding>();
function originOf(raw:string):string {
  const url=new URL(raw);
  if (url.username || url.password || url.search || url.hash || url.pathname!=="/" ||
      !(url.protocol==="https:" || url.protocol==="http:" && ["localhost","127.0.0.1","[::1]"].includes(url.hostname))) throw new Error("Invalid publication origin");
  return url.origin;
}
/** The binding comes from trusted environment configuration, never the incoming manifest.
 * Both coordinates must match. A preview manifest cannot probe preview then confirm production.
 */
export function assertPublicationBinding(origin:string, supabaseUrl:string, binding:PublicationBinding):void {
  if (originOf(origin)!==originOf(binding.origin) || originOf(supabaseUrl)!==originOf(binding.supabaseUrl)) throw new Error("Publication app/backend binding mismatch");
}
/** Only this factory registers a write-capable verifier client; the backend URL is the
 * actual constructor URL, not a claim supplied alongside an unrelated client instance.
 */
export function createPublicationClient(supabaseUrl:string,key:string,binding:PublicationBinding):SupabaseClient {
  assertPublicationBinding(binding.origin,supabaseUrl,binding);
  const db=createClient(supabaseUrl,key,{auth:{persistSession:false},realtime:{transport:WebSocket as unknown as never}});
  clientBindings.set(db,{origin:originOf(binding.origin),supabaseUrl:originOf(supabaseUrl)});
  return db;
}
function assertClientBinding(db:SupabaseClient,origin:string):void {
  const binding=clientBindings.get(db);
  if (!binding || binding.origin!==originOf(origin)) throw new Error("Publication app/backend binding required");
}
export function publicationTargets(records:TrackingRecord[],context:PublicationContext):PublicationTarget[] {
  if (context.schemaVersion!==1) throw new Error("Unsupported publication context version");
  const origin=originOf(context.origin), watched=new Set(context.watchedSecurityKeys);
  if (watched.size>500) throw new Error("Publication seed/watch batch exceeds 500 securities");
  const selected=records.filter(record=>watched.has(record.identity.key) && record.status==="valid");
  const before=new Map<string,PublicationRouteSnapshot>(), after=new Map<string,PublicationRouteSnapshot>();
  for (const [rows,map] of [[context.before,before],[context.after,after]] as const) for (const route of rows) {
    const path=publicationPath(route.path);
    if (path!==route.path || route.language!==((new URL(path,origin).pathname==="/zh" || path.startsWith("/zh/")) ? "zh":"en") || !HASH.test(route.sourceDigest)) throw new Error("Invalid route snapshot");
    if (map.has(path)) throw new Error("Duplicate route snapshot");
    map.set(path,route);
  }
  const selectedKeys=new Set(selected.map(record=>record.identity.key));
  if (selectedKeys.size!==selected.length) throw new Error("Duplicate publication identity");
  const affected=new Set(selected.flatMap(record=>requiredPublicationPaths(record.identity.ticker)));
  for (const route of [...before.values(),...after.values()]) if (route.members.some(member=>selectedKeys.has(member.identityKey))) affected.add(route.path);
  return [...affected].sort().map(path=> {
    const route=after.get(path);
    if (!route) throw new Error(`Missing after route snapshot: ${path}`);
    const prior=before.get(path);
    const expectations=selected.filter(record=>requiredPublicationPaths(record.identity.ticker).includes(path) ||
      [...(prior?.members ?? []),...route.members].some(member=>member.identityKey===record.identity.key)).map(record=> {
      const generation=context.generations[record.identity.key];
      if (!Number.isSafeInteger(generation) || generation<1 || !HASH.test(record.revisionId)) throw new Error("Invalid publication generation/revision");
      const present=route.members.filter(member=>member.identityKey===record.identity.key);
      if ([`/stocks/${record.identity.ticker}`,`/zh/stocks/${record.identity.ticker}`].includes(path) && !present.length) throw new Error("Individual stock revision must be present");
      if (present.some(member=>member.revisionId!==record.revisionId)) throw new Error("After membership revision mismatch");
      return {identityKey:record.identity.key,revisionId:record.revisionId,generation,presence:present.length ? "present" as const : "absent" as const};
    });
    return {url:new URL(path,origin).href,path,language:route.language,expectedSourceDigest:route.sourceDigest,expectations};
  });
}
export function publicationManifest(input:PublicationTarget[]):PublicationManifest {
  const urls=new Map<string,PublicationTarget>();
  for (const target of input) {
    const url=new URL(target.url);
    if (url.href!==new URL(publicationPath(target.path),url.origin).href || !HASH.test(target.expectedSourceDigest) || !target.expectations.length) throw new Error("Invalid publication target");
    const prior=urls.get(target.url);
    if (prior && publicationSourceDigest(prior)!==publicationSourceDigest(target)) throw new Error("Conflicting duplicate target");
    urls.set(target.url,structuredClone(target));
  }
  const targets=[...urls.values()].sort((a,b)=>a.url.localeCompare(b.url));
  if (!targets.length) throw new Error("No publication targets");
  const origin=originOf(new URL(targets[0].url).origin);
  const map=new Map<string,PublicationGeneration>();
  for (const target of targets) {
    if (new URL(target.url).origin!==origin) throw new Error("Mixed publication origins");
    for (const {identityKey,revisionId,generation,presence} of target.expectations) {
      if (!identityKey || !HASH.test(revisionId) || !Number.isSafeInteger(generation) || generation<1 || !["present","absent"].includes(presence)) throw new Error("Invalid publication expectation");
      const old=map.get(identityKey);
      if (old && (old.revisionId!==revisionId || old.generation!==generation)) throw new Error("Mixed publication generations");
      map.set(identityKey,{identityKey,revisionId,generation});
    }
  }
  const generations=[...map.values()].sort((a,b)=>a.identityKey.localeCompare(b.identityKey));
  const body={schemaVersion:1 as const,origin,targets,generations};
  return {...body,intentId:publicationSourceDigest(body)};
}
/** Parse actual HTML, excluding scripts/RSC, comments, templates and noscript fallback.
 * All numeric row markers must live inside the one actual valuation region.
 */
function readMarkers(html:string,target:PublicationTarget):PublicationProof["observations"][number] {
  let sources=0;
  const members:RenderedPublicationMember[]=[];
  function visit(node:DefaultTreeAdapterTypes.Node,inRegion:boolean,inBody=false):void {
    if ("tagName" in node) {
      if (node.tagName==="body") inBody=true;
      if (["script","style","template","noscript"].includes(node.tagName)) return;
      const attrs=Object.fromEntries(node.attrs.map(attr=>[attr.name,attr.value]));
      if ("hidden" in attrs || "inert" in attrs || attrs["aria-hidden"]==="true" || /(?:display\s*:\s*none|visibility\s*:\s*(?:hidden|collapse))/i.test(attrs.style ?? "")) return;
      if (attrs["data-valuation-proof"]!==undefined) {
        if (!inBody || !["main","section","article","div","table","tbody","ol","ul"].includes(node.tagName)) throw new Error("Source marker requires an actual body valuation region");
        if (attrs["data-valuation-proof"]!=="1" || attrs["data-valuation-path"]!==Buffer.from(target.path).toString("base64url") || attrs["data-valuation-source"]!==target.expectedSourceDigest) throw new Error(`Source digest/route marker mismatch: ${target.url}`);
        sources++; inRegion=true;
      }
      if (attrs["data-valuation-identity"]!==undefined) {
        if (!inRegion || !HASH.test(attrs["data-valuation-revision"] ?? "")) throw new Error("Invalid numeric region/revision marker");
        const identityKey=Buffer.from(attrs["data-valuation-identity"],"base64url").toString();
        if (Buffer.from(identityKey).toString("base64url")!==attrs["data-valuation-identity"]) throw new Error("Invalid identity marker");
        members.push({identityKey,revisionId:attrs["data-valuation-revision"]});
      }
    }
    if ("childNodes" in node) for (const child of node.childNodes) visit(child,inRegion,inBody);
  }
  visit(parse(html),false);
  if (sources!==1) throw new Error(`Missing/ambiguous source marker: ${target.url}`);
  for (const expected of target.expectations) {
    const rows=members.filter(member=>member.identityKey===expected.identityKey);
    if (expected.presence==="absent" ? rows.length!==0 : !rows.length || rows.some(row=>row.revisionId!==expected.revisionId)) throw new Error(`Rendered revision/absence mismatch: ${target.url}`);
  }
  return {url:target.url,sourceDigest:target.expectedSourceDigest,members};
}
export async function verifyPublishedPages(targets:PublicationTarget[],fetcher:typeof fetch):Promise<PublicationProof> {
  const manifest=publicationManifest(targets), observations:PublicationProof["observations"]=[];
  let next=0;
  const failures:unknown[]=[];
  await Promise.all(Array.from({length:Math.min(3,manifest.targets.length)},async()=> {
    for (;;) {
      const target=manifest.targets[next++]; if (!target) return;
      for (let attempt=0;attempt<4;attempt++) {
        try {
          // Ordinary public GET: no credentials, cache bypass, probe query, or acceptance API.
          const response=await fetcher(target.url,{method:"GET",redirect:"error",signal:AbortSignal.timeout(15_000),headers:{Accept:"text/html"}});
          if (!response.ok || !response.headers.get("content-type")?.includes("text/html")) throw new Error(`Page probe failed (HTTP ${response.status})`);
          observations.push(readMarkers(await response.text(),target)); break;
        } catch (error) {
          if (attempt===3) failures.push(error);
          else await new Promise(resolve=>setTimeout(resolve,250 * 2 ** attempt));
        }
      }
    }
  }));
  if (failures.length) throw new AggregateError(failures,`Publication remains pending: ${failures.map(error=>error instanceof Error ? error.message:String(error)).join("; ")}`);
  const proof:PublicationProof={...manifest,verifiedAt:new Date().toISOString(),observations:observations.sort((a,b)=>a.url.localeCompare(b.url))};
  verifiedProofs.set(proof,publicationSourceDigest(proof)); return proof;
}
/** Persist before candidate replacement; retries load the same immutable targets, never erase them
 * on revalidate 200. Task6 producer must reconcile stale intents with the latest CAS candidates.
 */
export async function prepareTrackingPublication(db:SupabaseClient,targets:PublicationTarget[]):Promise<PublicationManifest> {
  const manifest=publicationManifest(targets);
  assertClientBinding(db,manifest.origin);
  const {error}=await db.rpc("prepare_tracking_publication_v1",{p_manifest:manifest});
  if (error) throw new Error(`Publication intent failed: ${error.message}`);
  return manifest;
}
export async function confirmTrackingPublication(db:SupabaseClient,proof:PublicationProof):Promise<{confirmed:number;pending:number}> {
  if (verifiedProofs.get(proof)!==publicationSourceDigest(proof)) throw new Error("Fresh unmodified rendered page proof required");
  assertClientBinding(db,proof.origin);
  const {data,error}=await db.rpc("confirm_tracking_publication_v1",{p_proof:proof});
  if (error) throw new Error(`Publication confirmation failed: ${error.message}`);
  if (!data || !Number.isInteger(data.confirmed) || !Number.isInteger(data.pending)) throw new Error("Invalid confirmation response");
  return data;
}
