# Arjo — Feature Inventory

Arjo is a stablecoin group-savings (Ajo / ROSCA) super-app built on **Arc
(Circle) Testnet** with real onchain USDC. This document is a complete
inventory of what the app does, grouped by domain, with the source locations for
each capability so it stays verifiable.

> **Reality note:** the savings / circle / bond / yield core moves **real
> onchain Arc Testnet USDC**. The fiat on/off-ramp is testnet-indicative (USDC
> is funded from Circle's faucet; the off-ramp records a settlement request a
> provider would fulfil), and the AI features compute deterministic numbers with
> an *optional* Claude narrative layer on top. USYC yield is real but
> permissioned — it ships **off by default** in a clearly-labelled "simulated"
> mode until the platform vault is allowlisted, at which point going live is a
> config change, not a rewrite.

---

## 1. Identity, auth & onboarding
- Email / OAuth authentication via Supabase (`components/auth/auth-form.tsx`, `app/login`, `/auth/callback`, `/auth/signout`).
- Profile management — display name, avatar, preferred stablecoin (`components/auth/profile-form.tsx`, migration `0001`).
- Avatar uploads to Supabase Storage (migration `0008`).
- Session middleware — route protection + session refresh (`lib/supabase/middleware.ts`).
- Row-Level Security throughout — owner / member scoping, no service-role key.

## 2. Circle (custodial) wallets
- Auto-provisioned Circle developer-controlled wallet per user on registration (`lib/circle.ts`, `app/api/wallet`, `components/wallet/wallet-provisioner.tsx`, migration `0003`).
- Wallet panel — address, balance, explorer link, setup banner / claim flow (`components/wallet/*`).
- Platform vault — single SCA wallet holding all pooled funds (`lib/vault.ts`).
- onchain USDC transfers with idempotency keys + ref IDs (`lib/circle-transfer.ts`).
- Read-only onchain reads — balances, USDC transfer history, generic ERC-20 `balanceOf` (`lib/arc-onchain.ts`).
- Wallet withdrawal to an external address (`app/api/wallet/withdraw`, `app/account/withdraw`, `components/dashboard/withdraw/withdraw-flow.tsx`).

## 3. Personal savings (SafeLock vaults)
Three plan types (`lib/savings-actions.ts`, `components/dashboard/savings-plans.tsx`, migration `0005`):
- **SafeLock (locked)** — principal locked to a maturity date, early-exit penalty.
- **Target** — save toward an amount.
- **Auto-save** — recurring scheduled contributions (`app/api/savings/[id]/run`).

Plus:
- Lock / contribute / withdraw flows, ledger-first with onchain settlement (`app/api/savings/lock`, `app/api/savings/[id]/withdraw`).
- Quick-save widget (`components/dashboard/save/quick-save.tsx`).
- Savings charts & projections (`components/dashboard/savings-charts.tsx`).

## 4. Savings goals
- Create & track goals (migration `0004`).
- Goals linked to real SafeLock vaults — progress = real funded principal + accrued yield, not the liquid wallet balance (`lib/goals.ts`, migration `0017`, `components/dashboard/goals/goals-view.tsx`).
- Assign / detach a plan to a goal (`app/api/savings/[id]/goal`).
- Primary goal card on home (`components/dashboard/home/primary-goal-card.tsx`).

## 5. USYC yield engine
- Real USYC integration — token + Teller mint/redeem + allowlist gating (`lib/usyc.ts`).
- Live vs simulated mode — off by default, clearly labelled, identical math either way (`lib/yield-engine.ts`).
- Daily-compounded yield attribution at ~8% base APY (`accrueYield`, `projectYield`).
- Auto-sweep idle vault USDC → USYC on lock/join when live; redeem before payout on withdraw/refund.
- APY pills, live projection previews, and yield context across the savings / goals UI.
- Go-live helper script (`scripts/usyc-golive.cjs`) — read-only checklist + gated ERC-20 approval.

## 6. Circles (ROSCA / Ajo) — the core
- Create circle — contribution, frequency, member count, currency, optional bond, public/private (`app/circles/new`, `components/circles/create-circle-form.tsx`, migration `0002`).
- Discover & join public circles (`components/dashboard/community-savings.tsx`, `components/dashboard/join-circle-button.tsx`, `app/api/circles/[id]/join`, migration `0004`).
- Contribute each round (`components/circles/contribute-button.tsx`, `app/api/circles/[id]/contribute`).
- Rotation payouts — sequenced payout order, onchain payout to the next member (`components/circles/payout-button.tsx`, `app/api/circles/[id]/payout`, migration `0006`).
- Circle dashboard — health, members, payout order, insights, tabs (`app/circles/[id]`, `components/circles/*`).
- Member exit / removal settlement — refund flow (`app/api/circles/[id]/settle-exit`, migration `0009`).

## 7. Bonds & defaulter system
- Member bond on join — non-withdrawable stake held in the vault; risk-based 1× / 2× / 3× multiplier (migration `0013`).
- **Yield-bearing bonds** — a held bond earns USYC APY; the member keeps the yield on a good-standing return, and principal + yield are forfeited on a slash (`lib/bond.ts`, migration `0018`).
- Creator-driven defaulter resolution — four actions: flag-missed (grace), clear, slash, return-bond (`app/api/circles/[id]/defaulters`, `components/circles/governance-panel.tsx`, migration `0015`).
- Grace periods with expiry → auto-opens a RESTRUCTURE proposal (`app/api/circles/[id]/sweep-grace`, migration `0016`).
- Cross-circle consequences on slash — flag, high risk score, 30–90 day lockout.

