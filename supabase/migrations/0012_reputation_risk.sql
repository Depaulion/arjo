-- Arjo — Reputation & AI risk-engine foundation (Phase 1)
-- Adds the behavioral / safety signals that power the rule-based risk engine
-- (lib/risk-engine.ts) and feature gates, plus a persisted reputation event log.
--
-- IMPORTANT — these columns are SYSTEM-MANAGED. They are read by the dashboard
-- and risk engine, but must NEVER be writable by the member whose row they
-- describe (otherwise a defaulter could clear their own flag or lockout). The
-- existing "profiles" UPDATE policy lets a user update their own row, so until
-- the Phase-4 defaulter flow lands as SECURITY DEFINER functions, NOTHING in the
-- app writes these columns from a user-authenticated path. A follow-up migration
-- will tighten column-level update permissions / route all writes through
-- SECURITY DEFINER. Do not write these from client/RLS code.
--
-- Idempotent: every add is `if not exists`, so re-running is safe.

alter table public.profiles
  -- Lifetime count of confirmed defaults (bond slashed). Drives risk + lockout.
  add column if not exists default_count integer not null default 0,
  -- Timestamp of the most recent confirmed default.
  add column if not exists last_default_date timestamptz,
  -- While in the future, the member cannot join or create circles.
  add column if not exists circle_lockout_until timestamptz,
  -- True when flagged by the risk engine / a confirmed default. Surfaced to
  -- circle creators considering an applicant.
  add column if not exists is_flagged boolean not null default false,
  -- Lifecycle of the member's standing in the defaulter flow.
  add column if not exists default_status text not null default 'none'
    check (default_status in ('none', 'grace', 'defaulted', 'reinstating')),
  -- Count of contributions missed (even if later paid within grace).
  add column if not exists missed_payments integer not null default 0,
  -- Withdrawal attempts in the trailing window (a churn/risk signal).
  add column if not exists withdrawal_attempts integer not null default 0,
  -- Circles completed since the last default, toward reinstatement.
  add column if not exists reinstatement_circles_completed integer not null default 0,
  -- Cached rule-based risk tier: 'low' | 'medium' | 'high'.
  add column if not exists ai_risk_score text not null default 'low'
    check (ai_risk_score in ('low', 'medium', 'high')),
  -- Append-only audit of reputation events:
  --   [{ "event": "default", "delta": -20, "date": "...", "circle_id": "..." }]
  add column if not exists reputation_history jsonb not null default '[]'::jsonb;

comment on column public.profiles.default_count is 'SYSTEM-MANAGED. Lifetime confirmed defaults (bond slashed).';
comment on column public.profiles.circle_lockout_until is 'SYSTEM-MANAGED. While future, member is locked out of joining/creating circles.';
comment on column public.profiles.is_flagged is 'SYSTEM-MANAGED. Risk flag surfaced to circle creators.';
comment on column public.profiles.default_status is 'SYSTEM-MANAGED. none | grace | defaulted | reinstating.';
comment on column public.profiles.ai_risk_score is 'SYSTEM-MANAGED. Cached rule-based risk tier: low | medium | high.';
comment on column public.profiles.reputation_history is 'SYSTEM-MANAGED. Append-only log: {event, delta, date, circle_id}.';
