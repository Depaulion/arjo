-- Arjo — circle membership, savings goals, and public discovery
-- Turns the app from a single-creator profile tool into a social savings
-- platform: members can join circles others created, the marketplace can list
-- public circles, and each member can track personal savings goals.

-- 1. Public discovery + a short pitch for the marketplace --------------------
alter table public.circles
  add column if not exists is_public boolean not null default false,
  add column if not exists description text;

comment on column public.circles.is_public is 'When true, the circle is listed in the community marketplace and joinable by anyone.';
comment on column public.circles.description is 'Short pitch shown in the marketplace.';

-- 2. Membership: who has joined which circle ---------------------------------
create table if not exists public.circle_members (
  circle_id uuid not null references public.circles (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('creator', 'member')),
  payout_position integer,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);

comment on table public.circle_members is 'Membership of savings circles (many-to-many between users and circles).';
comment on column public.circle_members.payout_position is 'Optional 1-based slot in the rotation that receives the pooled payout.';

create index if not exists circle_members_user_idx on public.circle_members (user_id);
create index if not exists circle_members_circle_idx on public.circle_members (circle_id);

alter table public.circle_members enable row level security;

-- A user can see their own memberships. (Kept to own-rows-only on purpose: a
-- policy that self-references circle_members triggers Postgres RLS infinite
-- recursion. Per-circle member counts come from circles.member_count.)
create policy "Members can view their own memberships"
  on public.circle_members for select
  using (user_id = auth.uid());

-- A user can only join (insert a row) as themselves.
create policy "Members can join as themselves"
  on public.circle_members for insert
  with check (user_id = auth.uid());

-- A user can leave (delete only their own membership).
create policy "Members can leave their circles"
  on public.circle_members for delete
  using (user_id = auth.uid());

-- 3. Public + member visibility for circles ----------------------------------
-- Existing policy only let creators see their circles. Add discovery: anyone
-- authenticated can read a public circle, and members can read circles they
-- have joined.
create policy "Public circles are discoverable"
  on public.circles for select
  using (is_public = true);

create policy "Members can view circles they joined"
  on public.circles for select
  using (
    exists (
      select 1 from public.circle_members m
      where m.circle_id = circles.id
        and m.user_id = auth.uid()
    )
  );

-- 4. Personal savings goals ---------------------------------------------------
create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 80),
  target_amount numeric(20, 2) not null check (target_amount > 0),
  currency text not null default 'USDC'
    check (currency in ('USDC', 'EURC', 'USYC')),
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.savings_goals is 'Personal savings targets a member is working toward, denominated in an Arc stablecoin.';

create index if not exists savings_goals_user_idx on public.savings_goals (user_id);

alter table public.savings_goals enable row level security;

create policy "Goals are viewable by their owner"
  on public.savings_goals for select
  using (user_id = auth.uid());

create policy "Members can create their own goals"
  on public.savings_goals for insert
  with check (user_id = auth.uid());

create policy "Members can update their own goals"
  on public.savings_goals for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Members can delete their own goals"
  on public.savings_goals for delete
  using (user_id = auth.uid());

create trigger savings_goals_set_updated_at
  before update on public.savings_goals
  for each row execute function public.set_updated_at();

-- 5. Auto-enroll a circle's creator as a member ------------------------------
-- Keeps circle_members authoritative: every circle has at least its creator.
create or replace function public.handle_new_circle()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.circle_members (circle_id, user_id, role, payout_position)
  values (new.id, new.created_by, 'creator', 1)
  on conflict (circle_id, user_id) do nothing;
  return new;
end;
$$;

create trigger on_circle_created
  after insert on public.circles
  for each row execute function public.handle_new_circle();
