-- Arc Ajo — user profiles
-- Aligned with the Arc (Circle) ecosystem: members save in Arc stablecoins
-- (USDC / EURC / USYC) and receive payouts to an Arc Testnet wallet.

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,

  -- Arc ecosystem fields
  arc_wallet_address text,                       -- EVM address on Arc Testnet (0x…)
  preferred_stablecoin text not null default 'USDC'
    check (preferred_stablecoin in ('USDC', 'EURC', 'USYC')),

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'Public profile for each Arc Ajo member, 1:1 with auth.users.';
comment on column public.profiles.arc_wallet_address is 'Member wallet on Arc Testnet (chain id 5042002) used for contributions and payouts.';
comment on column public.profiles.preferred_stablecoin is 'Stablecoin the member saves in: USDC, EURC, or USYC.';

-- Row Level Security: a member can only see and edit their own profile.
alter table public.profiles enable row level security;

create policy "Profiles are viewable by the owner"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Members can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Members can update their own profile"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- Keep updated_at fresh.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row when a new auth user signs up (email or Google).
-- Pulls name/avatar from OAuth metadata when present.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
