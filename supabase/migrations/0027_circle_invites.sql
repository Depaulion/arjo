-- Arjo — private circle invites
--
-- Private circles (is_public = false) are invisible to non-members by RLS, so
-- today they're un-joinable: the creator is stuck as the only member. This adds
-- a shareable invite code so a creator can invite people to a private circle.
--
-- The code grants visibility to ONE circle, not a bypass of the rules: an
-- invitee who opens the link can see that circle's join terms and join it, but
-- still passes the existing risk gate / bond / member-cap in the join route.
-- circle_by_invite is SECURITY DEFINER so an invitee (a non-member who can't
-- read the row via RLS) can resolve it by code without us loosening any policy.

-- 1. Invite code column -------------------------------------------------------
alter table public.circles
  add column if not exists invite_code text;

comment on column public.circles.invite_code is
  'Shareable invite token for a (typically private) circle. Null = no active invite. Rotating/revoking it invalidates old links.';

-- One code maps to at most one circle.
create unique index if not exists circles_invite_code_key
  on public.circles (invite_code)
  where invite_code is not null;

-- 2. Creator: create / rotate the invite code --------------------------------
-- Returns the current code, creating one if none exists; pass p_regenerate=true
-- to mint a fresh code (which kills any previously shared links). Creator-gated.
create or replace function public.set_circle_invite(
  p_circle_id uuid,
  p_regenerate boolean default false
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_creator boolean;
  v_code text;
begin
  select (created_by = auth.uid()), invite_code
    into v_is_creator, v_code
    from public.circles where id = p_circle_id;

  if not coalesce(v_is_creator, false) then
    raise exception 'Only the circle creator can manage invites.'
      using errcode = '42501';
  end if;

  if p_regenerate or v_code is null then
    v_code := substr(
      md5(random()::text || clock_timestamp()::text || p_circle_id::text), 1, 16
    );
    update public.circles set invite_code = v_code where id = p_circle_id;
  end if;

  return v_code;
end;
$$;

-- 3. Creator: revoke the invite (kills all shared links) ----------------------
create or replace function public.revoke_circle_invite(p_circle_id uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_is_creator boolean;
begin
  select (created_by = auth.uid()) into v_is_creator
    from public.circles where id = p_circle_id;

  if not coalesce(v_is_creator, false) then
    raise exception 'Only the circle creator can manage invites.'
      using errcode = '42501';
  end if;

  update public.circles set invite_code = null where id = p_circle_id;
  return true;
end;
$$;

-- 4. Invitee: resolve a circle by its invite code -----------------------------
-- Returns just the join-relevant fields so an invitee can review terms and join,
-- even for a private circle they can't otherwise read. Empty for a bad/short
-- code. Does NOT expose the invite_code itself or any member data.
create or replace function public.circle_by_invite(p_code text)
returns table (
  id uuid,
  name text,
  description text,
  currency text,
  contribution_amount numeric,
  frequency text,
  member_count integer,
  required_bond numeric,
  status text,
  is_public boolean
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if p_code is null or char_length(p_code) < 8 then
    return;
  end if;

  return query
  select
    c.id, c.name, c.description, c.currency::text, c.contribution_amount,
    c.frequency::text, c.member_count, c.required_bond, c.status, c.is_public
  from public.circles c
  where c.invite_code = p_code
  limit 1;
end;
$$;
