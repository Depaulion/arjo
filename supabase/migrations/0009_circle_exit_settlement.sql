-- Arjo — Circle Exit Settlement
-- Closes the gap left by 0007: when a MEMBER_EXIT_REQUEST or MEMBER_REMOVAL is
-- approved, the member's net contributions should be returned to them onchain
-- before they leave. The original execute_proposal deleted the membership row
-- outright and refunded nothing.
--
-- A database trigger can't move USDC, so we split the exit into two steps:
--   1. Approval (the vote trigger) now only FLAGS the member `pending_exit` and
--      leaves the proposal APPROVED — the membership row stays put.
--   2. The circle creator settles the refund via /api/circles/[id]/settle-exit,
--      which sends the refund from the pot wallet and then calls
--      finalize_member_exit to remove the membership and mark it EXECUTED.
--
-- This is an additive extension: one new column plus reworked/added SECURITY
-- DEFINER helpers. Existing wallet, ledger, and circle behaviour is untouched.

-- 1. Track members awaiting exit settlement ------------------------------------
alter table public.circle_members
  add column if not exists pending_exit boolean not null default false;

comment on column public.circle_members.pending_exit is
  'True when an approved exit/removal proposal is awaiting onchain refund of the member''s net contributions, before the membership is removed.';

-- 2. Rework execute_proposal: defer exit/removal to settlement -----------------
-- PAYOUT_ORDER_CHANGE and RULE_CHANGE still execute immediately. Exit/removal
-- now only marks the member pending_exit and keeps the proposal APPROVED, so the
-- creator can refund the net contributions before the member is removed.
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
    update public.proposals
      set status = 'EXECUTED', updated_at = now()
      where id = p_id;

  elsif v.type in ('MEMBER_EXIT_REQUEST', 'MEMBER_REMOVAL') then
    -- Flag for settlement; do NOT remove the member yet. The proposal stays
    -- APPROVED until the refund is settled onchain (finalize_member_exit).
    if v.target_user_id is not null then
      update public.circle_members
        set pending_exit = true
        where circle_id = v.circle_id
          and user_id = v.target_user_id
          and role <> 'creator';
    end if;
    -- status intentionally left APPROVED

  else
    -- RULE_CHANGE records a decision but has no automatic DB effect.
    update public.proposals
      set status = 'EXECUTED', updated_at = now()
      where id = p_id;
  end if;
end;
$$;

-- 3. Compute the refund owed to an exiting member ------------------------------
-- A member's net contributions to the circle (confirmed + still-pending, never
-- failed), but only if they have NOT already received their rotation payout —
-- a paid-out member has taken the full pot, so there is nothing to return.
-- SECURITY DEFINER so the creator can read another member's ledger rows (which
-- their own RLS session can't see). Guarded to the circle creator only.
create or replace function public.circle_exit_refund(p_circle_id uuid, p_user_id uuid)
returns numeric
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_paid boolean;
  v_sum numeric;
begin
  if not public.is_circle_creator(p_circle_id) then
    return 0;
  end if;

  select paid_out into v_paid
    from public.circle_members
    where circle_id = p_circle_id and user_id = p_user_id;

  -- No membership row, or they already received the pot → nothing to refund.
  if v_paid is null or v_paid then
    return 0;
  end if;

  select coalesce(sum(amount), 0) into v_sum
    from public.ledger_entries
    where circle_id = p_circle_id
      and user_id = p_user_id
      and kind in ('contribution', 'autosave')
      and status <> 'failed';

  return greatest(0, coalesce(v_sum, 0));
end;
$$;

-- 4. Finalize an exit once the refund is settled -------------------------------
-- Removes the membership and marks the proposal EXECUTED. Called by the settle
-- route after the refund send is accepted (or when no refund is owed). Acts
-- only on an APPROVED exit/removal whose target is the membership being removed;
-- the creator is never removable, and only the creator can call this.
create or replace function public.finalize_member_exit(p_proposal_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v public.proposals;
begin
  select * into v from public.proposals where id = p_proposal_id;
  if v.id is null then
    return;
  end if;
  if not public.is_circle_creator(v.circle_id) then
    return;
  end if;
  if v.status <> 'APPROVED'
     or v.type not in ('MEMBER_EXIT_REQUEST', 'MEMBER_REMOVAL')
     or v.target_user_id is null then
    return;
  end if;

  delete from public.circle_members
    where circle_id = v.circle_id
      and user_id = v.target_user_id
      and role <> 'creator';

  update public.proposals
    set status = 'EXECUTED', updated_at = now()
    where id = p_proposal_id;
end;
$$;
