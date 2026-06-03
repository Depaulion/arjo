import { UserPlus, CalendarClock, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";

const steps = [
  {
    icon: UserPlus,
    step: "01",
    title: "Form your circle",
    description:
      "Create an Ajo and invite members with a link. Agree on the contribution amount, frequency, and the order in which everyone receives the pot.",
  },
  {
    icon: CalendarClock,
    step: "02",
    title: "Contribute on schedule",
    description:
      "Each round, members deposit their stablecoin contribution. Smart contracts collect automatically — and put idle funds to work earning yield.",
  },
  {
    icon: Wallet,
    step: "03",
    title: "Receive your payout",
    description:
      "When it's your turn, the full pot lands in your wallet instantly. Every contribution and payout is verifiable on-chain.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="bg-secondary/40 py-20 lg:py-28">
      <div className="container">
        <div className="mx-auto max-w-2xl text-center">
          <Badge variant="outline" className="mx-auto">
            How it works
          </Badge>
          <h2 className="mt-5 text-3xl font-bold tracking-tight sm:text-4xl">
            Three steps to your first payout
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            Familiar if you&apos;ve ever joined an Ajo, esusu, or tontine — only
            faster, safer, and fully transparent.
          </p>
        </div>

        <div className="relative mt-16 grid gap-8 md:grid-cols-3">
          {/* connector line */}
          <div className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-border to-transparent md:block" />

          {steps.map((s) => (
            <div key={s.step} className="relative flex flex-col items-center text-center">
              <span className="relative z-10 flex h-14 w-14 items-center justify-center rounded-2xl border border-primary/20 bg-card text-primary shadow-sm">
                <s.icon className="h-6 w-6" />
              </span>
              <span className="mt-5 text-xs font-bold uppercase tracking-widest text-accent-foreground/70">
                Step {s.step}
              </span>
              <h3 className="mt-1 text-xl font-semibold">{s.title}</h3>
              <p className="mt-2 max-w-xs text-muted-foreground">
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
