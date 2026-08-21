-- Arjo — Savings Agent: circle-aware floor
--
-- The agent must not lock funds a member needs for an imminent circle
-- contribution. This adds a `reserved` amount to due_agent_sweeps: the sum of
-- contribution amounts for the member's active circles whose current round is
-- unpaid and due within the next 7 days. The cron then treats the EFFECTIVE
-- floor as (liquid_floor + reserved), so surplus is only what's truly free.
--
-- Adding a column to the RETURNS TABLE requires drop + recreate.

drop function if exists public.due_agent_sweeps(text);

create function public.due_agent_sweeps(p_secret text)
returns table (
  user_id uuid,
  wallet_id text,
  wallet_address text,
  liquid_floor numeric,
  reserved numeric,
  lock_days integer,
  min_sweep numeric,
  currency text
)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  return query
  select
    a.user_id,
    p.circle_wallet_id,
    p.arc_wallet_address,
    a.liquid_floor,
    -- Reserve for upcoming circle contributions: active circles this member is
    -- in, current round unpaid, due within 7 days.
    coalesce((
      select sum(c.contribution_amount)
      from public.circle_members m2
      join public.circles c on c.id = m2.circle_id
      where m2.user_id = a.user_id
        and c.status in ('forming', 'active')
        and c.round_due_at is not null
        and c.round_due_at <= now() + interval '7 days'
        and coalesce(m2.default_status, 'none') <> 'defaulted'
        and not exists (
          select 1 from public.circle_round_contributions crc
          where crc.circle_id = c.id
            and crc.round_number = c.current_round
            and crc.user_id = a.user_id
            and crc.status = 'paid'
        )
    ), 0) as reserved,
    a.lock_days,
    a.min_sweep,
    p.preferred_stablecoin
  from public.savings_agent a
  join public.profiles p on p.id = a.user_id
  where a.enabled = true
    and p.arc_wallet_address is not null
    and p.circle_wallet_id is not null;
end;
$$;
