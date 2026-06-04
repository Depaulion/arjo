"use client";

import { useState, type ReactNode } from "react";
import { LayoutDashboard, Vote } from "lucide-react";

import { cn } from "@/lib/utils";

type Tab = "overview" | "governance";

/**
 * Tabs for a circle page. Both panels are server-rendered and passed in as
 * props; this client wrapper only toggles which one is visible, so it adds tab
 * navigation without changing how either panel is built.
 */
export function CircleTabs({
  overview,
  governance,
  proposalCount,
}: {
  overview: ReactNode;
  governance: ReactNode;
  proposalCount: number;
}) {
  const [tab, setTab] = useState<Tab>("overview");

  const tabs: { value: Tab; label: string; icon: typeof Vote; badge?: number }[] =
    [
      { value: "overview", label: "Overview", icon: LayoutDashboard },
      {
        value: "governance",
        label: "Governance",
        icon: Vote,
        badge: proposalCount || undefined,
      },
    ];

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/40 p-1">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setTab(t.value)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground shadow"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
              {t.label}
              {t.badge ? (
                <span
                  className={cn(
                    "rounded-full px-1.5 text-xs",
                    active
                      ? "bg-primary-foreground/20"
                      : "bg-primary/15 text-primary",
                  )}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className={tab === "overview" ? "block" : "hidden"}>{overview}</div>
      <div className={tab === "governance" ? "block" : "hidden"}>
        {governance}
      </div>
    </div>
  );
}
