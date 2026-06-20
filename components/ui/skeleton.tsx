import { cn } from "@/lib/utils";

/**
 * A subtle pulsing placeholder block. Compose these into route-level loading.tsx
 * skeletons that mirror the real layout, so navigation feels instant and premium
 * instead of flashing a spinner or a blank screen.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-secondary/70", className)}
      {...props}
    />
  );
}
