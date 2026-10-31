import type { SupabaseClient } from '@supabase/supabase-js';
import { readAllSnapshots } from '../../src/lib/valuation/valuationSnapshot';
import { readPublicValuationSummaries } from '../../src/lib/valuation/publishedRead';
import { readPublicationWriteState, writeValuationPublication } from '../../src/lib/valuation/publishedAdapter';
import { readPublicationSelections, type PublicationSelections } from '../../src/lib/valuation/publicationSelections';
import { projectStrike, projectScreen, projectStockRows, initialStockRows, projectionDigest, screenerPath, selectedValuations, investorRenderedValues, snapshot } from '../../src/lib/valuation/publicationProjection';
import type { SnapshotVerdict, ScreenView } from '../../src/lib/valuation/valuationSnapshot';
import type { TrackingRecord } from '../../src/lib/valuation/trackingContract';
import { selectAllPages } from '../../src/lib/managers/db';
import { publicationTargets, prepareTrackingPublication, type PublicationManifest, type PublicationRouteSnapshot, type PublicationTarget } from './trackingPublication';
import { LIST_PAGE_SIZE } from '../../src/components/list/listQuery';
type CompletedPublication = {
    manifest: PublicationManifest;
    verifiedAt: string;
};
type ProducerInput = {
    origin: string;
    before: SnapshotVerdict[];
    after: SnapshotVerdict[];
    selection: PublicationSelections;
    records: TrackingRecord[];
    generations: Record<string, number>;
    outstanding: Pick<PublicationManifest, 'targets'>[];
    completed?: CompletedPublication[];
};
function routes(values: SnapshotVerdict[], selection: PublicationSelections, records: TrackingRecord[]): PublicationRouteSnapshot[] {
    const out: PublicationRouteSnapshot[] = [];
    const add = (path: string, language: 'en' | 'zh', sourceDigest: string, rows: SnapshotVerdict[]) => out.push({ path, language, sourceDigest, members: rows.map(v => ({ identityKey: v.publication.identityKey, revisionId: v.publication.revisionId })) });
    for (const language of ['en', 'zh'] as const) {
        const prefix = language === 'zh' ? '/zh' : '';
        add(prefix || '/', language, projectionDigest('home', values, { limit: 6 }), projectStrike(values, 6).leaders);
        const stocks = projectStockRows(selection.stocks, selection.cusipToTicker, values);
        const initial = initialStockRows(stocks);
        const initialKeys = new Set(initial.flatMap(r => r.bargain ? [r.bargain.publication.identityKey] : []));
        add(prefix + '/stocks', language, projectionDigest('stocks', stocks, { sort: 'holders', dir: 'desc', pageSize: LIST_PAGE_SIZE }), values.filter(v => initialKeys.has(v.publication.identityKey)));
        for (const view of ['all', 'below', 'strike_zone', 'conviction'] as ScreenView[])
            for (const sort of view === 'conviction' ? ['margin'] as const : ['margin', 'holders'] as const) {
                // Only the valuation-matched holdings collection is part of the renderer input.
                const holdings = new Map(values.map(v => [v.ticker, selection.screenHoldings.get(v.ticker)]).filter((entry): entry is [
                    string,
                    {
                        issuer: string;
                        holderCount: number;
                    }
                ] => !!entry[1]));
                add(screenerPath(language, view, sort), language, projectionDigest('screener', values, { holdings: [...holdings].sort(([a], [b]) => a.localeCompare(b)), view, sort }), projectScreen(values, holdings, view, sort));
            }
        const consensus = selectedValuations(values, selection.consensus.map(r => r.cusip));
        add(prefix + '/investors/consensus', language, projectionDigest('consensus', consensus, { rows: selection.consensus }), consensus);
        for (const investor of selection.investors) {
            const rows = selectedValuations(values, investor.tickers);
            add(prefix + '/investors/' + investor.slug, language, projectionDigest('investor', rows, { holdings: investor.holdings, displayHoldings: investor.displayHoldings, tickers: investor.tickers }), investorRenderedValues(investor, rows, selection.cusipToTicker));
        }
        for (const side of ['buy', 'sell'] as const) {
            const rows = side === 'buy' ? selection.moves.mostBought : selection.moves.mostSold;
            add(prefix + '/investors/' + (side === 'buy' ? 'buys' : 'sells'), language, projectionDigest('moves', [], { side, rows }), []);
        }
        for (const record of records) {
            const value = values.find(v => v.publication.identityKey === record.identity.key);
            add(prefix + '/stocks/' + record.identity.ticker, language, projectionDigest('detail', value ? record : null, { ticker: record.identity.ticker }), value ? [value] : []);
        }
    }
    return out;
}
export function buildAutomaticTargets(input: ProducerInput): PublicationTarget[] {
    const before = routes(input.before, input.selection, input.records), after = routes(input.after, input.selection, input.records);
    // Bootstrap inventories every actual route; conservative absent obligations are explicit
    // targets, not invented old memberships. Outstanding `absent` targets still count.
    const base = publicationTargets(input.records, { schemaVersion: 1, origin: input.origin, watchedSecurityKeys: input.records.map(r => r.identity.key), generations: input.generations, before, after });
    const targets = new Map(base.map(t => [t.path, t]));
    const completed = (input.completed ?? []).filter(item => item.manifest.origin === input.origin);
    const known = new Set(completed.flatMap(item => item.manifest.generations.map(g => g.identityKey)));
    // A verified presence remains an obligation until a later completed proof says absent.
    // Keep the full history: a bounded recent-key list cannot establish route membership.
    const historical = new Map<string, {
        target: PublicationTarget;
        expectation: PublicationTarget['expectations'][number];
        verifiedAt: string;
    }>();
    for (const item of completed) {
        for (const target of item.manifest.targets)
            for (const expectation of target.expectations) {
                const key = JSON.stringify([expectation.identityKey, target.path]);
                const previous = historical.get(key);
                if (!previous || Date.parse(item.verifiedAt) > Date.parse(previous.verifiedAt) ||
                    (Date.parse(item.verifiedAt) === Date.parse(previous.verifiedAt) && expectation.presence === 'present')) {
                    historical.set(key, { target, expectation, verifiedAt: item.verifiedAt });
                }
            }
    }
    const historicalTargets = [...historical.values()]
        .filter(item => item.expectation.presence === 'present')
        .map(item => ({ ...item.target, expectations: [item.expectation] }));
    for (const route of after) {
        const bootstrap = input.records.filter(r => !known.has(r.identity.key));
        if (!bootstrap.length)
            continue;
        const target = targets.get(route.path) ?? { url: new URL(route.path, input.origin).href, path: route.path, language: route.language, expectedSourceDigest: route.sourceDigest, expectations: [] };
        for (const r of bootstrap)
            if (!target.expectations.some(e => e.identityKey === r.identity.key))
                target.expectations.push({ identityKey: r.identity.key, revisionId: r.revisionId, generation: input.generations[r.identity.key], presence: route.members.some(m => m.identityKey === r.identity.key) ? 'present' : 'absent' });
        targets.set(route.path, target);
    }
    for (const old of [...historicalTargets, ...input.outstanding.flatMap(manifest => manifest.targets)]) {
        const relevant = old.expectations.filter(e => input.records.some(r => r.identity.key === e.identityKey));
        if (!relevant.length)
            continue;
        let target = targets.get(old.path);
        if (!target) {
            const route = after.find(r => r.path === old.path);
            if (!route)
                throw new Error(`Historical publication route requires reconciliation: ${old.path}`);
            target = { url: new URL(route.path, input.origin).href, path: route.path, language: route.language, expectedSourceDigest: route.sourceDigest, expectations: [] };
            targets.set(route.path, target);
        }
        for (const expectation of relevant)
            if (!target.expectations.some(e => e.identityKey === expectation.identityKey)) {
                const record = input.records.find(r => r.identity.key === expectation.identityKey)!;
                const route = after.find(r => r.path === target.path)!;
                target.expectations.push({ identityKey: record.identity.key, revisionId: record.revisionId, generation: input.generations[record.identity.key], presence: route.members.some(m => m.identityKey === record.identity.key) ? 'present' : 'absent' });
            }
    }
    return [...targets.values()].sort((a, b) => a.path.localeCompare(b.path));
}
export async function readPublicationInventory(db: SupabaseClient, origin?: string) {
    const result = await selectAllPages<{
        manifest: PublicationManifest;
        completed_at: string | null;
        superseded_by: string | null;
        verified_at: string | null;
    }>(() => db.from('tracking_publication_intents')
        .select('manifest,completed_at,superseded_by,verified_at:last_proof->>verifiedAt')
        .order('prepared_at').order('intent_id'));
    if (result.error) throw new Error('Publication route inventory unavailable');
    const outstanding: PublicationManifest[] = [];
    const completed: CompletedPublication[] = [];
    // Scan the append-only inventory with immutable ordering, then split each row.
    // Filtering mutable completion/supersession before offset pagination can skip
    // obligations as rows leave the pending set, or miss a pending→complete race.
    for (const row of result.data) {
        if (row.superseded_by) continue;
        if (!row.completed_at) {
            outstanding.push(row.manifest);
        } else if (row.manifest.origin === origin) {
            if (!row.verified_at || !Number.isFinite(Date.parse(row.verified_at)))
                throw new Error('Confirmed route inventory proof timestamp unavailable');
            // Use proof time, not commit time: an older proof may commit later.
            completed.push({manifest: row.manifest, verifiedAt: row.verified_at});
        }
    }
    return {outstanding, completed};
}
export async function capturePublicationInputs(db: SupabaseClient, origin?: string) {
    const [before, selection, inventory] = await Promise.all([
        readAllSnapshots(), readPublicationSelections(), readPublicationInventory(db, origin),
    ]);
    return {before, selection, ...inventory};
}
export async function prepareAutomaticPublication(db: SupabaseClient, input: ProducerInput) {
    if (!input.records.length)
        return null;
    return prepareTrackingPublication(db, buildAutomaticTargets(input));
}
/** Reconcile stale aggregate digests / partial batch CAS using actual current inputs, while
 * retaining every old URL/key obligation. The prior immutable intents are never overwritten. */
