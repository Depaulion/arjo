-- 0018_bond_yield.sql
-- Yield-bearing member bonds.
--
-- A circle bond is a non-withdrawable stake every member posts on join. Until
-- now it sat idle in the platform vault. This migration makes the bond
-- yield-bearing: while it is held, its principal earns the same USYC-backed APY
-- as a SafeLock vault. The accrued yield is computed on-read from a single
-- timestamp (`bond_started_at`) using lib/yield-engine.ts — no cron, no balance
-- table to reconcile. On a good-standing return the member receives principal +
-- accrued yield; on a slash the whole position (principal + yield) is forfeited.
--
-- Apply manually via the Supabase dashboard SQL editor.

begin;

-- 1. When the bond principal started earning. Set on join; null for legacy rows
--    until backfilled below. Returned/slashed bonds keep the value for audit.
alter table public.circle_members
  add column if not exists bond_started_at timestamptz;

-- 2. Backfill existing held bonds so they begin accruing from when the member
--    joined (the bond was posted at join time). Only held bonds matter — a
--    returned/slashed bond has already been settled and earns nothing further.
update public.circle_members
  set bond_started_at = joined_at
  where bond_status = 'held'
    and bond_amount > 0
    and bond_started_at is null;

-- 3. Allow the ledger to record bond yield as its own entry kind, so the yield
--    paid out on return (or forfeited on slash) is auditable separately from the
--    principal movements ('bond', 'bond_refund', 'bond_slash').
alter table public.ledger_entries drop constraint if exists ledger_entries_kind_check;
alter table public.ledger_entries add constraint ledger_entries_kind_check check (
  kind in (
    'contribution','lock','withdraw','autosave','payout','penalty','bonus',
    'bond','bond_refund','bond_slash','bond_yield'
  )
);

commit;
