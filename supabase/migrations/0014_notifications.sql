-- Arjo — Persisted notifications (Phase 3)
-- A durable inbox so circle events (defaults, grace periods, slashed bonds,
-- delayed/protected payouts, restructure votes, reinstatement) reach members
-- even when they're offline. The header bell merges these with the existing
-- computed reminders.
--
-- Idempotent where possible; CREATE POLICY has no IF NOT EXISTS so each is
-- dropped first.

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  circle_id uuid references public.circles (id) on delete set null,
  type text not null check (type in (
    'default_warning',
    'grace_period',
    'bond_slashed',
    'payout_delayed',
    'restructure_vote',
    'payout_protected',
    'reinstatement_eligible'
  )),
  message text not null check (char_length(message) between 1 and 1000),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

comment on table public.notifications is 'Durable per-member notification inbox for circle/defaulter events.';

create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id) where read = false;

alter table public.notifications enable row level security;

-- Members read and update (mark read) only their own notifications. There is
-- deliberately NO user INSERT policy: notifications are created only through the
-- SECURITY DEFINER helpers below, so a member cannot fabricate alerts.
drop policy if exists "Notifications are viewable by their owner" on public.notifications;
create policy "Notifications are viewable by their owner"
  on public.notifications for select
  using (user_id = auth.uid());

drop policy if exists "Members can update their own notifications" on public.notifications;
create policy "Members can update their own notifications"
  on public.notifications for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- create_notification: the single sanctioned write path. SECURITY DEFINER so it
-- bypasses the (intentionally insert-less) RLS, but guarded: a caller may notify
-- themselves, or notify a co-member of a circle they both belong to. Phase-4
-- system functions (also SECURITY DEFINER) can insert directly when acting
-- outside a member context.
create or replace function public.create_notification(
  p_user_id uuid,
  p_circle_id uuid,
  p_type text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  if p_user_id <> auth.uid() then
    if p_circle_id is null
       or not exists (
         select 1 from public.circle_members m
         where m.circle_id = p_circle_id and m.user_id = auth.uid()
       )
       or not exists (
         select 1 from public.circle_members t
         where t.circle_id = p_circle_id and t.user_id = p_user_id
       )
    then
      raise exception 'Not authorized to notify this user';
    end if;
  end if;

  insert into public.notifications (user_id, circle_id, type, message)
  values (p_user_id, p_circle_id, p_type, p_message)
  returning id into new_id;

  return new_id;
end;
$$;

-- Mark a member's notifications read (all, or a single id). Owner-scoped.
create or replace function public.mark_notifications_read(p_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
begin
  update public.notifications
  set read = true
  where user_id = auth.uid()
    and read = false
    and (p_id is null or id = p_id);
  get diagnostics affected = row_count;
  return affected;
end;
$$;
