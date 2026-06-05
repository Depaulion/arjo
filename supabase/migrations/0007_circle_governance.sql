-- Arjo — Circle Governance System
-- Lets a circle's members collectively decide things instead of leaving every
-- call to the creator. Members raise proposals, everyone votes YES/NO, and when
-- YES reaches the approval threshold (default 70% of all members) the proposal
-- is auto-approved and, where it has a concrete effect, auto-executed.
--
-- This is a FEATURE EXTENSION: it only adds new tables/columns/policies and a
-- few SECURITY DEFINER helpers. It does not touch auth, wallets, or existing
-- circle/membership behaviour.
--
-- Proposal types:
--   PAYOUT_ORDER_CHANGE  — reorder who gets paid when (payload.order = user ids)
--   MEMBER_EXIT_REQUEST  — a member asks the circle's leave to be approved
--   MEMBER_REMOVAL       — the circle votes a member out
--   RULE_CHANGE          — a recorded collective decision (no automatic effect)

-- 1. Per-circle reputation -----------------------------------------------------
-- Lightweight reputation that lives on the membership row (per user, per circle).
-- Contributing nudges it up; missing a contribution nudges it down.
alter table public.circle_members
  add column if not exists reputation integer not null default 100;

comment on column public.circle_members.reputation is 'Per-circle reputation score. Starts at 100; +5 per contribution, -10 per miss. Clamped to [0, 1000].';

