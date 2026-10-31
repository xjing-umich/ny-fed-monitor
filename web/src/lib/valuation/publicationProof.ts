import "server-only";
import { createHash } from "node:crypto";

/** v1 renderer protocol. These attributes belong on the actual SSR valuation region/row.
 * Source region uses main/section/article/div/table/tbody/ol/ul in the body.
 * Keep this server-only helper out of client bundles; pass prepared attributes as props.
 * Never emit independent DB-echo markers, JSON-only acceptance APIs, or markers in scripts.
 * The digest input MUST be the complete same-render valuation collection plus selection
 * inputs (filter/order/page/holdings), before slicing; never a second 'latest' DB read.
 */
export type RenderedPublicationMember = { identityKey: string; revisionId: string };
export function publicationSourceDigest(completeRenderInputs: unknown): string {
  function canonical(value: unknown): string {
    if (value === null || typeof value === "string" || typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      const row=value as Record<string,unknown>;
      return `{${Object.keys(row).sort().map(key=>`${JSON.stringify(key)}:${canonical(row[key])}`).join(",")}}`;
    }
    throw new Error("Publication digest requires complete finite JSON inputs");
  }
  return createHash("sha256").update(canonical(completeRenderInputs)).digest("hex");
}
export function publicationSourceAttributes(path: string, sourceDigest: string): Record<string,string> {
  return { "data-valuation-proof": "1", "data-valuation-path": Buffer.from(path).toString("base64url"), "data-valuation-source": sourceDigest };
}
export function publicationRowAttributes(member: RenderedPublicationMember): Record<string,string> {
  return { "data-valuation-identity": Buffer.from(member.identityKey).toString("base64url"), "data-valuation-revision": member.revisionId };
}
