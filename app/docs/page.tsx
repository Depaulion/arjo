import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  ArrowLeftRight,
  Award,
  Coins,
  ExternalLink,
  Gamepad2,
  Landmark,
  Lock,
  PiggyBank,
  RefreshCw,
  EyeOff,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  Vault,
  Wallet,
  Wand2,
} from "lucide-react";

import { ARC_TESTNET, ARC_STABLECOINS, ARC_USDC_ADDRESS } from "@/lib/arc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Docs · Arjo",
  description:
    "How Arjo works: rotating savings circles, wallets, security, and the Arc Testnet network it runs on.",
};

const TOC = [
  { id: "overview", label: "Overview" },
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "wallet", label: "Your wallet & test USDC" },
  { id: "yield", label: "Yield & APY" },
  { id: "safety", label: "Member safety & defaulters" },
  { id: "privacy", label: "Privacy & governed visibility" },
  { id: "ramps", label: "Funding & cashing out" },
  { id: "security", label: "Security & custody" },
  { id: "pricing", label: "Pricing" },
  { id: "network", label: "Arc Testnet network" },
  { id: "roadmap", label: "Roadmap" },
  { id: "faq", label: "FAQ" },
];

const PILLARS = [
  {
    icon: Award,
    title: "Badges & reputation",
    body: "onchain activity builds a reputation score and unlocks badges, so members can vouch for one another with verifiable history instead of blind trust.",
  },
  {
    icon: Vault,
    title: "SafeLock vaults",
    body: "Lock funds for a fixed term to earn a yield bonus and protect yourself from impulse spending. Funds stay yours the whole time.",
  },
  {
    icon: Gamepad2,
    title: "Gamification",
    body: "Earn XP, keep contribution streaks alive, level up, and complete savings challenges — making consistent saving feel rewarding.",
  },
  {
    icon: Wand2,
    title: "AI financial planner",
    body: "Share your income and goals and get a personalised savings plan with a realistic timeline, powered by an AI coach.",
  },
  {
    icon: RefreshCw,
    title: "Automated savings",
    body: "Set a recurring amount and cadence (daily, weekly, monthly) and let auto-save move funds for you so you never miss a round.",
  },
];

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default function DocsPage() {
  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-lg">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            <span className="tracking-tight">
              Ar<span className="text-primary">jo</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Home
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-12 lg:py-16">
        <div className="mb-10 max-w-3xl">
          <Badge variant="outline">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Documentation
          </Badge>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight">
            How Arjo works
          </h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Everything about the app — the savings tradition behind it, the five
            pillars, your wallet, security, and the {ARC_TESTNET.name} network it
            runs on.
          </p>
          <div className="mt-4">
            <Badge variant="accent">Running on {ARC_TESTNET.name}</Badge>
          </div>
        </div>

        <div className="grid gap-12 lg:grid-cols-[220px_1fr]">
          {/* Sticky table of contents */}
          <aside className="hidden lg:block">
            <nav className="sticky top-24 space-y-1">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                On this page
              </p>
              {TOC.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className="block rounded-lg px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {item.label}
                </a>
              ))}
            </nav>
          </aside>

          <div className="max-w-3xl space-y-14">
            <Section id="overview" title="Overview">
              <p>
                <strong className="text-foreground">Arjo</strong> is a group
                savings app built on a simple, time-tested idea: a group of
                people you trust each contribute a fixed amount on a regular
                schedule, and each round the whole pot is paid out to one member
                in turn — until everyone has had their turn.
              </p>
              <p>
                This rotating savings circle is one of humanity&apos;s oldest
                financial tools. It&apos;s called{" "}
                <em className="text-foreground">ajo</em> or{" "}
                <em className="text-foreground">esusu</em> in parts of West
                Africa — where this app takes its name — but the same practice
                exists across the world: <em>tontine</em> in West Africa and
                France,{" "}
                <em>susu</em> in Ghana and the Caribbean, <em>chama</em> in
                Kenya, <em>hui</em> in China, <em>tanda</em> in Mexico,{" "}
                <em>committee</em> in South Asia, and{" "}
                <em>ROSCA</em> (rotating savings and credit association) in the
                language of economists. Different names, one shared idea:{" "}
                <strong className="text-foreground">
                  saving together is stronger than saving alone.
                </strong>
              </p>
              <p>
                Arjo brings that universal tradition onchain — open to anyone,
                anywhere — replacing the cash box and the trusted bookkeeper with
                transparent stablecoin transfers, automated payouts, and a public
                ledger every member can verify.
              </p>
            </Section>

            <Section id="how-it-works" title="How it works">
              <ol className="list-decimal space-y-3 pl-5 marker:text-primary">
                <li>
                  <strong className="text-foreground">Sign in.</strong> Sign in
                  with Google and a personal onchain wallet is created for you
                  automatically — no seed phrases to manage.
                </li>
                <li>
                  <strong className="text-foreground">
                    Create or join a circle.
                  </strong>{" "}
                  Set the contribution amount, schedule (weekly, bi-weekly,
                  monthly), and who&apos;s in. Or browse public circles in
                  Community savings and join one.
                </li>
                <li>
                  <strong className="text-foreground">Contribute.</strong> Each
                  round, members send their contribution in stablecoins into the
                  circle&apos;s pot. Everyone sees the same onchain balance.
                </li>
                <li>
                  <strong className="text-foreground">Rotate the payout.</strong>{" "}
                  The whole pot is paid out to the next member in the rotation.
                  Over the full cycle, everyone contributes the same and everyone
                  receives the same — no fees skimmed by a middleman.
                </li>
                <li>
                  <strong className="text-foreground">Build reputation.</strong>{" "}
                  Reliable contributions raise your reputation score and unlock
                  badges, making it easier to join and form future circles.
                </li>
              </ol>
            </Section>

            <Section id="features" title="Features">
              <p>Arjo is built on five pillars:</p>
              <div className="grid gap-4 sm:grid-cols-2">
                {PILLARS.map((p) => {
                  const Icon = p.icon;
                  return (
                    <div
                      key={p.title}
                      className="rounded-2xl border border-border bg-secondary/20 p-5"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15 text-primary">
                        <Icon className="h-5 w-5" />
                      </span>
                      <h3 className="mt-3 font-semibold text-foreground">
                        {p.title}
                      </h3>
                      <p className="mt-1 text-sm">{p.body}</p>
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section id="wallet" title="Your wallet & test USDC">
              <p className="flex items-start gap-2">
                <Wallet className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  When you sign in, Arjo provisions a programmable wallet for
                  you on {ARC_TESTNET.name} automatically (powered by Circle). If
                  setup is ever interrupted, the dashboard retries on load and
                  shows a one-tap retry — so you always end up with a wallet.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <PiggyBank className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  Because this runs on a test network, you fund your wallet with{" "}
                  <strong className="text-foreground">free test USDC</strong>.
                  Use the{" "}
                  <strong className="text-foreground">Claim test USDC</strong>{" "}
                  button on your dashboard — it copies your address and opens the{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href={ARC_TESTNET.faucetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Circle faucet
                  </a>
                  . Paste, claim, and hit Refresh.
                </span>
              </p>
              <p>
                You can save in any of these stablecoins:{" "}
                {ARC_STABLECOINS.map((s, i) => (
                  <span key={s}>
                    <strong className="text-foreground">{s}</strong>
                    {i < ARC_STABLECOINS.length - 1 ? ", " : ""}
                  </span>
                ))}
                .
              </p>
            </Section>

            <Section id="yield" title="Yield & APY">
              <p className="flex items-start gap-2">
                <TrendingUp className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  When you lock funds in a SafeLock vault or run an automated
                  plan, Arjo advertises an annualised bonus —{" "}
                  <strong className="text-foreground">8% on SafeLock</strong>,
                  4% on target plans, and 2% on auto-save. A fair question
                  follows: <em>where does that yield actually come from?</em>
                </span>
              </p>
              <p>
                It isn&apos;t conjured out of thin air, and it isn&apos;t paid
                by new deposits (the structure that makes Ponzi schemes
                collapse). The yield comes from{" "}
                <strong className="text-foreground">USYC</strong> — a
                regulated, yield-bearing stablecoin from Circle and Hashnote
                that is fully backed by{" "}
                <strong className="text-foreground">
                  short-term U.S. Treasury bills and reverse-repo
                </strong>
                . Idle funds that aren&apos;t mid-rotation are held in USYC, so
                they earn the underlying Treasury rate while they wait. The bonus
                Arjo credits at maturity is your share of that real yield.
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                <li>
                  <strong className="text-foreground">The source is real.</strong>{" "}
                  USYC&apos;s return tracks short-dated government debt — among
                  the most conservative yields in finance — not speculative DeFi
                  farming.
                </li>
                <li>
                  <strong className="text-foreground">It&apos;s pro-rated.</strong>{" "}
                  Bonus is credited for the time your funds were actually held,
                  not granted up front — withdraw on day one and you earn nothing
                  extra.
                </li>
                <li>
                  <strong className="text-foreground">
                    Rates can move.
                  </strong>{" "}
                  Because the yield is tied to Treasury rates, the advertised APY
                  is a target that tracks the market, not a fixed promise.
                </li>
              </ul>
              <p className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
                USYC has <strong className="text-foreground">live contracts on{" "}
                {ARC_TESTNET.name}</strong> (token, Teller, and an allowlist), so
                this isn&apos;t mainnet-only. Access is permissioned, though:
                until the platform vault is allowlisted by Circle, yield runs in a
                clearly-labelled <strong className="text-foreground">simulated</strong>{" "}
                mode that tracks the published USYC rate — the same math, just not
                yet disbursed from a real position. Enabling the live position is a
                config change, not a rebuild.
              </p>
            </Section>

            <Section id="safety" title="Member safety & defaulters">
              <p className="flex items-start gap-2">
                <UserCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  A rotating circle only works if members keep contributing
                  after they&apos;ve received their payout. Arjo doesn&apos;t
                  rely on blind trust — it layers several protections so an
                  honest member is never left exposed to a defaulter.
                </span>
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                <li>
                  <strong className="text-foreground">
                    Reputation you can verify.
                  </strong>{" "}
                  Every contribution and payout is onchain. Members build a
                  reputation score and badges from real history, so you can see
                  who has reliably paid into past circles before you join one
                  with them.
                </li>
                <li>
                  <strong className="text-foreground">
                    Transparent pot.
                  </strong>{" "}
                  No organiser hides the money. The circle balance is a public
                  onchain balance every member can audit on the block explorer,
                  so a missed contribution is visible to everyone immediately.
                </li>
                <li>
                  <strong className="text-foreground">
                    Penalties &amp; locked terms.
                  </strong>{" "}
                  SafeLock funds carry a 10% early-withdrawal penalty, so pulling
                  out before a commitment ends has a real cost — discouraging the
                  impulsive exits that destabilise a group.
                </li>
                <li>
                  <strong className="text-foreground">
                    Governed exits with settlement.
                  </strong>{" "}
                  Removing a member or approving an exit runs through a circle
                  proposal. When it passes, the member is settled — their net
                  contributions are refunded and they&apos;re removed cleanly —
                  rather than vanishing and leaving the books unbalanced.
                </li>
              </ul>
              <p>
                On the roadmap: optional contribution bonds (a refundable stake
                that backstops a missed round) and grace-period reminders before
                a member is flagged — deepening protection without punishing an
                honest late payment.
              </p>
            </Section>

            <Section id="privacy" title="Privacy &amp; governed visibility">
              <p className="flex items-start gap-2">
                <EyeOff className="mt-1 h-5 w-5 shrink-0 text-accent" />
                <span>
                  A group pot needs a shared, auditable total — but who put in
                  exactly how much is sensitive. Arjo&apos;s answer is{" "}
                  <strong className="text-foreground">
                    privacy with governed visibility
                  </strong>
                  : the pot total stays open to the whole circle, while each
                  member&apos;s individual figures are shown only to people with
                  a defined reason to see them.
                </span>
              </p>
              <ul className="list-disc space-y-2 pl-5 marker:text-accent">
                <li>
                  <strong className="text-foreground">
                    Pooled by design.
                  </strong>{" "}
                  Every circle&apos;s funds settle into one shared vault, so an
                  onchain observer sees flows in and out of the vault — not
                  &ldquo;this person contributed X to that circle.&rdquo; Per-member
                  attribution lives in the ledger, not in a public address.
                </li>
                <li>
                  <strong className="text-foreground">
                    Defined access.
                  </strong>{" "}
                  That ledger is protected by row-level security: you read your
                  own activity, and the people authorised for a circle read
                  theirs. No public exposure, no admin override key.
                </li>
                <li>
                  <strong className="text-foreground">
                    Private amounts mode.
                  </strong>{" "}
                  A circle creator can switch on{" "}
                  <em>private amounts</em>, which hides each member&apos;s
                  individual contribution figures from other members — every
                  member still sees their own, the creator (as the authorised
                  party) sees all, and the shared pot total stays visible to
                  everyone.
                </li>
              </ul>
              <p className="rounded-2xl border border-accent/40 bg-accent/5 p-4 text-sm">
                This is enforced today at the data layer Arjo controls. It is
                deliberately aligned with{" "}
                <strong className="text-foreground">Arc&apos;s privacy
                roadmap</strong> — confidential transfers with governed
                visibility for real financial workflows. As those onchain
                primitives ship, Arjo&apos;s model extends to settle the same
                way it already presents: sensitive activity protected, authorised
                parties retaining defined access.
              </p>
            </Section>

            <Section id="ramps" title="Funding &amp; cashing out">
              <p className="flex items-start gap-2">
                <ArrowLeftRight className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  Getting money <em>in</em> and <em>out</em> easily is what makes
                  a savings app usable in real life. Here&apos;s how funding
                  (on-ramp) and cashing out (off-ramp) work.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <PiggyBank className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">Today, on testnet:</strong>{" "}
                  you fund your wallet with free test USDC from the{" "}
                  <a
                    className="font-medium text-primary hover:underline"
                    href={ARC_TESTNET.faucetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Circle faucet
                  </a>{" "}
                  — one tap from your dashboard. There&apos;s nothing to cash out
                  because test tokens hold no real value.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Landmark className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  <strong className="text-foreground">On mainnet:</strong> because
                  balances are real USDC/EURC/USYC, on- and off-ramps connect to
                  the local money rails members already use — card and bank
                  transfer in supported regions, and partner ramps for cash and
                  mobile money where those dominate. You buy stablecoins straight
                  into your Arjo wallet, and cash out from it the same way — no
                  separate exchange account to manage.
                </span>
              </p>
              <p>
                Ramps are deliberately built as a pluggable layer so Arjo can use
                the best-available provider in each market rather than locking
                everyone to one. Entering payment details always happens on the
                provider&apos;s own secure screen — Arjo never asks you to type
                card or bank credentials into the app.
              </p>
            </Section>

            <Section id="security" title="Security & custody">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  Every transfer settles onchain and is publicly verifiable on
                  the Arc block explorer. Circle balances aren&apos;t numbers in
                  a private database — they&apos;re real onchain balances anyone
                  in the circle can audit.
                </span>
              </p>
              <p className="flex items-start gap-2">
                <Lock className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  Your data is protected with row-level security: you can only
                  read and write your own profile, circles, goals, and ledger
                  entries. The app holds no admin override key over your records.
                </span>
              </p>
              <p>
                Wallets are programmable smart-contract accounts. Always treat
                test funds as test funds — see the network note below.
              </p>
            </Section>

            <Section id="pricing" title="Pricing">
              <p>
                Arjo is{" "}
                <strong className="text-foreground">free to use</strong> while it
                runs on {ARC_TESTNET.name}. There are no platform fees and no
                middleman taking a cut of your pot — the whole contribution goes
                into the circle and the whole pot goes to the recipient.
              </p>
              <p>
                The only cost of a transaction is the network gas fee, which on
                Arc is paid in USDC and is negligible on testnet.
              </p>
            </Section>

            <Section id="network" title="Arc Testnet network">
              <div className="rounded-2xl border border-accent/40 bg-accent/5 p-5">
                <p className="font-semibold text-foreground">
                  ⚠ This app runs on {ARC_TESTNET.name}.
                </p>
                <p className="mt-1 text-sm">
                  All balances and transfers use <strong>test tokens</strong>{" "}
                  with <strong>no real-world monetary value</strong>. Never send
                  real funds. Test USDC is claimed free from the faucet for
                  trying out the app.
                </p>
              </div>
              <dl className="mt-2 grid gap-px overflow-hidden rounded-2xl border border-border bg-border text-sm sm:grid-cols-2">
                <div className="bg-card p-4">
                  <dt className="text-muted-foreground">Network</dt>
                  <dd className="font-medium text-foreground">
                    {ARC_TESTNET.name}
                  </dd>
                </div>
                <div className="bg-card p-4">
                  <dt className="text-muted-foreground">Chain ID</dt>
                  <dd className="font-medium text-foreground">
                    {ARC_TESTNET.chainId}
                  </dd>
                </div>
                <div className="bg-card p-4">
                  <dt className="text-muted-foreground">Native gas token</dt>
                  <dd className="font-medium text-foreground">
                    {ARC_TESTNET.nativeCurrency.symbol} (
                    {ARC_TESTNET.nativeCurrency.decimals} decimals)
                  </dd>
                </div>
                <div className="bg-card p-4">
                  <dt className="text-muted-foreground">USDC precompile</dt>
                  <dd className="break-all font-mono text-xs text-foreground">
                    {ARC_USDC_ADDRESS}
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-3 pt-1">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={ARC_TESTNET.explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Block explorer
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={ARC_TESTNET.faucetUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Faucet
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
              </div>
            </Section>

            <Section id="roadmap" title="Roadmap">
              <p>
                Arjo is actively evolving. On the horizon: mainnet support,
                richer circle governance, member invitations and notifications,
                and deeper analytics. Want to shape it? See the source and open
                an issue.
              </p>
              <Button variant="outline" size="sm" asChild>
                <a
                  href="https://github.com/Depaulion/arc-ajo"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View source on GitHub
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </Section>

            <Section id="faq" title="FAQ">
              <div className="space-y-5">
                <div>
                  <p className="font-semibold text-foreground">
                    Do I need crypto experience?
                  </p>
                  <p>
                    No. Sign in with Google and your wallet is created for you.
                    There are no seed phrases to write down.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Is this real money?
                  </p>
                  <p>
                    Not on {ARC_TESTNET.name} — it uses free test tokens with no
                    real value, so you can explore safely.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Where does the savings APY come from?
                  </p>
                  <p>
                    From real yield, not new deposits. Idle funds are held in
                    USYC — a regulated stablecoin backed by short-term U.S.
                    Treasuries — and the bonus credited at maturity is your share
                    of that return. See{" "}
                    <a
                      className="font-medium text-primary hover:underline"
                      href="#yield"
                    >
                      Yield &amp; APY
                    </a>{" "}
                    for the full picture.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    What happens if a member stops paying?
                  </p>
                  <p>
                    onchain reputation, a transparent pot, early-exit penalties,
                    and governed exits with refund settlement all protect honest
                    members. See{" "}
                    <a
                      className="font-medium text-primary hover:underline"
                      href="#safety"
                    >
                      Member safety &amp; defaulters
                    </a>
                    .
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Who controls the pot?
                  </p>
                  <p>
                    No single person hides the money. Every contribution and
                    payout is an onchain transfer that all members can verify on
                    the block explorer.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Is Arjo only for one region?
                  </p>
                  <p>
                    No. Rotating savings circles are practised worldwide under
                    many names. Arjo draws its name from that shared tradition
                    while being built for everyone, everywhere.
                  </p>
                </div>
              </div>
            </Section>

            <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-card to-primary/10 p-6 text-center">
              <h3 className="text-xl font-bold">Ready to save together?</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Create your first circle in minutes on {ARC_TESTNET.name}.
              </p>
              <Button className="mt-4" asChild>
                <Link href="/login">Get started</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
