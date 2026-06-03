import Link from "next/link";
import { ArrowRight, ShieldCheck, Sparkles, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute -top-32 left-1/4 h-96 w-96 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -right-24 top-24 h-80 w-80 rounded-full bg-accent/20 blur-3xl" />
      </div>

      <div className="container grid gap-12 py-20 lg:grid-cols-2 lg:items-center lg:py-28">
        <div className="space-y-8">
          <Badge variant="outline">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            Ajo, reimagined on-chain
          </Badge>

          <h1 className="text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            Save together,
            <br />
            <span className="bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              powered by stablecoins.
            </span>
          </h1>

          <p className="max-w-xl text-lg leading-relaxed text-muted-foreground">
            Arc Ajo brings the trusted Yoruba <em>Ajo</em> savings circle
            on-chain. Pool funds with people you trust, automate every payout,
            and grow your money in stablecoins — transparent, borderless, and
            free from middlemen.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button size="lg" asChild>
              <Link href="/login">
                Start a savings circle
                <ArrowRight />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Non-custodial &amp; audited
            </span>
            <span className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Earn yield while you save
            </span>
          </div>
        </div>

        {/* Visual: savings circle card */}
        <div className="relative">
          <div className="animate-float rounded-3xl border border-border/70 bg-card p-6 shadow-2xl shadow-primary/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Lagos Founders Circle</p>
                <p className="text-2xl font-bold">$12,000 pool</p>
              </div>
              <Badge variant="accent">Round 4 / 8</Badge>
            </div>

            <div className="mt-6 h-2.5 w-full overflow-hidden rounded-full bg-secondary">
              <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-primary to-accent" />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Next payout in 6 days · $1,500 to <strong>Amaka</strong>
            </p>

            <div className="mt-6 space-y-3">
              {[
                { name: "Tunde", status: "Paid", paid: true },
                { name: "Amaka", status: "Paid", paid: true },
                { name: "Chidi", status: "Paid", paid: true },
                { name: "You", status: "Due in 6d", paid: false },
              ].map((m) => (
                <div
                  key={m.name}
                  className="flex items-center justify-between rounded-xl bg-secondary/60 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                      {m.name.slice(0, 2).toUpperCase()}
                    </span>
                    <span className="text-sm font-medium">{m.name}</span>
                  </div>
                  <span
                    className={
                      m.paid
                        ? "text-xs font-semibold text-primary"
                        : "text-xs font-semibold text-muted-foreground"
                    }
                  >
                    {m.status}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* floating stat */}
          <div className="absolute -bottom-5 -left-5 hidden rounded-2xl border border-border/70 bg-card px-5 py-3 shadow-xl sm:block">
            <p className="text-xs text-muted-foreground">APY on idle funds</p>
            <p className="text-xl font-bold text-primary">5.2%</p>
          </div>
        </div>
      </div>
    </section>
  );
}
