import Image from "next/image";
import { CircleDollarSign, RefreshCw, type LucideIcon } from "lucide-react";

type Partner = {
  name: string;
  tint: string;
  logo?: string;
  icon?: LucideIcon;
};

/**
 * "Built on Arc" trust strip — a slim credibility band placed directly under the
 * hero. Surfaces the stack the app is built on (Arc · Circle · USDC) plus the
 * three brand pills, mirroring the marketing one-pager. Deliberately badge-only:
 * the value props live in <Features /> and <HowItWorks /> below, so this never
 * duplicates them.
 *
 * Arc uses the official brand mark (drop the file at public/brand/arc-logo.png).
 * Circle and USDC are rendered as styled icon wordmarks from the app's own design
 * tokens — swap in their official SVGs here later if/when they're available.
 */
const PARTNERS = [
  {
    name: "Arc",
    logo: "/brand/arc-logo.png",
    tint: "text-primary",
  },
  { name: "Circle", icon: RefreshCw, tint: "text-accent" },
  { name: "USDC", icon: CircleDollarSign, tint: "text-sky-400" },
];

const PILLS = [
  { label: "Secure", className: "bg-primary/15 text-primary" },
  { label: "Transparent", className: "bg-accent/15 text-accent" },
  { label: "Community Driven", className: "bg-sky-500/15 text-sky-400" },
];

export function TrustBar() {
  return (
    <section className="border-y border-border/60 bg-secondary/20">
      <div className="container flex flex-col items-center gap-6 py-8 lg:flex-row lg:justify-between lg:gap-8">
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:gap-8">
          <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Built on Arc
          </span>
          <div className="flex items-center gap-6 sm:gap-8">
            {PARTNERS.map((p) => (
              <span
                key={p.name}
                className="flex items-center gap-2 text-base font-bold tracking-tight"
              >
                {p.logo ? (
                  <Image
                    src={p.logo}
                    alt={`${p.name} logo`}
                    width={24}
                    height={24}
                    className="h-6 w-6 rounded-md"
                  />
                ) : (
                  p.icon && <p.icon className={`h-5 w-5 ${p.tint}`} />
                )}
                {p.name}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {PILLS.map((pill) => (
            <span
              key={pill.label}
              className={`rounded-full px-4 py-1.5 text-xs font-semibold ${pill.className}`}
            >
              {pill.label}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
