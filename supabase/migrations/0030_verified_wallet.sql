-- Arjo — connect & verify an external wallet
--
-- Lets a signed-in user link a SELF-CUSTODY wallet (MetaMask etc.) by signing a
-- one-time nonce to prove ownership. The verified address becomes a trusted
-- identity / withdrawal destination. All reads/writes are the user's OWN profile
-- row under existing RLS — no service-role key, and the signature itself is
-- verified server-side in the API route (viem), never in the DB.

alter table public.profiles
  add column if not exists verified_wallet_address text,
  -- Short-lived, single-use challenge the user signs to prove wallet ownership.
  add column if not exists wallet_link_nonce text,
  add column if not exists wallet_link_nonce_expires_at timestamptz;

comment on column public.profiles.verified_wallet_address is
  'An external self-custody wallet the user proved ownership of by signing a nonce. Usable as a trusted withdrawal/identity address.';