## 8. Governance
- Proposals — payout-order change, exit, removal, rule change, system restructure (`app/api/circles/[id]/proposals`, migration `0007`).
- Voting with tallies and a 70% approval threshold (`app/api/proposals/[id]/vote`, `components/circles/governance-panel.tsx`).
- Proposal cancellation (`app/api/proposals/[id]/cancel`).

## 9. Risk & reputation engine
- Deterministic reputation score & AI risk classification (low / medium / high) per member (`lib/risk-engine.ts`, migration `0012`).
- Consistency rate, default count, and flags feeding circle-access gates and bond multipliers.

## 10. AI / analytics (deterministic core + optional Claude narrative)
- Circle health analyzer — 0–100 health, collection rate, reliability, risk members (`lib/circle-analysis.ts`, `app/api/circles/analyze`, `components/circles/circle-insights.tsx`).
- AI Savings Coach — personal health score, weekly / monthly projections, tips (`lib/savings-coach.ts`, `components/dashboard/savings-coach-card.tsx`, `components/dashboard/home/ai-coach-tip.tsx`).
- Financial planner — income / expense / goal → monthly plan split across flex / locked / circle buckets + timeline (`lib/financial-planner.ts`, `app/api/planner`, `components/dashboard/financial-planner.tsx`).

## 11. Gamification
- XP, levels, badges, streaks, and challenges (`lib/gamification.ts`, `components/dashboard/gamification-card.tsx`, migration `0005`) — XP rewards for contributions, locks, goals reached, and more.

## 12. Benefits dashboard
- A single "real value" view across four streams — USYC yield, circle savings moved, rewards, and bond protection (`lib/benefits.ts`, `components/dashboard/benefits/benefits-dashboard.tsx`) — currency-agnostic and live/simulated aware.

## 13. Fiat on/off-ramp
- On-ramp — guided Circle faucet hand-off (testnet) (`lib/ramp.ts`, `app/account/ramp`, `components/dashboard/ramp/ramp-flow.tsx`).
- Off-ramp — records a settlement request a provider would fulfil; cancellable (`app/api/ramp/offramp`, `app/api/ramp/offramp/[id]/cancel`).
- Region-aware fiat — USD, NGN, GHS, KES with bank / card / mobile-money methods.

## 14. Notifications
- Persisted in-app notifications + bell with unread state (`lib/notifications.ts`, `components/dashboard/notification-bell.tsx`, migration `0014`).

## 15. Support & admin
- User support tickets (`app/support`, `components/support/support-form.tsx`, migration `0010`).
- Admin support console — ticket status management (`app/admin/support`, `components/support/admin-ticket-status.tsx`, migration `0011`).

## 16. Ledger & reconciliation (the money backbone)
- Unified ledger — every money action recorded with kind / status / amount / tx refs (`lib/ledger.ts`, migration `0005`). Kinds: `contribution`, `lock`, `withdraw`, `autosave`, `payout`, `penalty`, `bonus`, `bond`, `bond_refund`, `bond_slash`, `bond_yield`.
- Ledger-first pattern — record pending → onchain → settle confirmed / failed.
- Reconciler — polls the Circle transaction state machine and promotes pending → confirmed / failed (`lib/reconcile.ts`, `app/api/ledger/reconcile`). *Currently user-session-scoped; a platform-wide background job is a planned hardening step.*
- Activity feed — human-readable ledger with status + explorer links (`components/dashboard/activity-feed.tsx`).

## 17. Cross-cutting / presentation
- Landing page — hero, features, how-it-works, CTA, footer (`components/sections/*`).
- Dark fintech dashboard with tabbed navigation: Home, Save, Goals, Circles, Benefits (`components/dashboard/dashboard-tabs.tsx`, `components/dashboard/dashboard-nav.tsx`).
- Theme provider + toggle (`components/theme/*`).
- Docs page (`app/docs`).
- Home widgets — balance card, Arc score card, quick actions, primary goal, AI tip (`components/dashboard/home/*`).
- Operations tooling — USYC allowlist helper plus Circle / vault verification scripts (`scripts/*`).

---

## Database schema footprint (18 migrations)

| # | Migration | Adds |
|---|-----------|------|
| 0001 | profiles | user profiles |
| 0002 | circles | circles (ROSCA groups) |
| 0003 | circle_wallet | per-user Circle wallet id on profiles |
| 0004 | membership_goals_discovery | memberships, savings goals, public discovery |
| 0005 | vaults_ledger_gamification | savings plans, ledger, challenges/XP |
| 0006 | circle_payouts | rotation payout order + payout tracking |
| 0007 | circle_governance | proposals + votes |
| 0008 | avatars_storage | avatar storage bucket |
| 0009 | circle_exit_settlement | member exit / removal refunds |
| 0010 | support_tickets | user support tickets |
| 0011 | admin_support | admin ticket management |
| 0012 | reputation_risk | reputation score + AI risk fields |
| 0013 | circle_bonds | member bonds + defaulter standing |
| 0014 | notifications | persisted notifications |
| 0015 | defaulter_resolution | grace / clear / slash / return-bond functions |
| 0016 | grace_restructure | grace-expiry → restructure proposals |
| 0017 | goal_funding | link savings plans to goals |
| 0018 | bond_yield | yield-bearing bonds (`bond_started_at`, `bond_yield` ledger kind) |

---

## Tech stack
- **Frontend:** Next.js 14 App Router, TypeScript, React 18, Tailwind, shadcn-style primitives (dark theme; pink primary, purple accent, emerald for yield).
- **Backend:** Next.js route handlers (Node runtime), Supabase (`@supabase/ssr`) with Row-Level Security.
- **onchain:** Circle developer-controlled wallets on Arc Testnet; real USDC; USYC (Circle's tokenised Treasury fund) for yield.
- **Deploy:** push to `main` → Vercel auto-deploy.
