-- Arjo — Defaulter resolution (Phase 4a)
-- Turns the bond primitive (0013) + reputation/risk fields (0012) into a
-- working, creator-driven defaulter lifecycle:
--
--   none ──flag──▶ grace ──clear──▶ none        (member caught up)
--                   │
--                   └────slash────▶ defaulted   (bond forfeited, consequences)
--
-- A database function can't move USDC, so — exactly like circle-exit settlement
-- (0009) — money movement lives in the API route and STATE lives here:
--   • flag_missed_contribution / clear_default        — no money, pure state.
--   • apply_bond_slash  — called AFTER the route forwards the slashed bond to
--                         the pot; commits the slash + reputation consequences.
--   • return_bond       — called AFTER the route refunds the bond from the vault;
--                         marks it returned.
--
-- All four are SECURITY DEFINER + creator-guarded (is_circle_creator), the only
-- way to write another member's rows without a service-role key. They also write
-- the SYSTEM-MANAGED profile risk fields (0012) and insert notifications (0014)
-- directly, bypassing those tables' (insert-less) RLS.
--
-- Idempotent where possible; functions are CREATE OR REPLACE.

-- 0. Lock down the system-managed profile columns -----------------------------
-- 0012 flagged a hole: the "Members can update their own profile" policy lets a
-- user write ANY column on their own row, including default_count / is_flagged /
-- circle_lockout_until / ai_risk_score. We close it with a BEFORE UPDATE trigger
-- that, for ordinary authenticated sessions, forces every system-managed column
-- back to its previous value. SECURITY DEFINER functions run as the table owner
-- (current_user <> 'authenticated'), so they pass through and can write freely.
create or replace function public.guard_profile_system_columns()
returns trigger
language plpgsql
as $$
begin
  -- Only constrain ordinary user sessions; definer functions run as the owner.
  if current_user = 'authenticated' then
    new.default_count                  := old.default_count;
    new.last_default_date              := old.last_default_date;
    new.circle_lockout_until           := old.circle_lockout_until;
    new.is_flagged                     := old.is_flagged;
    new.default_status                 := old.default_status;
    new.missed_payments                := old.missed_payments;
    new.withdrawal_attempts            := old.withdrawal_attempts;
    new.reinstatement_circles_completed := old.reinstatement_circles_completed;
    new.ai_risk_score                  := old.ai_risk_score;
    new.reputation_history             := old.reputation_history;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_system_columns on public.profiles;
create trigger profiles_guard_system_columns
  before update on public.profiles
  for each row execute function public.guard_profile_system_columns();

-- 1. Flag a missed contribution → start / extend the grace period -------------
-- Creator-only. First miss moves the member into 'grace' (and bumps the global
-- profiles.missed_payments signal the risk engine reads); subsequent calls just
-- extend the grace window without double-counting. A defaulted member is frozen.
create or replace function public.flag_missed_contribution(
  p_circle_id uuid,
  p_user_id uuid,
  p_grace_days integer default 7
)
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  v_member public.circle_members;
  v_circle public.circles;
  v_ends timestamptz;
begin
  if not public.is_circle_creator(p_circle_id) then
    raise exception 'Only the circle creator can flag a missed contribution';
  end if;

  select * into v_member
    from public.circle_members
    where circle_id = p_circle_id and user_id = p_user_id;
  if v_member.user_id is null then
    raise exception 'Member not found in this circle';
  end if;
  if v_member.role = 'creator' then
    raise exception 'The circle creator cannot be flagged';
  end if;
  if v_member.default_status = 'defaulted' then
    raise exception 'This member has already defaulted';
  end if;

  select * into v_circle from public.circles where id = p_circle_id;
  v_ends := now() + make_interval(days => greatest(1, p_grace_days));

  -- Only a fresh miss (entering grace from 'none') counts toward the counters.
  if v_member.default_status <> 'grace' then
    update public.circle_members
      set default_status = 'grace',
          grace_period_ends = v_ends,
          missed_contributions = missed_contributions + 1
      where circle_id = p_circle_id and user_id = p_user_id;

    update public.profiles
      set missed_payments = missed_payments + 1
      where id = p_user_id;
  else
    -- Already in grace → just extend the window.
    update public.circle_members
      set grace_period_ends = v_ends
      where circle_id = p_circle_id and user_id = p_user_id;
  end if;

  insert into public.notifications (user_id, circle_id, type, message)
  values (
    p_user_id,
    p_circle_id,
    'grace_period',
    format(
      'You missed a contribution to "%s". Catch up by %s to avoid losing your bond.',
      coalesce(v_circle.name, 'your circle'),
      to_char(v_ends, 'Mon DD')
    )
  );

  return v_ends;
end;
$$;

