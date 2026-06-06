-- Arjo — support admin access
-- Lets designated admins read and triage every support ticket. Admin status is
-- a flag on profiles (flip it manually in SQL for trusted accounts), checked via
-- a SECURITY DEFINER helper so RLS policies can call it without recursion.

-- 1. Admin flag ---------------------------------------------------------------
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is 'When true, the account can read and triage all support tickets. Set manually for trusted staff.';

-- 2. Admin check (SECURITY DEFINER bypasses RLS, so no profiles recursion) -----
create or replace function public.is_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_admin = true
  );
$$;

-- 3. Admins can read & triage all tickets ------------------------------------
create policy "Admins can view all tickets"
  on public.support_tickets for select
  using (public.is_admin());

create policy "Admins can update tickets"
  on public.support_tickets for update
  using (public.is_admin())
  with check (public.is_admin());

-- 4. Admins can read all profiles (to attribute tickets to members) -----------
create policy "Admins can view all profiles"
  on public.profiles for select
  using (public.is_admin());
