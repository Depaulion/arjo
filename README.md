# Arc Ajo

Stablecoin-powered group savings, inspired by the Yoruba **Ajo** rotating-savings
tradition — rebuilt on the **Arc (Circle) Testnet**. Pool funds with people you
trust, automate payouts, and track everything transparently on-chain.

Built with Next.js 14 (App Router), TypeScript, Tailwind CSS, Supabase auth,
Circle Programmable Wallets, and live on-chain USDC data with an AI circle-health
analysis layer.

> **Note:** This runs against **Arc Testnet** with **Circle TEST keys** — it's a
> working testnet/demo, not a real-money production app.

## Features

- **Auth** — email/password + Google OAuth via Supabase.
- **Programmable wallets** — a Circle developer-controlled wallet is auto-provisioned
  for each user on Arc Testnet.
- **Live on-chain dashboard** — `/circles/[id]` reads real USDC balances and
  transfers straight from the Arc RPC (no mock data).
- **AI insights** — per-circle health score (0–100), risk-member flags,
  recommendations, and a 4-week stability forecast. Uses Claude when
  `ANTHROPIC_API_KEY` is set, with a deterministic scoring engine as fallback and
  numerical grounding.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 14 (App Router), React 18, TypeScript |
| Styling | Tailwind CSS v3, shadcn-style components |
| Auth + DB | Supabase (`@supabase/ssr`) |
| Wallets | Circle Programmable Wallets (`@circle-fin/developer-controlled-wallets`) |
| Chain | Arc Testnet (chain ID `5042002`), USDC |
| AI | Anthropic Claude (optional) + built-in heuristic engine |

## Local development

```bash
npm install
cp .env.local.example .env.local   # then fill in real values (see below)
npm run dev                         # http://localhost:3000
```

Build & run the optimized production server locally:

```bash
npm run build
npm start
```

## Environment variables

Copy `.env.local.example` to `.env.local` and fill in. `NEXT_PUBLIC_*` values are
exposed to the browser; the rest are server-only secrets — **never commit them**
(`.env.local` is gitignored).

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | anon public key |
| `NEXT_PUBLIC_SITE_URL` | ✅ | base URL, used for OAuth redirects |
| `NEXT_PUBLIC_ARC_CHAIN_ID` | ✅ | `5042002` |
| `NEXT_PUBLIC_ARC_RPC_URL` | ✅ | `https://rpc.testnet.arc.network` |
| `NEXT_PUBLIC_ARC_EXPLORER_URL` | ✅ | `https://testnet.arcscan.app` |
| `ARC_LOOKBACK_BLOCKS` | – | blocks scanned for transfers (default `100000`) |
| `ARC_DEMO_ADDRESS` | – | fallback pot address for the demo dashboard |
| `CIRCLE_API_KEY` | ✅ | **secret** — Circle Console |
| `CIRCLE_ENTITY_SECRET` | ✅ | **secret** — 64-char hex |
| `CIRCLE_WALLET_SET_ID` | ✅ | shared wallet set id |
| `ANTHROPIC_API_KEY` | – | enables Claude-written insights |
| `ANTHROPIC_MODEL` | – | default `claude-3-5-sonnet-latest` |

## Database setup

In the Supabase **SQL Editor**, run the migrations in order:

1. `supabase/migrations/0001_profiles.sql`
2. `supabase/migrations/0002_circles.sql`
3. `supabase/migrations/0003_circle_wallet.sql`

## Deploying to Vercel

1. **Supabase** — create a project, run the migrations above, copy the Project URL
   + anon key.
2. **Push to GitHub** — e.g. `gh repo create arc-ajo --private --source=. --push`.
3. **Import** the repo at [vercel.com/new](https://vercel.com/new). Next.js is
   auto-detected — no `vercel.json` needed.
4. **Set env vars** (table above) in Vercel → Settings → Environment Variables,
   with `NEXT_PUBLIC_SITE_URL` = your Vercel domain.
5. **OAuth redirects** — in Supabase → Authentication → URL Configuration, set the
   Site URL to your Vercel domain and add `https://<your-app>.vercel.app/auth/callback`
   to Redirect URLs. Mirror that callback in the Google Cloud console if using
   Google sign-in.
6. **Verify** — sign up, confirm a profile + Circle wallet are created, open a
   circle, claim test USDC from the [Circle faucet](https://faucet.circle.com),
   then refresh to see the on-chain balance and AI insights populate.
