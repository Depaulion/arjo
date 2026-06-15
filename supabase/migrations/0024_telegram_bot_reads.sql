-- Arjo — Telegram bot read RPCs
--
-- Powers the bot's informational commands (/balance, /circles, /discover). The
-- webhook carries no user session, so these map a verified Telegram chat_id to
-- its linked Arjo account and return read-only summaries, gated by the shared
-- Telegram secret in app_config (same one that gates link_telegram_by_code).
-- The bot never MOVES money: saving/joining are surfaced as deep links back into
-- the logged-in app, where the action is confirmed under the user's own session.

-- Shared secret check, reused by every bot RPC below.
create or replace function public.verify_telegram_secret(p_secret text)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.app_config
    where key = 'telegram_webhook_secret'
      and value = p_secret
      and char_length(coalesce(p_secret, '')) >= 16
  );
$$;

-- 1. Account summary for /balance --------------------------------------------
create or replace function public.bot_user_summary(p_secret text, p_chat_id text)
returns table (
  user_id uuid,
  full_name text,
  wallet_address text,
  total_locked numeric,
  active_plans integer,
  active_circles integer
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_user uuid;
begin
  if not public.verify_telegram_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  select id into v_user
    from public.profiles
    where telegram_chat_id = p_chat_id
    limit 1;
  if v_user is null then
    return;
  end if;

  return query
  select
    v_user,
    (select full_name from public.profiles where id = v_user),
    (select arc_wallet_address from public.profiles where id = v_user),
    coalesce((
      select sum(principal) from public.savings_plans
      where user_id = v_user and status = 'active'
    ), 0),
    (select count(*)::int from public.savings_plans
       where user_id = v_user and status = 'active'),
    (select count(*)::int from public.circle_members where user_id = v_user);
end;
$$;

-- 2. The user's circles for /circles -----------------------------------------
create or replace function public.bot_my_circles(p_secret text, p_chat_id text)
returns table (
  circle_id uuid,
  name text,
  status text,
  current_round integer,
  total_rounds integer,
  round_due_at timestamptz,
  contribution_amount numeric,
  currency text
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_user uuid;
begin
  if not public.verify_telegram_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  select id into v_user
    from public.profiles where telegram_chat_id = p_chat_id limit 1;
  if v_user is null then
    return;
  end if;

  return query
  select
    c.id, c.name, c.status, c.current_round, c.total_rounds,
    c.round_due_at, c.contribution_amount, c.currency::text
  from public.circles c
  join public.circle_members m on m.circle_id = c.id
  where m.user_id = v_user
  order by c.round_due_at asc nulls last
  limit 20;
end;
$$;

-- 3. Joinable public circles for /discover -----------------------------------
-- Public, still-open circles the user is NOT already in. The bot lists them with
-- a deep link to each circle page, where the in-app Join (with its risk gate +
-- bond) runs under the user's session.
create or replace function public.bot_discover_circles(p_secret text, p_chat_id text)
returns table (
  circle_id uuid,
  name text,
  contribution_amount numeric,
  currency text,
  frequency text,
  member_count integer,
  required_bond numeric
)
language plpgsql
security definer set search_path = public
stable
as $$
declare
  v_user uuid;
begin
  if not public.verify_telegram_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  -- v_user may be null (unlinked chat); discovery is still public, so we just
  -- can't exclude their existing circles. Treat null as "exclude nothing".
  select id into v_user
    from public.profiles where telegram_chat_id = p_chat_id limit 1;

  return query
  select
    c.id, c.name, c.contribution_amount, c.currency::text,
    c.frequency::text, c.member_count, c.required_bond
  from public.circles c
  where c.is_public = true
    and c.status in ('forming', 'active')
    and (
      v_user is null
      or not exists (
        select 1 from public.circle_members m
        where m.circle_id = c.id and m.user_id = v_user
      )
    )
  order by c.created_at desc
  limit 10;
end;
$$;