-- 2. Proposals -----------------------------------------------------------------
create table if not exists public.proposals (
  id uuid primary key default gen_random_uuid(),
  circle_id uuid not null references public.circles (id) on delete cascade,
  created_by uuid not null references auth.users (id) on delete cascade,
  type text not null check (
    type in (
      'PAYOUT_ORDER_CHANGE',
      'MEMBER_EXIT_REQUEST',
      'MEMBER_REMOVAL',
      'RULE_CHANGE'
    )
  ),
  title text not null check (char_length(title) between 2 and 140),
  description text,
  -- Structured data used when an approved proposal is executed. For
  -- PAYOUT_ORDER_CHANGE: { "order": [user_id, user_id, ...] }.
  payload jsonb not null default '{}'::jsonb,
  -- The member a MEMBER_EXIT_REQUEST / MEMBER_REMOVAL targets.
  target_user_id uuid references auth.users (id) on delete cascade,
  status text not null default 'OPEN' check (
    status in ('OPEN', 'APPROVED', 'REJECTED', 'EXECUTED', 'CANCELLED')
  ),
  -- Percent of all members that must vote YES to approve.
  threshold_pct integer not null default 70 check (threshold_pct between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.proposals is 'Governance proposals raised inside a savings circle and decided by member vote.';

create index if not exists proposals_circle_idx on public.proposals (circle_id);
create index if not exists proposals_status_idx on public.proposals (circle_id, status);

alter table public.proposals enable row level security;

create trigger proposals_set_updated_at
  before update on public.proposals
  for each row execute function public.set_updated_at();

-- 3. Votes ---------------------------------------------------------------------
create table if not exists public.proposal_votes (
  proposal_id uuid not null references public.proposals (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  choice text not null check (choice in ('YES', 'NO')),
  created_at timestamptz not null default now(),
  primary key (proposal_id, user_id)
);

comment on table public.proposal_votes is 'One YES/NO vote per member per proposal.';

create index if not exists proposal_votes_proposal_idx on public.proposal_votes (proposal_id);

alter table public.proposal_votes enable row level security;

-- 4. SECURITY DEFINER membership helper ---------------------------------------
-- Mirrors is_circle_creator (0006). Querying circle_members from inside a
-- definer function owned by a BYPASSRLS role avoids the circle_members <->
-- circles RLS recursion trap, so member-scoped policies are safe to write.
create or replace function public.is_circle_member(p_circle_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.circle_members m
    where m.circle_id = p_circle_id and m.user_id = auth.uid()
  );
$$;

-- Can the current user still vote on this proposal? (member + proposal OPEN)
create or replace function public.can_vote_on_proposal(p_proposal_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.proposals pr
    join public.circle_members m on m.circle_id = pr.circle_id
    where pr.id = p_proposal_id
      and pr.status = 'OPEN'
      and m.user_id = auth.uid()
  );
$$;

-- Can the current user see this proposal (and thus its votes)?
create or replace function public.is_proposal_member(p_proposal_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1
    from public.proposals pr
    join public.circle_members m on m.circle_id = pr.circle_id
    where pr.id = p_proposal_id
      and m.user_id = auth.uid()
  );
$$;

-- 5. Let members see their co-members -----------------------------------------
-- Governance needs the full member list (to build a payout order, pick who to
-- remove, etc.). The base 0004 policy only exposed a member's own row. This adds
-- co-member visibility via the definer helper (no recursion). Wallet addresses
-- are already public on-chain; no names/emails are exposed here.
drop policy if exists "Members can view co-members" on public.circle_members;
create policy "Members can view co-members"
  on public.circle_members for select
  using (public.is_circle_member(circle_id));

-- 6. Proposal RLS --------------------------------------------------------------
drop policy if exists "Members can view circle proposals" on public.proposals;
create policy "Members can view circle proposals"
  on public.proposals for select
  using (public.is_circle_member(circle_id));

drop policy if exists "Members can raise proposals" on public.proposals;
create policy "Members can raise proposals"
  on public.proposals for insert
  with check (created_by = auth.uid() and public.is_circle_member(circle_id));

-- Members can cancel their own proposal; the circle creator can cancel any.
-- (Approval/rejection/execution are done by the SECURITY DEFINER tally trigger,
-- which bypasses RLS, so no broad status-update policy is needed here.)
drop policy if exists "Proposers and creators can update proposals" on public.proposals;
create policy "Proposers and creators can update proposals"
  on public.proposals for update
  using (created_by = auth.uid() or public.is_circle_creator(circle_id))
  with check (created_by = auth.uid() or public.is_circle_creator(circle_id));

-- 7. Vote RLS ------------------------------------------------------------------
drop policy if exists "Members can view proposal votes" on public.proposal_votes;
create policy "Members can view proposal votes"
  on public.proposal_votes for select
  using (public.is_proposal_member(proposal_id));

drop policy if exists "Members can cast their vote" on public.proposal_votes;
create policy "Members can cast their vote"
  on public.proposal_votes for insert
  with check (user_id = auth.uid() and public.can_vote_on_proposal(proposal_id));

drop policy if exists "Members can change their vote" on public.proposal_votes;
create policy "Members can change their vote"
  on public.proposal_votes for update
  using (user_id = auth.uid() and public.can_vote_on_proposal(proposal_id))
  with check (user_id = auth.uid() and public.can_vote_on_proposal(proposal_id));

drop policy if exists "Members can retract their vote" on public.proposal_votes;
create policy "Members can retract their vote"
  on public.proposal_votes for delete
  using (user_id = auth.uid());

-- 8. Execute an approved proposal ---------------------------------------------
-- Runs as definer so it can reorder positions / remove a membership regardless
-- of the caller's RLS view. The creator is never removable by vote.
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

  end if;
  -- RULE_CHANGE records a decision but has no automatic DB effect.

  update public.proposals
    set status = 'EXECUTED', updated_at = now()
    where id = p_id;
end;
$$;

-- 9. Tally votes after each change, auto-approve / reject / execute ------------
create or replace function public.tally_proposal_votes()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_pid uuid;
  v public.proposals;
  v_members integer;
  v_yes integer;
  v_no integer;
begin
  v_pid := coalesce(new.proposal_id, old.proposal_id);
  select * into v from public.proposals where id = v_pid;
  if v.id is null or v.status <> 'OPEN' then
    return coalesce(new, old);
  end if;

  select count(*) into v_members
    from public.circle_members where circle_id = v.circle_id;

  select
    count(*) filter (where choice = 'YES'),
    count(*) filter (where choice = 'NO')
  into v_yes, v_no
  from public.proposal_votes where proposal_id = v_pid;

  if v_members > 0 then
    -- Approve once YES reaches the threshold share of ALL members.
    if (v_yes::numeric / v_members) * 100 >= v.threshold_pct then
      update public.proposals
        set status = 'APPROVED', resolved_at = now(), updated_at = now()
        where id = v_pid;
      perform public.execute_proposal(v_pid);
    -- Reject once enough NO votes make the YES threshold unreachable.
    elsif (v_no::numeric / v_members) * 100 > (100 - v.threshold_pct) then
      update public.proposals
        set status = 'REJECTED', resolved_at = now(), updated_at = now()
        where id = v_pid;
    end if;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists on_proposal_vote_changed on public.proposal_votes;
create trigger on_proposal_vote_changed
  after insert or update or delete on public.proposal_votes
  for each row execute function public.tally_proposal_votes();

-- 10. Reputation nudge (callable from the app) --------------------------------
-- Adjusts the caller's own reputation in a circle. Used by the contribute route
-- (+5). A miss can call it with -10 wherever penalties are recorded.
create or replace function public.bump_my_reputation(p_circle_id uuid, p_delta integer)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  update public.circle_members
    set reputation = greatest(0, least(1000, reputation + p_delta))
    where circle_id = p_circle_id and user_id = auth.uid();
end;
$$;
