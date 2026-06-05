import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowLeft,
  Award,
  Coins,
  ExternalLink,
  Gamepad2,
  Lock,
  PiggyBank,
  RefreshCw,
  ShieldCheck,
  Sparkles,
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
    body: "On-chain activity builds a reputation score and unlocks badges, so members can vouch for one another with verifiable history instead of blind trust.",
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
                <em className="text-foreground">Ajo</em> or{" "}
                <em className="text-foreground">Esusu</em> among the Yoruba —
                where this app takes its name — but the same practice exists
                across the world: <em>tontine</em> in West Africa and France,{" "}
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
                Arjo brings that universal tradition on-chain — open to anyone,
                anywhere — replacing the cash box and the trusted bookkeeper with
                transparent stablecoin transfers, automated payouts, and a public
                ledger every member can verify.
              </p>
            </Section>

            <Section id="how-it-works" title="How it works">
              <ol className="list-decimal space-y-3 pl-5 marker:text-primary">
                <li>
                  <strong className="text-foreground">Sign in.</strong> Sign in
                  with Google and a personal on-chain wallet is created for you
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
                  circle&apos;s pot. Everyone sees the same on-chain balance.
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

            <Section id="security" title="Security & custody">
              <p className="flex items-start gap-2">
                <ShieldCheck className="mt-1 h-5 w-5 shrink-0 text-primary" />
                <span>
                  Every transfer settles on-chain and is publicly verifiable on
                  the Arc block explorer. Circle balances aren&apos;t numbers in
                  a private database — they&apos;re real on-chain balances anyone
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
                    Who controls the pot?
                  </p>
                  <p>
                    No single person hides the money. Every contribution and
                    payout is an on-chain transfer that all members can verify on
                    the block explorer.
                  </p>
                </div>
                <div>
                  <p className="font-semibold text-foreground">
                    Is Ajo only for one region?
                  </p>
                  <p>
                    No. Rotating savings circles are practised worldwide under
                    many names. Arjo honours the Yoruba origin of its name
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
