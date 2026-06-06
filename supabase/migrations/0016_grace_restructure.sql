-- Arjo — Grace-expiry detection + restructure vote (Phase 4b)
-- Builds on the creator-driven defaulter flow (0015) by turning an EXPIRED grace
-- period into a collective decision instead of leaving it solely to the creator:
--
--   grace (window passed) ──sweep──▶ RESTRUCTURE proposal ──vote 70% YES──▶
--     drop the defaulter from the payout rotation + re-sequence remaining payouts
--
-- "Automation" without a cron / service-role: the creator's circle view calls
-- sweep_grace_expiries() (idempotent), which opens at most one OPEN restructure
-- proposal per overdue member and notifies everyone. The financial side (slashing
-- or returning the bond) stays the creator's separate 0015 action — RESTRUCTURE
-- only re-sequences the rotation, never deletes the membership or marks the member
-- 'defaulted', so the two compose cleanly.
--
-- Idempotent: CREATE OR REPLACE functions; the type-constraint swap is guarded.

-- 1. Allow the RESTRUCTURE proposal type -------------------------------------
-- 0007 created the type CHECK inline (auto-named proposals_type_check). Drop and
-- re-add it with the new system-generated RESTRUCTURE kind.
alter table public.proposals
  drop constraint if exists proposals_type_check;

alter table public.proposals
  add constraint proposals_type_check check (
    type in (
      'PAYOUT_ORDER_CHANGE',
      'MEMBER_EXIT_REQUEST',
      'MEMBER_REMOVAL',
      'RULE_CHANGE',
      'RESTRUCTURE'
    )
  );

-- 2. Re-define execute_proposal with a RESTRUCTURE branch ---------------------
-- Identical to 0007 for the existing types; adds RESTRUCTURE, which drops the
-- target out of the rotation (payout_position = null) and applies the approved
-- re-sequenced order over whoever remains. Membership + bond are left untouched.
create or replace function public.execute_proposal(p_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v public.proposals;
  elem jsonb;
  idx integer := 0;
begin
  select * into v from public.proposals where id = p_id;
  if v.id is null or v.status <> 'APPROVED' then
    return;
  end if;

  if v.type = 'PAYOUT_ORDER_CHANGE' then
    if jsonb_typeof(v.payload -> 'order') = 'array' then
      for elem in select * from jsonb_array_elements(v.payload -> 'order') loop
        idx := idx + 1;
        update public.circle_members
          set payout_position = idx
          where circle_id = v.circle_id
            and user_id = (elem #>> '{}')::uuid;
      end loop;
    end if;

  elsif v.type in ('MEMBER_EXIT_REQUEST', 'MEMBER_REMOVAL') then
    if v.target_user_id is not null then
      delete from public.circle_members
        where circle_id = v.circle_id
          and user_id = v.target_user_id
          and role <> 'creator';
    end if;

  elsif v.type = 'RESTRUCTURE' then
    -- Drop the defaulter from the rotation but KEEP their membership, so the
    -- creator can still slash or return their bond via the 0015 resolution flow.
    if v.target_user_id is not null then
      update public.circle_members
        set payout_position = null
        where circle_id = v.circle_id
          and user_id = v.target_user_id
          and role <> 'creator';
    end if;
    -- Re-sequence the remaining members per the approved order.
    if jsonb_typeof(v.payload -> 'order') = 'array' then
      idx := 0;
      for elem in select * from jsonb_array_elements(v.payload -> 'order') loop
        idx := idx + 1;
        update public.circle_members
          set payout_position = idx
          where circle_id = v.circle_id
            and user_id = (elem #>> '{}')::uuid;
      end loop;
    end if;

  end if;
  -- RULE_CHANGE records a decision but has no automatic DB effect.

  update public.proposals
    set status = 'EXECUTED', updated_at = now()
    where id = p_id;
end;
$$;

-- 3. Sweep expired grace periods → open restructure proposals -----------------
-- Creator-only. For every non-creator member whose grace window has passed and
-- who has no OPEN restructure proposal yet, open one (with a re-sequenced order
-- that drops them) and notify the whole circle. Returns how many were opened.
-- Safe to call on every circle view: already-handled members are skipped.
create or replace function public.sweep_grace_expiries(p_circle_id uuid)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  v_circle  public.circles;
  v_overdue public.circle_members;
  v_member  record;
  v_order   jsonb;
  v_opened  integer := 0;
begin
  if not public.is_circle_creator(p_circle_id) then
    raise exception 'Only the circle creator can sweep grace periods';
  end if;

  select * into v_circle from public.circles where id = p_circle_id;
  if v_circle.id is null then
    raise exception 'Circle not found';
  end if;

  for v_overdue in
    select * from public.circle_members
    where circle_id = p_circle_id
      and role <> 'creator'
      and default_status = 'grace'
      and grace_period_ends is not null
      and grace_period_ends < now()
  loop
    -- Skip if a restructure vote for this member is already open.
    if exists (
      select 1 from public.proposals
      where circle_id = p_circle_id
        and type = 'RESTRUCTURE'
        and target_user_id = v_overdue.user_id
        and status = 'OPEN'
    ) then
      continue;
    end if;

    -- Proposed order = everyone except the defaulter, in current rotation order.
    select jsonb_agg(user_id order by payout_position nulls last, joined_at)
      into v_order
      from public.circle_members
      where circle_id = p_circle_id
        and user_id <> v_overdue.user_id;

    insert into public.proposals (
      circle_id, created_by, type, title, description, payload,
      target_user_id, threshold_pct
    )
    values (
      p_circle_id,
      auth.uid(),
      'RESTRUCTURE',
      'Restructure after a missed contribution',
      format(
        'A member''s grace period ended on %s without catching up. Approving this drops them from the payout rotation and re-sequences the remaining payouts. The creator decides their bond separately.',
        to_char(v_overdue.grace_period_ends, 'Mon DD')
      ),
      jsonb_build_object('order', coalesce(v_order, '[]'::jsonb)),
      v_overdue.user_id,
      70
    );

    v_opened := v_opened + 1;

    -- Notify the circle: the defaulter gets a warning, everyone else a vote prompt.
    for v_member in
      select user_id from public.circle_members where circle_id = p_circle_id
    loop
      if v_member.user_id = v_overdue.user_id then
        insert into public.notifications (user_id, circle_id, type, message)
        values (
          v_member.user_id, p_circle_id, 'default_warning',
          format(
            'Your grace period in "%s" has ended. The circle is voting on how to restructure.',
            coalesce(v_circle.name, 'your circle')
          )
        );
      else
        insert into public.notifications (user_id, circle_id, type, message)
        values (
          v_member.user_id, p_circle_id, 'restructure_vote',
          format(
            'A member missed their contribution to "%s" past the grace period. Vote on how the circle should restructure.',
            coalesce(v_circle.name, 'your circle')
          )
        );
      end if;
    end loop;
  end loop;

  return v_opened;
end;
$$;
