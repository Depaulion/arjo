-- Arc Ajo — savings circles (groups)
-- A circle is a rotating savings group: members contribute a fixed stablecoin
-- amount each period, and take turns receiving the pooled payout on Arc.

create table if not exists public.circles (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users (id) on delete cascade,

  name text not null check (char_length(name) between 2 and 80),
  contribution_amount numeric(20, 2) not null check (contribution_amount > 0),
  currency text not null default 'USDC'
    check (currency in ('USDC', 'EURC', 'USYC')),
  frequency text not null
    check (frequency in ('weekly', 'biweekly', 'monthly')),
  member_count integer not null check (member_count between 2 and 100),

  status text not null default 'forming'
    check (status in ('forming', 'active', 'completed')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.circles is 'Arc Ajo savings circles (groups). Contributions are denominated in an Arc stablecoin.';
comment on column public.circles.contribution_amount is 'Fixed amount each member contributes per period.';
comment on column public.circles.currency is 'Arc stablecoin used for the circle: USDC, EURC, or USYC.';
comment on column public.circles.member_count is 'Planned number of members (one payout round each).';

create index if not exists circles_created_by_idx on public.circles (created_by);

-- Row Level Security: a member can manage circles they created.
alter table public.circles enable row level security;

create policy "Circles are viewable by their creator"
  on public.circles for select
  using (auth.uid() = created_by);

create policy "Members can create circles"
  on public.circles for insert
  with check (auth.uid() = created_by);

create policy "Creators can update their circles"
  on public.circles for update
  using (auth.uid() = created_by)
  with check (auth.uid() = created_by);

create policy "Creators can delete their circles"
  on public.circles for delete
  using (auth.uid() = created_by);

-- Reuse the shared updated_at trigger function from migration 0001.
create trigger circles_set_updated_at
  before update on public.circles
  for each row execute function public.set_updated_at();
