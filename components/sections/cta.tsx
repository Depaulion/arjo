import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";

export function CTA() {
  return (
    <section id="cta" className="py-20 lg:py-28">
      <div className="container">
        <div className="relative overflow-hidden rounded-3xl bg-primary px-6 py-16 text-center text-primary-foreground sm:px-12 lg:py-20">
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-accent/30 blur-3xl" />
            <div className="absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-2xl">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Your community is ready to save. Are you?
            </h2>
            <p className="mt-4 text-lg text-primary-foreground/80">
              Join the waitlist and start your first stablecoin Ajo in minutes.
              No bank account required — just a wallet and people you trust.
            </p>

            <form className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:flex-row">
              <input
                type="email"
                required
                placeholder="you@email.com"
                className="h-12 flex-1 rounded-full border border-white/20 bg-white/10 px-5 text-sm text-primary-foreground placeholder:text-primary-foreground/60 focus:outline-none focus:ring-2 focus:ring-white/40"
              />
              <Button type="submit" variant="accent" size="lg">
                Join the waitlist
                <ArrowRight />
              </Button>
            </form>

            <p className="mt-4 text-xs text-primary-foreground/60">
              Be among the first circles. No spam, unsubscribe anytime.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
