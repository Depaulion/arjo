-- Arjo — Circle auto-debit (Stage 3)
-- Members can opt in to having each round's contribution pulled automatically
-- from their own Circle wallet's USDC balance on the round's due date — no card,
-- no bank, just a top-up model on the funds they already hold. A platform-wide
-- scheduled job (Vercel Cron → /api/cron/circle-rounds) drives it.
--
-- The hard constraint: this project has NO Supabase service-role key, so a cron
-- request (which carries no user cookie, i.e. auth.uid() is null) cannot satisfy
-- the owner-scoped RLS on ledger_entries / notifications / circle_round_*.
-- The pattern here mirrors the rest of the app: narrow SECURITY DEFINER RPCs do
-- the cross-user writes, but — unlike the user-facing RPCs that gate on
-- auth.uid() — these gate on a shared CRON secret so a logged-out/anon caller
-- can't invoke them. The secret lives in a locked-down app_config table (no RLS
-- policies = unreachable from the REST API) and is set MANUALLY (never in git),
-- so the secret value is never committed.

-- 1. Opt-in flag -------------------------------------------------------------
alter table public.circle_members
  add column if not exists auto_debit boolean not null default false;

comment on column public.circle_members.auto_debit is
  'Member opted in to automatic per-round contribution pulls from their Circle wallet.';

-- A member toggles their OWN auto-debit. circle_members has no member-scoped
-- UPDATE policy (only creators can update member rows, migration 0006), so this
-- SECURITY DEFINER helper lets a member flip just their own flag, gated by
-- auth.uid() membership. Returns the new value.
create or replace function public.set_auto_debit(
  p_circle_id uuid,
  p_enabled boolean
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.circle_members m
    where m.circle_id = p_circle_id and m.user_id = auth.uid()
  ) then
    raise exception 'You are not a member of this circle';
  end if;

  update public.circle_members
    set auto_debit = coalesce(p_enabled, false)
    where circle_id = p_circle_id and user_id = auth.uid();

  return coalesce(p_enabled, false);
end;
$$;

-- 2. New notification types for the auto-debit lifecycle ----------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'default_warning',
    'grace_period',
    'bond_slashed',
    'payout_delayed',
    'restructure_vote',
    'payout_protected',
    'reinstatement_eligible',
    'auto_debit_upcoming',
    'auto_debit_paid',
    'auto_debit_failed'
  ));

-- 3. Cron secret store --------------------------------------------------------
-- RLS enabled with NO policies → no anon/authenticated role can read or write
-- it through PostgREST. Only SECURITY DEFINER functions (which bypass RLS) can
-- read it. Seed the secret yourself, once, from the SQL editor:
--   insert into public.app_config(key, value) values ('cron_secret', '<random>')
--   on conflict (key) do update set value = excluded.value, updated_at = now();
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;

-- 4. Secret verification ------------------------------------------------------
-- Returns true only if the passed secret matches the stored one (and is long
-- enough to not be a trivial value). Used by every cron RPC below.
create or replace function public.verify_cron_secret(p_secret text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_config
    where key = 'cron_secret'
      and value = p_secret
      and char_length(coalesce(p_secret, '')) >= 16
  );
$$;

-- 5. Members whose round is DUE and who opted into auto-debit ------------------
-- One row per (circle, member) that should be debited this run: round due now,
-- auto_debit on, not already paid this round, not a defaulted member. Includes
-- the wallet so the cron can attempt the on-chain pull and the balance check.
create or replace function public.due_auto_debits(p_secret text)
returns table (
  circle_id uuid,
  circle_name text,
  round_number integer,
  user_id uuid,
  wallet_id text,
  wallet_address text,
  amount numeric,
  currency text
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    c.id,
    c.name,
    c.current_round,
    m.user_id,
    p.circle_wallet_id,
    p.arc_wallet_address,
    c.contribution_amount,
    c.currency::text
  from public.circles c
  join public.circle_members m
    on m.circle_id = c.id and m.auto_debit = true
  join public.profiles p
    on p.id = m.user_id
  where c.status in ('forming', 'active')
    and c.round_due_at is not null
    and c.round_due_at <= now()
    and coalesce(m.default_status, 'none') <> 'defaulted'
    and not exists (
      select 1 from public.circle_round_contributions crc
      where crc.circle_id = c.id
        and crc.round_number = c.current_round
        and crc.user_id = m.user_id
        and crc.status = 'paid'
    );
end;
$$;

-- 6. Members whose round is APPROACHING (pre-debit heads-up) -------------------
-- Round not yet due but due within p_within, auto_debit on, not paid, and not
-- already warned this round (one heads-up per round: the not-exists check on a
-- prior 'auto_debit_upcoming' notice created since the round opened).
create or replace function public.upcoming_auto_debits(
  p_secret text,
  p_within interval default interval '24 hours'
)
returns table (
  circle_id uuid,
  circle_name text,
  round_number integer,
  user_id uuid,
  amount numeric,
  currency text,
  round_due_at timestamptz
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    c.id,
    c.name,
    c.current_round,
    m.user_id,
    c.contribution_amount,
    c.currency::text,
    c.round_due_at
  from public.circles c
  join public.circle_members m
    on m.circle_id = c.id and m.auto_debit = true
  join public.profiles p
    on p.id = m.user_id
  where c.status in ('forming', 'active')
    and c.round_due_at is not null
    and c.round_due_at > now()
    and c.round_due_at <= now() + p_within
    and coalesce(m.default_status, 'none') <> 'defaulted'
    and not exists (
      select 1 from public.circle_round_contributions crc
      where crc.circle_id = c.id
        and crc.round_number = c.current_round
        and crc.user_id = m.user_id
        and crc.status = 'paid'
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = m.user_id
        and n.circle_id = c.id
        and n.type = 'auto_debit_upcoming'
        and n.created_at >= coalesce(c.round_started_at, c.created_at)
    );
end;
$$;

-- 7. Record a successful auto-debit on behalf of the member -------------------
-- Inserts the contribution ledger row and marks the round paid (idempotent).
-- SECURITY DEFINER so the cron (no user session) can write a member's row;
-- gated by the cron secret. The on-chain send is done by the cron in Node — this
-- only persists the result, exactly like the user-initiated contribute route.
create or replace function public.record_auto_debit(
  p_secret text,
  p_circle_id uuid,
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_round integer,
  p_destination text,
  p_status text,
  p_tx_hash text,
  p_note text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  insert into public.ledger_entries
    (user_id, kind, amount, currency, circle_id, destination, note, status, tx_hash)
  values
    (p_user_id, 'contribution', p_amount, p_currency, p_circle_id,
     p_destination, p_note, coalesce(p_status, 'pending'), p_tx_hash)
  returning id into v_id;

  insert into public.circle_round_contributions
    (circle_id, round_number, user_id, ledger_id, amount, status)
  values (p_circle_id, p_round, p_user_id, v_id, p_amount, 'paid')
  on conflict (circle_id, round_number, user_id) do nothing;

  return v_id;
end;
$$;

-- 8. Notify a user from the cron (no user session) ----------------------------
-- Mirrors create_notification but gated by the cron secret instead of auth.uid()
-- co-membership, so the scheduled job can deliver upcoming/paid/failed alerts.
create or replace function public.notify_from_cron(
  p_secret text,
  p_user_id uuid,
  p_circle_id uuid,
  p_type text,
  p_message text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  insert into public.notifications (user_id, circle_id, type, message)
  values (p_user_id, p_circle_id, p_type, p_message)
  returning id into v_id;

  return v_id;
end;
$$;
