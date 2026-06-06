"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bell,
  Coins,
  Flame,
  Gift,
  PartyPopper,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Users,
  Vote,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type NotificationTone = "welcome" | "reminder" | "info" | "alert";

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  icon: keyof typeof ICONS;
  tone: NotificationTone;
  href?: string;
};

const ICONS = {
  welcome: PartyPopper,
  wallet: Wallet,
  faucet: Coins,
  streak: Flame,
  vote: Vote,
  members: Users,
  sync: RefreshCw,
  spark: Sparkles,
  alert: AlertTriangle,
  shield: ShieldCheck,
  gift: Gift,
} satisfies Record<string, LucideIcon>;

const TONE_STYLES: Record<NotificationTone, string> = {
  welcome: "bg-primary/15 text-primary",
  reminder: "bg-amber-500/15 text-amber-500",
  info: "bg-secondary text-muted-foreground",
  alert: "bg-red-500/15 text-red-500",
};

/**
 * Header notification bell. Opens a dropdown that greets the user and surfaces
 * gentle reminders (set up wallet, claim faucet, keep your streak, open votes,
 * pending settlements). Reminders are computed server-side and passed in, so
 * this component stays presentational. Closes on Escape / outside-click.
 */
export function NotificationBell({
  notifications,
}: {
  notifications: AppNotification[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Anything that isn't the welcome greeting counts toward the unread badge.
  const actionable = notifications.filter((n) => n.tone !== "welcome").length;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        aria-expanded={open}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition-colors hover:border-primary/40 hover:text-primary"
      >
        <Bell className="h-5 w-5" />
        {actionable > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {actionable}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-border/60 bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {actionable > 0 && (
              <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                {actionable} new
              </span>
            )}
          </div>

          <div className="max-h-[22rem] divide-y divide-border/50 overflow-y-auto">
            {notifications.map((n) => {
              const Icon = ICONS[n.icon] ?? ICONS.spark;
              const inner = (
                <div className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/40">
                  <span
                    className={cn(
                      "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      TONE_STYLES[n.tone]
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-snug">{n.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {n.body}
                    </p>
                  </div>
                </div>
              );
              return n.href ? (
                <Link
                  key={n.id}
                  href={n.href}
                  onClick={() => setOpen(false)}
                  className="block"
                >
                  {inner}
                </Link>
              ) : (
                <div key={n.id}>{inner}</div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