-- 2. Clear a default → member caught up before the grace window closed --------
-- Creator-only. Returns the member to good standing. History (the bumped
-- missed_contributions / missed_payments) is intentionally left in place.
create or replace function public.clear_default(
  p_circle_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_member public.circle_members;
begin
  if not public.is_circle_creator(p_circle_id) then
    raise exception 'Only the circle creator can clear a default';
  end if;

  select * into v_member
    from public.circle_members
    where circle_id = p_circle_id and user_id = p_user_id;
  if v_member.user_id is null then
    raise exception 'Member not found in this circle';
  end if;
  -- Only a member in grace can be cleared; a defaulted (slashed) member can't.
  if v_member.default_status <> 'grace' then
    return;
  end if;

  update public.circle_members
    set default_status = 'none',
        grace_period_ends = null
    where circle_id = p_circle_id and user_id = p_user_id;

  insert into public.notifications (user_id, circle_id, type, message)
  values (
    p_user_id,
    p_circle_id,
    'payout_protected',
    'Thanks for catching up — your standing and bond are protected.'
  );
end;
$$;

-- 3. Apply a bond slash + reputation consequences -----------------------------
-- Creator-only. Called by the API route AFTER it forwards the slashed bond to
-- the pot. Commits the member-side slash and the cross-circle profile penalties
-- the risk engine reads. Returns the bond amount slashed (0 if nothing to do).
--
-- Consequences (spec Problem 3):
--   • member:   bond_status='slashed', default_status='defaulted'
--   • profile:  default_count+1, last_default_date=now, is_flagged=true,
--               ai_risk_score='high', default_status='defaulted',
--               lockout 30d (first default) / 90d (repeat), +reputation event.
create or replace function public.apply_bond_slash(
  p_circle_id uuid,
  p_user_id uuid
)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_member public.circle_members;
  v_circle public.circles;
  v_bond numeric;
  v_new_count integer;
  v_lock_days integer;
begin
  if not public.is_circle_creator(p_circle_id) then
    raise exception 'Only the circle creator can slash a bond';
  end if;

  select * into v_member
    from public.circle_members
    where circle_id = p_circle_id and user_id = p_user_id;
  if v_member.user_id is null then
    raise exception 'Member not found in this circle';
  end if;
  if v_member.role = 'creator' then
    raise exception 'The circle creator cannot be slashed';
  end if;
  -- Idempotent: already defaulted → nothing more to do.
  if v_member.default_status = 'defaulted' then
    return 0;
  end if;

  select * into v_circle from public.circles where id = p_circle_id;
  v_bond := coalesce(v_member.bond_amount, 0);

  -- Member side: mark the bond slashed and the member defaulted.
  update public.circle_members
    set bond_status = case when v_bond > 0 then 'slashed' else bond_status end,
        default_status = 'defaulted'
    where circle_id = p_circle_id and user_id = p_user_id;

  -- Profile side: cross-circle reputation consequences.
  select default_count + 1 into v_new_count
    from public.profiles where id = p_user_id;
  v_lock_days := case when coalesce(v_new_count, 1) >= 2 then 90 else 30 end;

  update public.profiles
    set default_count = default_count + 1,
        last_default_date = now(),
        is_flagged = true,
        default_status = 'defaulted',
        ai_risk_score = 'high',
        circle_lockout_until = now() + make_interval(days => v_lock_days),
        reputation_history = coalesce(reputation_history, '[]'::jsonb) || jsonb_build_object(
          'event', 'default',
          'delta', -20,
          'date', to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
          'circle_id', p_circle_id
        )
    where id = p_user_id;

  insert into public.notifications (user_id, circle_id, type, message)
  values (
    p_user_id,
    p_circle_id,
    'bond_slashed',
    format(
      'Your %s bond in "%s" was forfeited after a missed contribution. You''re locked out of new circles for %s days.',
      v_bond,
      coalesce(v_circle.name, 'the circle'),
      v_lock_days
    )
  );

  return v_bond;
end;
$$;

-- 4. Return a bond → member completed in good standing ------------------------
-- Creator-only. Called by the API route AFTER it refunds the bond from the
-- vault. Marks the bond returned and clears any (non-defaulted) standing.
-- Returns the amount returned (0 if the bond wasn't held).
create or replace function public.return_bond(
  p_circle_id uuid,
  p_user_id uuid
)
returns numeric
language plpgsql
security definer set search_path = public
as $$
declare
  v_member public.circle_members;
  v_circle public.circles;
  v_bond numeric;
begin
  if not public.is_circle_creator(p_circle_id) then
    raise exception 'Only the circle creator can return a bond';
  end if;

  select * into v_member
    from public.circle_members
    where circle_id = p_circle_id and user_id = p_user_id;
  if v_member.user_id is null then
    raise exception 'Member not found in this circle';
  end if;
  -- Only a held bond can be returned (not one already slashed or returned).
  if v_member.bond_status <> 'held' or coalesce(v_member.bond_amount, 0) <= 0 then
    return 0;
  end if;

  v_bond := v_member.bond_amount;
  select * into v_circle from public.circles where id = p_circle_id;

  update public.circle_members
    set bond_status = 'returned',
        default_status = 'none',
        grace_period_ends = null
    where circle_id = p_circle_id and user_id = p_user_id;

  insert into public.notifications (user_id, circle_id, type, message)
  values (
    p_user_id,
    p_circle_id,
    'payout_protected',
    format(
      'Your %s bond from "%s" has been returned in full. Thanks for finishing strong!',
      v_bond,
      coalesce(v_circle.name, 'your circle')
    )
  );

  return v_bond;
end;
$$;
