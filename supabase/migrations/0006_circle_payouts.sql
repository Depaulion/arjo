-- Arjo — rotating payout engine (the heart of an Ajo / ROSCA)
-- Each period the pooled pot is paid out to the next member in the rotation.
-- The pot is the circle creator's Arc wallet, so only the creator can trigger a
-- payout. This migration gives the payout route what it needs while respecting
-- the strict, owner-scoped RLS model (no service-role key in this app):
--   1. denormalize each member's payout wallet onto circle_members, so the
--      creator can resolve the recipient without reading others' profiles;
--   2. track per-member payout state (paid_out / paid_at / tx hash);
--   3. let the creator read + update the members of circles they created,
--      without tripping the circle_members <-> circles RLS recursion trap.

-- 1. Payout bookkeeping on each membership row --------------------------------
alter table public.circle_members
  add column if not exists payout_address text,
  add column if not exists paid_out boolean not null default false,
  add column if not exists paid_at timestamptz,
  add column if not exists payout_tx_hash text;

comment on column public.circle_members.payout_address is 'Recipient Arc wallet (denormalized from profiles at join) so the pot owner can pay out without reading other members'' profiles under RLS.';
comment on column public.circle_members.paid_out is 'True once this member has received their rotation payout.';
comment on column public.circle_members.paid_at is 'When this member''s payout was sent.';
comment on column public.circle_members.payout_tx_hash is 'On-chain hash of this member''s payout, once Circle broadcasts it.';

-- 2. Creator-scoped visibility without RLS recursion --------------------------
-- A naive `exists (select 1 from circles ...)` policy on circle_members would
-- re-trigger the circles SELECT policy "Members can view circles they joined",
-- which itself queries circle_members → infinite recursion. A SECURITY DEFINER
-- helper bypasses RLS inside its body, breaking the cycle.
create or replace function public.is_circle_creator(p_circle_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.circles c
    where c.id = p_circle_id and c.created_by = auth.uid()
  );
$$;

drop policy if exists "Creators can view members of their circles" on public.circle_members;
create policy "Creators can view members of their circles"
  on public.circle_members for select
  using (public.is_circle_creator(circle_id));

drop policy if exists "Creators can update members of their circles" on public.circle_members;
create policy "Creators can update members of their circles"
  on public.circle_members for update
  using (public.is_circle_creator(circle_id))
  with check (public.is_circle_creator(circle_id));

-- 3. Auto-fill payout_address + payout_position when a member joins -----------
-- Keeps the client join code unchanged (it inserts only circle_id/user_id/role).
-- Runs as definer so it can read the joining user's profile and the existing
-- positions for the circle regardless of the caller's RLS view.
create or replace function public.handle_new_member()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.payout_address is null then
    select arc_wallet_address into new.payout_address
    from public.profiles where id = new.user_id;
  end if;

  if new.payout_position is null then
    select coalesce(max(payout_position), 0) + 1 into new.payout_position
    from public.circle_members where circle_id = new.circle_id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_circle_member_added on public.circle_members;
create trigger on_circle_member_added
  before insert on public.circle_members
  for each row execute function public.handle_new_member();

-- 4. Backfill existing memberships -------------------------------------------
-- Denormalize wallet addresses.
update public.circle_members m
set payout_address = p.arc_wallet_address
from public.profiles p
where p.id = m.user_id and m.payout_address is null;

-- Assign rotation positions where missing: creator first, then by join time.
with ranked as (
  select circle_id, user_id,
    row_number() over (
      partition by circle_id
      order by case when role = 'creator' then 0 else 1 end, joined_at
    ) as rn
  from public.circle_members
)
update public.circle_members m
set payout_position = ranked.rn
from ranked
where m.circle_id = ranked.circle_id
  and m.user_id = ranked.user_id
  and m.payout_position is null;
