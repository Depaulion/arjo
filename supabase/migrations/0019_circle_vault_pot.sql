-- Arjo — Circle pot moves into the platform vault
-- Previously each circle's pot was the *creator's personal Arc wallet*:
-- contributions were sent there, payouts and exit refunds went out from there.
-- That made the creator a custodian of everyone's money — the weak link in a
-- community marketplace where members join strangers.
--
-- This migration is the database half of moving the pot into the shared platform
-- vault (the single SCA wallet that already holds SafeLock principal and bonds).
-- The vault commingles every circle's funds, so per-circle attribution can no
-- longer be read from a single onchain address — the LEDGER becomes the source
-- of truth for "how much does circle X hold". These SECURITY DEFINER helpers let
-- the creator and members read that attribution without a service-role key and
-- without tripping the strict owner-scoped RLS on ledger_entries.
--
-- Pot accounting (per circle, status <> 'failed'):
--   pot_balance = Σ(contribution, autosave)  −  Σ(payout, withdraw)
-- Bonds (kinds bond / bond_refund / bond_slash / bond_yield) are EXCLUDED — a
-- bond is held collateral tracked by circle_members.bond_status, not pot money.
-- 'withdraw' rows scoped to a circle_id are exit refunds (savings withdrawals
-- carry a plan_id and a null circle_id, so they never match here).

-- 1. Visibility gate ----------------------------------------------------------
-- A circle's pot/contributors/activity are readable by: the creator, any member,
-- or anyone if the circle is public (social proof on the discovery card).
-- SECURITY DEFINER + a membership check, mirroring is_circle_creator (0006).
create or replace function public.can_view_circle(p_circle_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select
    exists (
      select 1 from public.circles c
      where c.id = p_circle_id
        and (c.is_public or c.created_by = auth.uid())
    )
    or exists (
      select 1 from public.circle_members m
      where m.circle_id = p_circle_id and m.user_id = auth.uid()
    );
$$;

-- 2. Pot balance (single number) ----------------------------------------------
-- Used as a safety ceiling by the payout route (never pay out more than the
-- circle has collected) and as the dashboard headline. Returns 0 to callers who
-- cannot view the circle.
create or replace function public.circle_pot_balance(p_circle_id uuid)
returns numeric
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_in numeric;
  v_out numeric;
begin
  if not public.can_view_circle(p_circle_id) then
    return 0;
  end if;

  select coalesce(sum(amount), 0) into v_in
    from public.ledger_entries
    where circle_id = p_circle_id
      and kind in ('contribution', 'autosave')
      and status <> 'failed';

  select coalesce(sum(amount), 0) into v_out
    from public.ledger_entries
    where circle_id = p_circle_id
      and kind in ('payout', 'withdraw')
      and status <> 'failed';

  return greatest(0, coalesce(v_in, 0) - coalesce(v_out, 0));
end;
$$;

-- 3. Pot summary (the dashboard stat cards) -----------------------------------
create or replace function public.circle_pot_summary(p_circle_id uuid)
returns table (
  pot_balance numeric,
  total_contributed numeric,
  total_paid_out numeric,
  contribution_count integer,
  payout_count integer,
  last_payout_at timestamptz,
  last_payout_to text,
  last_payout_amount numeric
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.can_view_circle(p_circle_id) then
    return; -- empty result set
  end if;

  return query
  with le as (
    select * from public.ledger_entries
    where circle_id = p_circle_id and status <> 'failed'
  ),
  inflow as (
    select coalesce(sum(amount), 0) as amt, count(*)::int as cnt
    from le where kind in ('contribution', 'autosave')
  ),
  outflow as (
    select coalesce(sum(amount), 0) as amt, count(*)::int as cnt
    from le where kind = 'payout'
  ),
  last_pay as (
    select created_at, destination, amount
    from le where kind = 'payout'
    order by created_at desc
    limit 1
  )
  select
    greatest(0, inflow.amt - (select coalesce(sum(amount),0) from le where kind in ('payout','withdraw'))),
    inflow.amt,
    outflow.amt,
    inflow.cnt,
    outflow.cnt,
    (select created_at from last_pay),
    (select destination from last_pay),
    (select amount from last_pay)
  from inflow, outflow;
end;
$$;

-- 4. Per-contributor breakdown (the Contributors panel) -----------------------
-- One row per member who has contributed, with their display name and payout
-- wallet so the UI can show real identities instead of raw addresses.
create or replace function public.circle_contributors(p_circle_id uuid)
returns table (
  user_id uuid,
  display_name text,
  address text,
  total numeric,
  count integer,
  last_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.can_view_circle(p_circle_id) then
    return;
  end if;

  return query
  select
    le.user_id,
    p.full_name as display_name,
    cm.payout_address as address,
    coalesce(sum(le.amount), 0) as total,
    count(*)::int as count,
    max(le.created_at) as last_at
  from public.ledger_entries le
  left join public.profiles p on p.id = le.user_id
  left join public.circle_members cm
    on cm.circle_id = le.circle_id and cm.user_id = le.user_id
  where le.circle_id = p_circle_id
    and le.kind in ('contribution', 'autosave')
    and le.status <> 'failed'
  group by le.user_id, p.full_name, cm.payout_address
  order by total desc;
end;
$$;

-- 5. Recent activity feed for the circle --------------------------------------
-- The circle's own ledger rows (contributions + payouts + exit refunds), newest
-- first, so the dashboard can show real per-circle transfers with explorer
-- links — replacing the old single-address onchain scan that breaks once funds
-- are commingled in the vault.
create or replace function public.circle_ledger_feed(p_circle_id uuid, p_limit integer default 25)
returns table (
  id uuid,
  kind text,
  amount numeric,
  status text,
  tx_hash text,
  destination text,
  -- The "other party" to show in the UI: the recipient address for outflows
  -- (payout/withdraw), the contributor's payout wallet for inflows.
  counterparty text,
  note text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.can_view_circle(p_circle_id) then
    return;
  end if;

  return query
  select
    le.id, le.kind, le.amount, le.status, le.tx_hash, le.destination,
    case
      when le.kind in ('payout', 'withdraw') then le.destination
      else cm.payout_address
    end as counterparty,
    le.note, le.created_at
  from public.ledger_entries le
  left join public.circle_members cm
    on cm.circle_id = le.circle_id and cm.user_id = le.user_id
  where le.circle_id = p_circle_id
    and le.kind in ('contribution', 'autosave', 'payout', 'withdraw')
    and le.status <> 'failed'
  order by le.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;
