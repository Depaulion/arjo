-- Arc Ajo — SafeLock vaults, on-chain ledger, gamification & challenges
-- Phase B: turns the dashboard into a live, motivating savings product.
--   * savings_plans  — PiggyVest/Cowrywise-style flex/locked/target/auto plans
--   * ledger_entries — a record of every USDC movement (on-chain or pending)
--   * challenges     — opt-in savings challenges that drive XP & streaks
--   * profiles.xp/level/streak — lightweight gamification counters
--
-- Idempotent: safe to re-run. Uses `drop policy if exists` before each policy
-- because Postgres CREATE POLICY has no IF NOT EXISTS, and reuses the existing
-- public.set_updated_at() trigger function from earlier migrations.

-- 1. Gamification counters on the profile -------------------------------------
alter table public.profiles
  add column if not exists xp integer not null default 0,
  add column if not exists level integer not null default 1,
  add column if not exists streak_weeks integer not null default 0,
  add column if not exists badges text[] not null default '{}';

comment on column public.profiles.xp is 'Lifetime experience points earned from saving actions.';
comment on column public.profiles.level is 'Derived level (1 + floor(xp / 500)); cached for quick reads.';
comment on column public.profiles.streak_weeks is 'Current consecutive-week contribution streak.';
comment on column public.profiles.badges is 'Unlocked badge ids, e.g. {first_lock, streak_4, planner}.';

-- 2. Savings plans (SafeLock / auto-save / target) ----------------------------
create table if not exists public.savings_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  plan_type text not null check (plan_type in ('flex', 'locked', 'target', 'auto')),
  principal numeric(20, 2) not null default 0 check (principal >= 0),
  currency text not null default 'USDC'
    check (currency in ('USDC', 'EURC', 'USYC')),
  -- Locked plans: funds are committed until this date; early exit incurs a penalty.
  lock_until date,
  -- Auto plans: recurring contribution schedule.
  auto_cadence text check (auto_cadence in ('daily', 'weekly', 'monthly')),
  auto_amount numeric(20, 2) check (auto_amount > 0),
  next_run_at timestamptz,
  -- Target plans: optional goal amount to reach.
  target_amount numeric(20, 2) check (target_amount > 0),
  apy_bonus numeric(5, 2) not null default 0 check (apy_bonus >= 0),
  status text not null default 'active'
    check (status in ('active', 'matured', 'withdrawn', 'cancelled')),
  vault_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.savings_plans is 'PiggyVest/Cowrywise-style personal savings plans: flexible, locked (SafeLock), target, or automated.';
comment on column public.savings_plans.lock_until is 'Locked plans cannot be withdrawn before this date without a penalty.';
comment on column public.savings_plans.apy_bonus is 'Annualised bonus rate (%) credited for committing to a locked/target plan.';
comment on column public.savings_plans.vault_address is 'Arc address of the platform vault holding this plan''s principal.';

create index if not exists savings_plans_user_idx on public.savings_plans (user_id);
create index if not exists savings_plans_due_idx on public.savings_plans (next_run_at)
  where status = 'active' and plan_type = 'auto';

alter table public.savings_plans enable row level security;

drop policy if exists "Plans are viewable by their owner" on public.savings_plans;
create policy "Plans are viewable by their owner"
  on public.savings_plans for select
  using (user_id = auth.uid());

drop policy if exists "Members can create their own plans" on public.savings_plans;
create policy "Members can create their own plans"
  on public.savings_plans for insert
  with check (user_id = auth.uid());

drop policy if exists "Members can update their own plans" on public.savings_plans;
create policy "Members can update their own plans"
  on public.savings_plans for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Members can delete their own plans" on public.savings_plans;
create policy "Members can delete their own plans"
  on public.savings_plans for delete
  using (user_id = auth.uid());

drop trigger if exists savings_plans_set_updated_at on public.savings_plans;
create trigger savings_plans_set_updated_at
  before update on public.savings_plans
  for each row execute function public.set_updated_at();

-- 3. Ledger: a record of every USDC movement ---------------------------------
-- Written before a transfer is attempted (status 'pending'), then promoted to
-- 'confirmed' or 'failed'. The live on-chain balance is always authoritative;
-- this table gives history, attribution, and graceful fallback when the Circle
-- API is unavailable.
create table if not exists public.ledger_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null
    check (kind in ('contribution', 'lock', 'withdraw', 'autosave', 'payout', 'penalty', 'bonus')),
  amount numeric(20, 2) not null check (amount >= 0),
  currency text not null default 'USDC'
    check (currency in ('USDC', 'EURC', 'USYC')),
  circle_id uuid references public.circles (id) on delete set null,
  plan_id uuid references public.savings_plans (id) on delete set null,
  tx_hash text,
  circle_tx_id text,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'failed')),
  destination text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.ledger_entries is 'Append-only record of USDC actions (contributions, locks, withdrawals, auto-saves, payouts). On-chain balance remains authoritative.';
comment on column public.ledger_entries.tx_hash is 'Arc transaction hash once the transfer is broadcast.';
comment on column public.ledger_entries.circle_tx_id is 'Circle Programmable Wallets transaction id used to poll status.';

create index if not exists ledger_entries_user_idx on public.ledger_entries (user_id, created_at desc);
create index if not exists ledger_entries_plan_idx on public.ledger_entries (plan_id);
create index if not exists ledger_entries_circle_idx on public.ledger_entries (circle_id);

alter table public.ledger_entries enable row level security;

drop policy if exists "Ledger is viewable by its owner" on public.ledger_entries;
create policy "Ledger is viewable by its owner"
  on public.ledger_entries for select
  using (user_id = auth.uid());

drop policy if exists "Members can record their own ledger entries" on public.ledger_entries;
create policy "Members can record their own ledger entries"
  on public.ledger_entries for insert
  with check (user_id = auth.uid());

drop policy if exists "Members can update their own ledger entries" on public.ledger_entries;
create policy "Members can update their own ledger entries"
  on public.ledger_entries for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop trigger if exists ledger_entries_set_updated_at on public.ledger_entries;
create trigger ledger_entries_set_updated_at
  before update on public.ledger_entries
  for each row execute function public.set_updated_at();

-- 4. Savings challenges (opt-in, gamified) -----------------------------------
create table if not exists public.challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  target_amount numeric(20, 2) not null check (target_amount > 0),
  currency text not null default 'USDC'
    check (currency in ('USDC', 'EURC', 'USYC')),
  start_date date not null default current_date,
  end_date date not null,
  status text not null default 'active'
    check (status in ('active', 'completed', 'failed', 'abandoned')),
  reward_xp integer not null default 100 check (reward_xp >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.challenges is 'Opt-in savings challenges (e.g. "save 50 USDC in 30 days") that award XP and feed streaks.';

create index if not exists challenges_user_idx on public.challenges (user_id);

alter table public.challenges enable row level security;

drop policy if exists "Challenges are viewable by their owner" on public.challenges;
create policy "Challenges are viewable by their owner"
  on public.challenges for select
  using (user_id = auth.uid());

drop policy if exists "Members can create their own challenges" on public.challenges;
create policy "Members can create their own challenges"
  on public.challenges for insert
  with check (user_id = auth.uid());

drop policy if exists "Members can update their own challenges" on public.challenges;
create policy "Members can update their own challenges"
  on public.challenges for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Members can delete their own challenges" on public.challenges;
create policy "Members can delete their own challenges"
  on public.challenges for delete
  using (user_id = auth.uid());

drop trigger if exists challenges_set_updated_at on public.challenges;
create trigger challenges_set_updated_at
  before update on public.challenges
  for each row execute function public.set_updated_at();
