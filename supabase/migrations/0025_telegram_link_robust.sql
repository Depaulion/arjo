-- Arjo — robust Telegram link-code generation
--
-- Fix for "That link has expired" on linking even with a fresh code: the code
-- generator updated the caller's profile row, but if that row didn't exist
-- (account created before the handle_new_user trigger, or the trigger didn't
-- fire), the UPDATE matched nothing — so the code was returned to the app but
-- never stored, and the bot could never find it. We now ensure the profile row
-- exists first, and extend the code lifetime to 60 minutes so timing can't bite.
--
-- Only `id` is required on profiles (everything else is nullable or defaulted),
-- so the insert is safe. Idempotent: create-or-replace.

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

  -- Guarantee a profile row to attach the code to.
  insert into public.profiles (id) values (auth.uid())
    on conflict (id) do nothing;

  update public.profiles
    set telegram_link_code = v_code,
        telegram_link_expires_at = now() + interval '60 minutes'
    where id = auth.uid();

  return v_code;
end;
$$;
