-- Arjo — Circle bonds (Phase 2)
-- A bond is a refundable stake a member posts when joining a circle. It is the
-- primitive the defaulter flow depends on: returned in full when the member
-- completes the circle in good standing, or slashed if they default.
--
--   held     → bond is staked in the vault
--   returned → member completed cleanly; bond refunded
--   slashed  → member defaulted; bond redistributed (Phase 4)
--
-- Idempotent: every add is `if not exists`.

-- 1. Per-circle bond requirement ---------------------------------------------
alter table public.circles
  add column if not exists required_bond numeric(20, 2) not null default 0
    check (required_bond >= 0);

comment on column public.circles.required_bond is 'Refundable stake (in the circle currency) each member must post to join. 0 disables bonds for the circle.';

-- 2. Per-member bond + default tracking --------------------------------------
alter table public.circle_members
  -- Bond actually posted by this member (may exceed required_bond when a
  -- high-risk member is surcharged 2×/3× by the risk engine).
  add column if not exists bond_amount numeric(20, 2) not null default 0
    check (bond_amount >= 0),
  add column if not exists bond_status text not null default 'held'
    check (bond_status in ('held', 'returned', 'slashed')),
  -- Defaulter-flow scratch space (written by Phase-4 SECURITY DEFINER fns).
  add column if not exists grace_period_ends timestamptz,
  add column if not exists missed_contributions integer not null default 0,
  add column if not exists default_status text not null default 'none'
    check (default_status in ('none', 'grace', 'defaulted'));

comment on column public.circle_members.bond_amount is 'Refundable stake posted by this member, held in the vault until completion.';
comment on column public.circle_members.bond_status is 'held | returned | slashed.';
comment on column public.circle_members.default_status is 'SYSTEM-MANAGED. Per-circle defaulter standing: none | grace | defaulted.';

-- 3. Allow bond movements in the ledger --------------------------------------
-- The kind constraint was created inline (unnamed → auto-named
-- ledger_entries_kind_check). Drop and re-add it with the new bond kinds so
-- the ledger can record bond posts, refunds and slashes.
alter table public.ledger_entries
  drop constraint if exists ledger_entries_kind_check;

alter table public.ledger_entries
  add constraint ledger_entries_kind_check check (
    kind in (
      'contribution', 'lock', 'withdraw', 'autosave', 'payout',
      'penalty', 'bonus', 'bond', 'bond_refund', 'bond_slash'
    )
  );
