-- Arc Ajo — Circle Programmable Wallet linkage
-- Each user is auto-provisioned a Circle developer-controlled wallet on Arc.
-- The onchain address lives in profiles.arc_wallet_address (from 0001); here we
-- track Circle's internal wallet id and the chain it was created on.

alter table public.profiles
  add column if not exists circle_wallet_id text,
  add column if not exists wallet_blockchain text not null default 'ARC-TESTNET';

comment on column public.profiles.circle_wallet_id is 'Circle developer-controlled wallet id (from the Circle API).';
comment on column public.profiles.wallet_blockchain is 'Blockchain the Circle wallet was provisioned on, e.g. ARC-TESTNET.';
