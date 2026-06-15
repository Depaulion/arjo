-- Arjo — Telegram notifications
--
-- Members link a Telegram chat once, then the platform bot DMs them the alerts
-- that already exist in-app: round-due reminders, auto-debit heads-ups/receipts,
-- and "top up" warnings. Delivery happens from the Vercel cron (server-side,
-- where the bot token lives) — Postgres never calls Telegram.
--
-- Same no-service-role constraint as the cron (migration 0021): cross-user reads
-- go through SECURITY DEFINER RPCs. User-facing linking gates on auth.uid(); the
-- webhook gate uses a Telegram secret in app_config; the cron chat-id lookup
-- reuses the existing cron secret. No secret value is ever committed.

-- 1. Per-member Telegram link state ------------------------------------------
alter table public.profiles
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_link_code text,
  add column if not exists telegram_link_expires_at timestamptz;

comment on column public.profiles.telegram_chat_id is
  'Linked Telegram chat id the bot DMs notifications to (null = not connected).';
comment on column public.profiles.telegram_link_code is
  'Short-lived one-time code the user sends to the bot as /start <code> to link.';

-- 2. New notification type for round-due reminders ---------------------------
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'default_warning',
    'grace_period',
    'bond_slashed',
    'payout_delayed',
    'restructure_vote',
    'payout_protected',
    'reinstatement_eligible',
    'auto_debit_upcoming',
    'auto_debit_paid',
    'auto_debit_failed',
    'round_reminder'
  ));

-- 3. Generate a link code (user-facing, auth-scoped) --------------------------
-- The signed-in user mints a short code; the app builds a t.me/<bot>?start=<code>
-- deep link from it. Codes expire in 15 minutes and are single-use (cleared on
-- link). SECURITY DEFINER so it can write the code regardless of profile RLS
-- shape, but it only ever writes the CALLER's own row (auth.uid()).
create or replace function public.generate_telegram_link_code()
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_code text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_code := substr(md5(random()::text || clock_timestamp()::text), 1, 10);

  update public.profiles
    set telegram_link_code = v_code,
        telegram_link_expires_at = now() + interval '15 minutes'
    where id = auth.uid();

  return v_code;
end;
$$;

-- 4. Disconnect Telegram (user-facing, auth-scoped) ---------------------------
create or replace function public.unlink_telegram()
returns boolean
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  update public.profiles
    set telegram_chat_id = null,
        telegram_link_code = null,
        telegram_link_expires_at = null
    where id = auth.uid();

  return true;
end;
$$;

-- 5. Link a chat by code (webhook, Telegram-secret gated) ---------------------
-- Called by the bot webhook when a user sends /start <code>. The webhook carries
-- no user session, so this gates on a shared Telegram secret in app_config
-- (set manually, never committed) instead of auth.uid(). Returns the linked
-- user's display name (for the bot's welcome message), or null if the code was
-- invalid/expired.
create or replace function public.link_telegram_by_code(
  p_secret text,
  p_code text,
  p_chat_id text
)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  v_user uuid;
  v_name text;
begin
  if not exists (
    select 1 from public.app_config
    where key = 'telegram_webhook_secret'
      and value = p_secret
      and char_length(coalesce(p_secret, '')) >= 16
  ) then
    raise exception 'Unauthorized';
  end if;

  select id, full_name into v_user, v_name
    from public.profiles
    where telegram_link_code = p_code
      and telegram_link_expires_at is not null
      and telegram_link_expires_at > now()
    limit 1;

  if v_user is null then
    return null;
  end if;

  update public.profiles
    set telegram_chat_id = p_chat_id,
        telegram_link_code = null,
        telegram_link_expires_at = null
    where id = v_user;

  return coalesce(v_name, 'there');
end;
$$;

-- 6. Chat ids for a set of users (cron, cron-secret gated) --------------------
-- Lets the cron map user_ids → linked chat ids in one round-trip so it can push
-- Telegram alongside the in-app notification it already creates.
create or replace function public.telegram_chat_ids(
  p_secret text,
  p_user_ids uuid[]
)
returns table (user_id uuid, chat_id text)
language plpgsql
security definer set search_path = public
stable
as $$
begin
  if not public.verify_cron_secret(p_secret) then
    raise exception 'Unauthorized';
  end if;

  return query
  select p.id, p.telegram_chat_id
  from public.profiles p
  where p.id = any(p_user_ids)
    and p.telegram_chat_id is not null;
end;
$$;

-- 7. Round-due reminders for ALL members (cron, cron-secret gated) ------------
-- One row per (circle, member) whose round falls due within p_within and who
-- hasn't paid it yet — EXCLUDING auto-debit members (they get the dedicated
-- auto_debit_upcoming heads-up instead). Deduped to one reminder per round via
-- the not-exists check on a prior 'round_reminder' notice since the round
-- opened. Drives both the in-app notification and the Telegram push.
create or replace function public.due_round_reminders(
  p_secret text,
  p_within interval default interval '48 hours'
)
returns table (
  circle_id uuid,
  circle_name text,
  round_number integer,
  user_id uuid,
  amount numeric,
  currency text,
  round_due_at timestamptz
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
    c.id,
    c.name,
    c.current_round,
    m.user_id,
    c.contribution_amount,
    c.currency::text,
    c.round_due_at
  from public.circles c
  join public.circle_members m
    on m.circle_id = c.id and coalesce(m.auto_debit, false) = false
  where c.status in ('forming', 'active')
    and c.round_due_at is not null
    and c.round_due_at <= now() + p_within
    and coalesce(m.default_status, 'none') <> 'defaulted'
    and not exists (
      select 1 from public.circle_round_contributions crc
      where crc.circle_id = c.id
        and crc.round_number = c.current_round
        and crc.user_id = m.user_id
        and crc.status = 'paid'
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = m.user_id
        and n.circle_id = c.id
        and n.type = 'round_reminder'
        and n.created_at >= coalesce(c.round_started_at, c.created_at)
    );
end;
$$;
