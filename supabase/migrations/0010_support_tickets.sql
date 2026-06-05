-- Arjo — in-app customer support
-- A lightweight ticketing table so signed-in members can reach the team from
-- inside the app. Owner-scoped RLS: a member can open tickets and read/track
-- the status of their own, but never see anyone else's. Replies/status changes
-- are handled out-of-band (dashboard/admin) and are not exposed to other users.

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  subject text not null check (char_length(subject) between 3 and 140),
  category text not null default 'general'
    check (category in ('general', 'payments', 'circles', 'account', 'bug', 'other')),
  message text not null check (char_length(message) between 10 and 4000),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.support_tickets is 'Customer support requests opened by members from inside the app.';
comment on column public.support_tickets.status is 'Lifecycle of the ticket; only the owner can read it, updates happen out-of-band.';

create index if not exists support_tickets_user_idx on public.support_tickets (user_id);

alter table public.support_tickets enable row level security;

-- A member can read only their own tickets (to track status).
create policy "Tickets are viewable by their owner"
  on public.support_tickets for select
  using (user_id = auth.uid());

-- A member can open a ticket only as themselves, and only in the 'open' state.
create policy "Members can open their own tickets"
  on public.support_tickets for insert
  with check (user_id = auth.uid() and status = 'open');

-- Keep updated_at fresh on any change (reuses the shared trigger fn).
create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.set_updated_at();
