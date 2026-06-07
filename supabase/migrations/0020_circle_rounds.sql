-- Arjo — Circle rounds with deadlines
-- A ROSCA runs in rounds: each period every member contributes once, then the
-- pooled pot is paid to the round's recipient, and the next round opens. Until
-- now the app had no notion of a "round" — contributions were ad-hoc and missed
-- payments could only be spotted by the creator eyeballing the roster.
--
-- This migration gives circles a real round cycle:
--   * current_round / round_started_at / round_due_at / total_rounds on circles,
--     initialized on insert and advanced when a payout closes a round;
--   * circle_round_contributions: who paid which round (the basis for automatic
--     missed-contribution detection that feeds the existing defaulter flow);
--   * helpers to advance the round and list members who missed the current one.
--
-- Additive and RLS-safe: no service-role key, creator-scoped reads via the
-- existing is_circle_creator() SECURITY DEFINER pattern (migration 0006).

-- 1. Frequency → interval -----------------------------------------------------
create or replace function public.frequency_interval(p_freq text)
returns interval
language sql
immutable
as $$
  select case p_freq
    when 'weekly'   then interval '7 days'
    when 'biweekly' then interval '14 days'
    when 'monthly'  then interval '1 month'
    else interval '1 month'
  end;
$$;

-- 2. Round bookkeeping on circles ---------------------------------------------
alter table public.circles
  add column if not exists current_round integer not null default 1,
  add column if not exists round_started_at timestamptz,
  add column if not exists round_due_at timestamptz,
  add column if not exists total_rounds integer;

comment on column public.circles.current_round is 'Which rotation round is currently open (1-based).';
comment on column public.circles.round_started_at is 'When the current round opened.';
comment on column public.circles.round_due_at is 'When contributions for the current round are due.';
comment on column public.circles.total_rounds is 'Number of rounds = one payout per member (defaults to member_count).';

-- 3. Initialize round fields on insert ----------------------------------------
create or replace function public.handle_new_circle_rounds()
returns trigger
language plpgsql
as $$
begin
  if new.current_round is null then new.current_round := 1; end if;
  if new.total_rounds is null then new.total_rounds := new.member_count; end if;
  if new.round_started_at is null then new.round_started_at := now(); end if;
  if new.round_due_at is null then
    new.round_due_at := now() + public.frequency_interval(new.frequency);
  end if;
  return new;
end;
$$;

drop trigger if exists on_circle_created_rounds on public.circles;
create trigger on_circle_created_rounds
  before insert on public.circles
  for each row execute function public.handle_new_circle_rounds();

-- 4. Backfill existing circles ------------------------------------------------
update public.circles
  set total_rounds = coalesce(total_rounds, member_count),
      round_started_at = coalesce(round_started_at, created_at),
      round_due_at = coalesce(
        round_due_at,
        created_at + public.frequency_interval(frequency)
      )
  where total_rounds is null
     or round_started_at is null
     or round_due_at is null;

-- 5. Per-member, per-round contribution tracking ------------------------------
create table if not exists public.circle_round_contributions (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  round_number integer not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  ledger_id uuid references public.ledger_entries (id) on delete set null,
  amount numeric(20, 2) not null default 0,
  status text not null default 'paid' check (status in ('paid', 'pending')),
  paid_at timestamptz not null default now(),
  unique (circle_id, round_number, user_id)
);

comment on table public.circle_round_contributions is 'Records which member paid which rotation round — the basis for automatic missed-contribution detection.';

create index if not exists crc_circle_round_idx
  on public.circle_round_contributions (circle_id, round_number);

alter table public.circle_round_contributions enable row level security;

-- A member sees their own rows; the circle creator sees all rows for circles
-- they created (is_circle_creator bypasses the RLS recursion trap, 0006).
drop policy if exists "Members see own round contributions" on public.circle_round_contributions;
create policy "Members see own round contributions"
  on public.circle_round_contributions for select
  using (user_id = auth.uid() or public.is_circle_creator(circle_id));

-- A member records their own contribution row (the contribute route runs as the
-- member). user_id must be the caller.
drop policy if exists "Members record own round contributions" on public.circle_round_contributions;
create policy "Members record own round contributions"
  on public.circle_round_contributions for insert
  with check (user_id = auth.uid());

drop policy if exists "Members update own round contributions" on public.circle_round_contributions;
create policy "Members update own round contributions"
  on public.circle_round_contributions for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 6. Advance the round after a payout closes it -------------------------------
-- Creator-only (the payout route is creator-gated). Bumps current_round and
-- recomputes the due date from the circle's frequency. Caps at total_rounds.
create or replace function public.advance_circle_round(p_circle_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  c public.circles;
begin
  if not public.is_circle_creator(p_circle_id) then
    return;
  end if;

  select * into c from public.circles where id = p_circle_id;
  if c.id is null then
    return;
  end if;

  -- Already at/over the last round → nothing to advance.
  if c.current_round >= coalesce(c.total_rounds, c.member_count) then
    return;
  end if;

  update public.circles
    set current_round = c.current_round + 1,
        round_started_at = now(),
        round_due_at = now() + public.frequency_interval(c.frequency),
        updated_at = now()
    where id = p_circle_id;
end;
$$;

-- 7. Who missed the current (or a given) round --------------------------------
-- Returns members with no 'paid' contribution row for the round. Creator-only;
-- the basis for automatic flag-missed/grace decisions (wired in a later stage).
create or replace function public.circle_missed_members(
  p_circle_id uuid,
  p_round integer default null
)
returns table (user_id uuid, payout_address text, missed_round integer)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_round integer;
begin
  if not public.is_circle_creator(p_circle_id) then
    return;
  end if;

  select coalesce(p_round, current_round) into v_round
    from public.circles where id = p_circle_id;

  return query
  select m.user_id, m.payout_address, v_round
  from public.circle_members m
  where m.circle_id = p_circle_id
    and not exists (
      select 1 from public.circle_round_contributions crc
      where crc.circle_id = p_circle_id
        and crc.round_number = v_round
        and crc.user_id = m.user_id
        and crc.status = 'paid'
    );
end;
$$;
