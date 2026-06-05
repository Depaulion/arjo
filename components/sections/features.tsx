import {
  Banknote,
  Globe2,
  Lock,
  PiggyBank,
  TrendingUp,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardTitle } from "@/components/ui/card";

const features = [
  {
    icon: Users,
    title: "Trusted savings circles",
    description:
      "Invite friends, family, or your community into a private Ajo. Set the amount, the schedule, and the payout order — everyone sees the same rules.",
  },
  {
    icon: Banknote,
    title: "Stablecoin contributions",
    description:
      "Contribute in USDC or other stablecoins. No volatility, no inflation eating your savings — just predictable value every round.",
  },
  {
    icon: Lock,
    title: "Non-custodial by design",
    description:
      "Funds are governed by audited smart contracts, not a company. You keep control of your money the entire time.",
  },
  {
    icon: TrendingUp,
    title: "Earn yield while you wait",
    description:
      "Idle pool funds are deployed into vetted DeFi vaults, so the circle grows even between payouts.",
  },
  {
    icon: Globe2,
    title: "Borderless & instant",
    description:
      "Save with anyone, anywhere. Payouts settle on-chain in seconds — no banks, no wire fees, no waiting.",
  },
  {
    icon: PiggyBank,
    title: "Automated payouts",
    description:
      "Smart contracts handle collection and distribution on schedule. No chasing members, no manual bookkeeping.",
  },
];

export function Features() {
  return (
    <section id="features" className="py-20 lg:py-28">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mx-auto">
            Why Arjo
          </Badge>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            The Ajo you trust, with the tech you deserve
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            We took the centuries-old rotating savings tradition and rebuilt it
            on transparent, programmable money.
          </p>
        </div>

        <div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group border-border/70 transition-all hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5"
            >
              <CardContent className="pt-6">
                <span className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-6 w-6" />
                </span>
                <CardTitle>{feature.title}</CardTitle>
                <CardDescription className="mt-2">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