export async function reconcileAutomaticPublication(db: SupabaseClient, origin: string, seeds: Set<string>) {
    const capture = await capturePublicationInputs(db, origin);
    const state = await readPublicationWriteState(db);
    const tickers = [...state].filter(([, s]) => seeds.has(s.identity.key)).map(([ticker]) => ticker);
    const values = await readPublicValuationSummaries(tickers);
    const records = [...values.values()].map(v => v.record).filter(r => r.status === 'valid');
    const generations = Object.fromEntries(records.map(r => [r.identity.key, state.get(r.identity.ticker)!.generation]));
    return prepareAutomaticPublication(db, { ...capture, origin, after: capture.before, records, generations });
}
export { snapshot };
/** One boundary for the pre-write ordering guarantee, used by ingestion and its RPC test. */
export async function publishValuationCandidates(db: SupabaseClient, args: {
    candidates: import('../../src/lib/valuation/publishedRead').PublishedValuation[];
    state: Awaited<ReturnType<typeof readPublicationWriteState>>;
    publication?: {
        origin: string;
        seeds: Set<string>;
        capture: Omit<Awaited<ReturnType<typeof capturePublicationInputs>>, 'completed'> & {
            completed?: CompletedPublication[];
        };
        current: SnapshotVerdict[];
    };
    onWritten?: () => void;
}) {
    const { candidates, state, publication } = args;
    if (publication) {
        const after = new Map(publication.current.map(v => [v.ticker, v]));
        for (const candidate of candidates)
            after.set(candidate.record.identity.ticker, snapshot(candidate));
        const records = candidates.map(v => v.record).filter(r => publication.seeds.has(r.identity.key) && r.status === 'valid');
        const generations = Object.fromEntries(records.map(r => [r.identity.key, state.get(r.identity.ticker)!.generation + 1]));
        await prepareAutomaticPublication(db, { ...publication.capture, origin: publication.origin, after: [...after.values()].sort((a, b) => a.publication.identityKey.localeCompare(b.publication.identityKey)), records, generations });
    }
    for (const candidate of candidates) {
        const prior = state.get(candidate.record.identity.ticker)!;
        prior.generation = await writeValuationPublication(db, { identity: prior.identity, expectedGeneration: prior.generation, candidate, safety: { status: candidate.record.status === 'valid' ? 'valid' : 'pending', reasons: candidate.record.reasons, observedAt: candidate.record.computedAt } });
        args.onWritten?.();
    }
}
