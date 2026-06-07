-- Arjo — link savings plans to goals so goal progress is REAL funded money.
--
-- Before this, a goal's progress was computed against the user's whole liquid
-- wallet balance, so any goal whose target was below the wallet balance showed
-- 100% / "Reached" the instant it was created — even though nothing had been
-- set aside for it. That made goals feel like passive trackers, not savings.
--
-- This migration ties a goal to the actual SafeLock / target / auto / flex
-- vaults that fund it: a savings_plan can optionally reference one goal, and a
-- goal's funded amount is the sum of principal in its active linked plans —
-- money that is genuinely locked and earning USYC yield. Deleting a goal does
-- NOT touch the money: linked plans simply detach (goal_id -> NULL).
--
-- Idempotent: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS. No RLS
-- change needed — savings_plans is already owner-scoped, and the FK only
-- references the user's own goals.

alter table public.savings_plans
  add column if not exists goal_id uuid
    references public.savings_goals (id) on delete set null;

comment on column public.savings_plans.goal_id is
  'Optional goal this plan funds. A goal''s progress is the sum of principal across its active linked plans (real, yield-earning money set aside).';

create index if not exists savings_plans_goal_idx
  on public.savings_plans (goal_id)
  where goal_id is not null;
