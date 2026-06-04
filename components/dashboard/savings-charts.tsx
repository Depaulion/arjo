import { PieChart as PieIcon } from "lucide-react";

export type AllocationSlice = {
  label: string;
  value: number;
  /** Any CSS color (we pass hsl(var(--token)) values). */
  color: string;
};

export type ActivityBar = {
  label: string;
  value: number;
};

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/** Sleek donut for portfolio allocation, drawn with stacked SVG arcs. */
function Donut({
  slices,
  currency,
}: {
  slices: AllocationSlice[];
  currency: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 52;
  const STROKE = 18;
  const C = 2 * Math.PI * R;

  let offset = 0;
  const arcs =
    total > 0
      ? slices
          .filter((s) => s.value > 0)
          .map((s) => {
            const frac = s.value / total;
            const len = frac * C;
            const dash = `${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`;
            const dashoffset = -offset;
            offset += len;
            return { ...s, dash, dashoffset, frac };
          })
      : [];

  return (
    <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center sm:gap-6">
      <div className="relative h-40 w-40 shrink-0">
        <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
          {/* track */}
          <circle
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke="hsl(var(--muted))"
            strokeWidth={STROKE}
          />
          {arcs.map((a, i) => (
            <circle
              key={i}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={a.dash}
              strokeDashoffset={a.dashoffset}
              strokeLinecap="round"
              className="transition-[stroke-dasharray] duration-700 ease-out"
            />
          ))}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-2xl font-bold leading-none tabular-nums">
            {fmt(total)}
          </span>
          <span className="mt-1 text-[11px] text-muted-foreground">
            {currency} total
          </span>
        </div>
      </div>

      <ul className="w-full space-y-2">
        {slices.map((s) => {
          const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
          return (
            <li
              key={s.label}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: s.color }}
                />
                <span className="truncate text-muted-foreground">
                  {s.label}
                </span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">
                {fmt(s.value)}{" "}
                <span className="text-muted-foreground">· {pct}%</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Sleek gradient bar chart for recent weekly savings activity. */
function Bars({ bars, currency }: { bars: ActivityBar[]; currency: string }) {
  const max = Math.max(1, ...bars.map((b) => b.value));
  return (
    <div className="flex h-40 items-end justify-between gap-2">
      {bars.map((b, i) => {
        const h = Math.round((b.value / max) * 100);
        return (
          <div
            key={i}
            className="group flex h-full flex-1 flex-col items-center justify-end gap-2"
          >
            <span className="text-[10px] font-medium tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
              {b.value > 0 ? fmt(b.value) : ""}
            </span>
            <div className="flex w-full flex-1 items-end">
              <div
                className="w-full rounded-t-md bg-gradient-to-t from-primary/40 to-primary transition-all duration-500 ease-out group-hover:from-accent/50 group-hover:to-accent"
                style={{ height: `${b.value > 0 ? Math.max(6, h) : 2}%` }}
                title={`${fmt(b.value)} ${currency}`}
              />
            </div>
            <span className="text-[10px] text-muted-foreground">{b.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Analytics panel: a portfolio-allocation donut beside a weekly-activity bar
 * chart. Pure SVG/CSS — no chart dependency — so it renders on the server and
 * inherits the magenta/violet theme tokens.
 */
export function SavingsCharts({
  allocation,
  activity,
  currency = "USDC",
}: {
  allocation: AllocationSlice[];
  activity: ActivityBar[];
  currency?: string;
}) {
  const hasAllocation = allocation.some((s) => s.value > 0);
  const hasActivity = activity.some((b) => b.value > 0);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-border bg-secondary/20 p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Portfolio allocation</p>
          <span className="text-muted-foreground">
            <PieIcon className="h-4 w-4" />
          </span>
        </div>
        {hasAllocation ? (
          <Donut slices={allocation} currency={currency} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Fund your wallet or lock a vault to see your allocation.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-secondary/20 p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-sm font-semibold">Savings activity</p>
          <span className="text-xs text-muted-foreground">last 8 weeks</span>
        </div>
        {hasActivity ? (
          <Bars bars={activity} currency={currency} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No contributions yet — your weekly inflow will chart here.
          </p>
        )}
      </div>
    </div>
  );
}
