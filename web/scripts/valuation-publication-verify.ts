import { reconcileAutomaticPublication } from './lib/publicationProducer';
/** Workflow retry entrypoint. Task6 persists manifests automatically BEFORE public replacement.
 * No manual manifest or public proof endpoint; no URLs/keys/manifests printed in Actions logs.
 */
import { refreshTrackingPublicationPaths } from "./lib/valuationPublication";
import { createPublicationClient, publicationManifest, verifyPublishedPages, confirmTrackingPublication,
  type PublicationBinding, type PublicationManifest } from "./lib/trackingPublication";

async function main() {
  if (process.env.VALUATION_PUBLICATION_VERIFY_ENABLED!=="1") {
    console.log("Rendered publication verification disabled pending release acceptance."); return;
  }
  const url=process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const secret=process.env.INGEST_SECRET;
  const rawBinding=process.env.VALUATION_PUBLICATION_BINDING;
  const seeds=new Set((process.env.VALUATION_PUBLICATION_SEED_KEYS ?? "").split(",").map(key=>key.trim()).filter(Boolean));
  if (!url || !key || !secret || !rawBinding || !seeds.size || seeds.size>500) throw new Error("PUBLICATION_CONFIGURATION_REQUIRED");
  const binding=JSON.parse(rawBinding) as PublicationBinding;
  const db=createPublicationClient(url,key,binding);
  await reconcileAutomaticPublication(db,binding.origin,seeds);
  // Until Task7 supplies active keys, only explicitly configured seed securities are probed.
  // Durable round-robin tickets advance before processing, including skipped/failed work.
  // A worker crash retains every obligation without pinning the next run to the same prefix.
  const {data,error}=await db.rpc("next_tracking_publication_batch_v1");
  if (error) throw new Error("PUBLICATION_QUEUE_UNAVAILABLE");
  let confirmed=0,pending=0,failed=0;
  for (const row of data ?? []) {
    let candidateCount=1;
    try {
      const saved=row.manifest as PublicationManifest;
      // Rebuild canonical manifest; never trust stored JSON to redirect credentials or GETs.
      const manifest=publicationManifest(saved.targets);
      candidateCount=manifest.generations.length;
      if (manifest.intentId!==saved.intentId || manifest.origin!==new URL(binding.origin).origin ||
          manifest.generations.some(generation=>!seeds.has(generation.identityKey))) { pending+=candidateCount; continue; }
      await refreshTrackingPublicationPaths(manifest.origin,manifest.targets.map(target=>target.path),secret);
      const proof=await verifyPublishedPages(manifest.targets,fetch);
      const result=await confirmTrackingPublication(db,proof);
      confirmed+=result.confirmed; pending+=result.pending;
    } catch { failed++; pending+=candidateCount; }
  }
  console.log(`Rendered publication verification: confirmed=${confirmed}, pending=${pending}, failed_batches=${failed}.`);
  if (failed || pending) process.exitCode=1;
}
main().catch(()=> {
  // Error objects/URLs can disclose the aggregate followed-security set in public workflow logs.
  console.error("Rendered publication verification unavailable; durable intents retained. Check private configuration/database diagnostics.");
  process.exitCode=1;
});
