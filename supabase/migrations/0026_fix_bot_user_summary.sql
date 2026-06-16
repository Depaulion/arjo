-- Arjo — fix ambiguous column in bot_user_summary
--
-- bot_user_summary (migration 0024) declares an OUT column `full_name` AND reads
-- `full_name` from public.profiles in an unqualified subquery, so Postgres raises
-- 42702 "column reference full_name is ambiguous" on every call. The /balance
-- command therefore always failed ("couldn't find your account"), regardless of
-- whether the chat was linked. This rewrite qualifies every column reference so
-- the OUT parameters can never collide with table columns. create-or-replace,
-- no app redeploy needed.

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

  select pr.id into v_user
    from public.profiles pr
    where pr.telegram_chat_id = p_chat_id
    limit 1;
  if v_user is null then
    return;
  end if;

  return query
  select
    p.id,
    p.full_name,
    p.arc_wallet_address,
    coalesce((
      select sum(sp.principal) from public.savings_plans sp
      where sp.user_id = v_user and sp.status = 'active'
    ), 0),
    (select count(*)::int from public.savings_plans sp
       where sp.user_id = v_user and sp.status = 'active'),
    (select count(*)::int from public.circle_members cm
       where cm.user_id = v_user)
  from public.profiles p
  where p.id = v_user;
end;
$$;
