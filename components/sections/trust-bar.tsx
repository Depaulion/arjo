import Image from "next/image";

/**
 * "Built on Arc" trust strip — a slim credibility band placed directly under the
 * hero. Surfaces the stack the app is built on (Arc · Circle · USDC) plus the
 * three brand pills, mirroring the marketing one-pager. Deliberately badge-only:
 * the value props live in <Features /> and <HowItWorks /> below, so this never
 * duplicates them.
 *
 * All three use their official brand marks. Files live at:
 *   public/brand/arc-logo.jpg    (icon-only mark — we render "Arc" beside it)
 *   public/brand/circle-logo.jpg (full lockup — already includes the name)
 *   public/brand/usdc-logo.jpg   (full lockup — already includes the name)
 * The intrinsic width/height below just set each image's aspect ratio so it's
 * displayed at a uniform 24px height without distortion.
 */
type Partner = {
  name: string;
  logo: string;
  width: number;
  height: number;
  /** true when the logo image already contains the brand name (a lockup). */
  lockup?: boolean;
  /** extra classes for the <Image> (e.g. rounding for the square Arc tile). */
  imgClassName?: string;
};

const PARTNERS: Partner[] = [
  {
    name: "Arc",
    logo: "/brand/arc-logo.jpg",
    width: 24,
    height: 24,
    imgClassName: "rounded-md",
  },
  {
    name: "Circle",
    logo: "/brand/circle-logo.jpg",
    width: 90,
    height: 24,
    lockup: true,
  },
  {
    name: "USDC",
    logo: "/brand/usdc-logo.jpg",
    width: 87,
    height: 24,
    lockup: true,
  },
];

const PILLS = [
  { label: "Secure", className: "bg-primary/15 text-primary" },
  { label: "Transparent", className: "bg-accent/15 text-accent" },
  { label: "Private by design", className: "bg-emerald-500/15 text-emerald-400" },
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
                <Image
                  src={p.logo}
                  alt={`${p.name} logo`}
                  width={p.width}
                  height={p.height}
                  unoptimized
                  className={`h-6 w-auto object-contain ${p.imgClassName ?? ""}`}
                />
                {!p.lockup && p.name}
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
