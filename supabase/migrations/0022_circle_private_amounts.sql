-- Arjo — Circle "private amounts" (privacy with governed visibility)
--
-- Aligns with Arc's privacy roadmap ("sensitive activity protected from public
-- exposure, while authorized parties retain defined access") at the data layer
-- we control TODAY — no onchain confidential-transfer cryptography is claimed.
--
-- THE MODEL
-- ---------
-- Circle funds already pool into one shared vault, so per-member contribution
-- detail is never legible from a single onchain address — it lives in the
-- ledger under RLS. This migration adds a per-circle switch that extends that
-- protection to OTHER MEMBERS' views inside the app:
--
--   private_amounts = false  → everyone who can view the circle sees every
--                              member's individual contribution figures (today's
--                              behaviour; unchanged).
--   private_amounts = true   → individual figures are visible only to the member
--                              themselves (self) and the circle creator (the
--                              authorized party). Everyone else sees WHO is
--                              participating, but their amounts are masked.
--
-- The CIRCLE-LEVEL pot total / contribution count stay visible to all viewers in
-- both modes — that shared number is the point of a group pot ("governed
-- visibility"). Only the per-member breakdown is gated.
--
-- Idempotent: the add is `if not exists`; the functions are `create or replace`.

-- 1. Per-circle privacy flag --------------------------------------------------
alter table public.circles
  add column if not exists private_amounts boolean not null default false;

comment on column public.circles.private_amounts is
  'When true, individual member contribution figures are visible only to the member and the creator; the circle pot total stays visible to all viewers. Privacy with governed visibility.';

-- 2. Per-contributor breakdown — mask other members'' figures when private ----
-- Self and creator always see real numbers. For everyone else, when private,
-- the amount/count/last_at/address are returned NULL so the UI can render a
-- masked placeholder while still listing the member (participation is not a
-- secret — the amounts are).
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
declare
  v_private boolean;
  v_creator boolean;
begin
  if not public.can_view_circle(p_circle_id) then
    return;
  end if;

  select c.private_amounts, (c.created_by = auth.uid())
    into v_private, v_creator
    from public.circles c
    where c.id = p_circle_id;

  return query
  select
    le.user_id,
    p.full_name as display_name,
    case when v_private and not coalesce(v_creator, false) and le.user_id <> auth.uid()
         then null else cm.payout_address end as address,
    case when v_private and not coalesce(v_creator, false) and le.user_id <> auth.uid()
         then null else coalesce(sum(le.amount), 0) end as total,
    case when v_private and not coalesce(v_creator, false) and le.user_id <> auth.uid()
         then null else count(*)::int end as count,
    case when v_private and not coalesce(v_creator, false) and le.user_id <> auth.uid()
         then null else max(le.created_at) end as last_at
  from public.ledger_entries le
  left join public.profiles p on p.id = le.user_id
  left join public.circle_members cm
    on cm.circle_id = le.circle_id and cm.user_id = le.user_id
  where le.circle_id = p_circle_id
    and le.kind in ('contribution', 'autosave')
    and le.status <> 'failed'
  group by le.user_id, p.full_name, cm.payout_address
  order by total desc nulls last;
end;
$$;

-- 3. Activity feed — hide other members'' individual rows when private --------
-- Circle-level outflows (payout / exit refund) stay visible to everyone (who got
-- paid in the rotation is shared governance info). Individual inflows are shown
-- only to the contributor themselves and the creator when private.
create or replace function public.circle_ledger_feed(p_circle_id uuid, p_limit integer default 25)
returns table (
  id uuid,
  kind text,
  amount numeric,
  status text,
  tx_hash text,
  destination text,
  counterparty text,
  note text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_private boolean;
  v_creator boolean;
begin
  if not public.can_view_circle(p_circle_id) then
    return;
  end if;

  select c.private_amounts, (c.created_by = auth.uid())
    into v_private, v_creator
    from public.circles c
    where c.id = p_circle_id;

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
    and (
      not v_private
      or coalesce(v_creator, false)
      or le.user_id = auth.uid()
      or le.kind in ('payout', 'withdraw')
    )
  order by le.created_at desc
  limit greatest(1, least(p_limit, 100));
end;
$$;

-- 4. Creator-only toggle ------------------------------------------------------
-- Flip a circle's privacy mode. SECURITY DEFINER + an explicit creator check so
-- only the circle owner can change it, without loosening RLS on circles.
create or replace function public.set_circle_privacy(p_circle_id uuid, p_private boolean)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_creator boolean;
begin
  select (created_by = auth.uid()) into v_is_creator
    from public.circles where id = p_circle_id;

  if not coalesce(v_is_creator, false) then
    raise exception 'Only the circle creator can change privacy.'
      using errcode = '42501';
  end if;

  update public.circles
    set private_amounts = p_private
    where id = p_circle_id;

  return p_private;
end;
$$;
