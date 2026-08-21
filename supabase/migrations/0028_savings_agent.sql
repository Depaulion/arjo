-- Arjo — Savings Agent (agentic auto-sweep to yield)
--
-- An opt-in agent that keeps a user's wallet at a chosen LIQUID FLOOR and
-- automatically sweeps any surplus USDC into a SafeLock so idle money earns
-- Treasury-backed yield. This is the same shape as Circle's Agent Stack: an
-- autonomous executor (our daily cron) acts through the user's Circle wallet,
-- bounded by a SPENDING POLICY the user defines (their floor + lock choice +
-- minimum sweep). Structured so the executor can later be swapped for a Circle
-- Agent Wallet with the same policy — a config change, not a rewrite.
--
-- No service-role key: the cron uses SECURITY DEFINER RPCs gated by the shared
-- cron secret (verify_cron_secret, migration 0021); the user-facing setter gates
-- on auth.uid(). No secret is ever committed.

-- 1. The agent policy (one per user) -----------------------------------------
create table if not exists public.savings_agent (
  user_id uuid primary key references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  -- Keep at least this much USDC liquid in the wallet; only the surplus is swept.
  liquid_floor numeric(20, 2) not null default 0 check (liquid_floor >= 0),
  -- SafeLock duration (days) for swept funds — sets the yield tier.
  lock_days integer not null default 30 check (lock_days between 1 and 3650),
  -- Don't sweep dust: skip when the surplus is below this.
  min_sweep numeric(20, 2) not null default 1 check (min_sweep >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.savings_agent enable row level security;

create policy "Users manage their own savings agent"
  on public.savings_agent for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 2. User-facing setter (auth.uid-scoped) ------------------------------------
create or replace function public.set_savings_agent(
  p_enabled boolean,
  p_liquid_floor numeric,
  p_lock_days integer,
  p_min_sweep numeric
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  insert into public.savings_agent (user_id, enabled, liquid_floor, lock_days, min_sweep, updated_at)
  values (
    auth.uid(),
    coalesce(p_enabled, false),
    greatest(0, coalesce(p_liquid_floor, 0)),
    least(3650, greatest(1, coalesce(p_lock_days, 30))),
    greatest(0, coalesce(p_min_sweep, 1)),
    now()
  )
  on conflict (user_id) do update set
    enabled = excluded.enabled,
    liquid_floor = excluded.liquid_floor,
    lock_days = excluded.lock_days,
    min_sweep = excluded.min_sweep,
    updated_at = now();
end;
$$;

-- 3. New notification type for agent actions ---------------------------------
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
    'auto_debit_failed',
    'round_reminder',
    'agent_sweep'
  ));

-- 4. Users whose agent is enabled (cron-gated) -------------------------------
-- Returns the policy + wallet so the cron can read the onchain balance, compute
-- the surplus above the floor, and sweep it. The cron enforces the floor — this
-- just hands over the enabled policies.
create or replace function public.due_agent_sweeps(p_secret text)
returns table (
  user_id uuid,
  wallet_id text,
  wallet_address text,
  liquid_floor numeric,
  lock_days integer,
  min_sweep numeric,
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
    a.user_id,
    p.circle_wallet_id,
    p.arc_wallet_address,
    a.liquid_floor,
    a.lock_days,
    a.min_sweep,
    p.preferred_stablecoin
  from public.savings_agent a
  join public.profiles p on p.id = a.user_id
  where a.enabled = true
    and p.arc_wallet_address is not null
    and p.circle_wallet_id is not null;
end;
$$;

-- 5. Record an agent sweep as a SafeLock (cron-gated) ------------------------
-- The cron does the onchain send (user wallet -> vault) in Node; this persists
-- the result: a locked savings plan for the swept amount plus its ledger row.
-- Gated by the cron secret so the scheduled job can write a user's rows.
create or replace function public.record_agent_sweep(
  p_secret text,
  p_user_id uuid,
  p_amount numeric,
  p_currency text,
  p_apy numeric,
  p_lock_until timestamptz,
  p_vault_address text,
  p_tx_hash text
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_plan uuid;
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  insert into public.savings_plans
    (user_id, name, plan_type, principal, currency, lock_until, apy_bonus,
     status, vault_address)
  values
    (p_user_id, 'Auto-saved by agent', 'locked', p_amount, p_currency,
     p_lock_until, p_apy, 'active', p_vault_address)
  returning id into v_plan;

  insert into public.ledger_entries
    (user_id, kind, amount, currency, plan_id, destination, note, status, tx_hash)
  values
    (p_user_id, 'lock', p_amount, p_currency, v_plan, p_vault_address,
     'Savings Agent swept surplus into a SafeLock', 'pending', p_tx_hash);

  return v_plan;
end;
$$;
