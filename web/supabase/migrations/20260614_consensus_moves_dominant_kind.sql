-- consensus_moves.dominant_kind is part of the consensus output (every move row
-- carries it) but had not been provisioned in production, so the moves upsert
-- failed with PostgREST PGRST204 ("column not in schema cache") and silently
-- left consensus_moves empty while consensus_holdings (no such column) wrote
-- fine. Provision it idempotently and reload the PostgREST schema cache.
alter table public.consensus_moves add column if not exists dominant_kind text;
notify pgrst, 'reload schema';
