"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  History,
  Home,
  Settings,
  Sparkles,
  Target,
  Users,
  Vault,
} from "lucide-react";

import { cn } from "@/lib/utils";

const TABS = [
  { id: "home", label: "Home", icon: Home },
  { id: "goals", label: "Goals", icon: Target },
  { id: "save", label: "Save", icon: Vault },
  { id: "benefits", label: "Benefits", icon: Sparkles },
  { id: "stats", label: "Stats", icon: BarChart3 },
  { id: "circles", label: "Circles", icon: Users },
  { id: "activity", label: "Activity", icon: History },
] as const;

type TabId = (typeof TABS)[number]["id"];
type View = TabId | "settings";

/**
 * Legacy hash anchors (used by notifications, the header avatar and in-card
 * CTAs like `#save`) mapped to the new tabbed views, so every existing deep
 * link keeps working after the switch from one long scroll to real tabs.
 */
const HASH_TO_VIEW: Record<string, View> = {
  overview: "home",
  analytics: "stats",
  save: "save",
  benefits: "benefits",
  community: "circles",
  activity: "activity",
  settings: "settings",
  goals: "goals",
};

/**
 * Turns the dashboard into a real tabbed app: only the active tab's content is
 * mounted on screen, with a floating bottom nav to switch. This keeps each
 * screen focused (one job at a time) instead of one long scroll.
 */
export function DashboardTabs({
  home,
  goals,
  save,
  benefits,
  stats,
  circles,
  activity,
  settings,
}: {
  home: React.ReactNode;
  goals: React.ReactNode;
  save: React.ReactNode;
  benefits: React.ReactNode;
  stats: React.ReactNode;
  circles: React.ReactNode;
  activity: React.ReactNode;
  settings: React.ReactNode;
}) {
  const [active, setActive] = useState<View>("home");

  // Honour hash links from anywhere (header avatar, notifications, CTAs).
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash.replace("#", "");
      const view = HASH_TO_VIEW[h];
      if (view) {
        setActive(view);
        window.scrollTo({ top: 0 });
      }
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  const select = (view: View) => {
    setActive(view);
    // Clear any lingering hash so re-clicking the same anchor still works.
    if (window.location.hash) {
      history.replaceState(null, "", window.location.pathname);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const views: Record<View, React.ReactNode> = {
    home,
    goals,
    save,
    benefits,
    stats,
    circles,
    activity,
    settings,
  };

  // Sidebar shows the tabs plus Settings (reachable via the header menu on
  // mobile, but a first-class nav item on desktop).
  const NAV: { id: View; label: string; icon: typeof Home }[] = [
    ...TABS.map((t) => ({ id: t.id as View, label: t.label, icon: t.icon })),
    { id: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <>
      {/* On desktop (lg+) a two-column app: a sticky sidebar nav beside a wide
          content area. On mobile it collapses to a single centered column with
          the floating bottom nav below. */}
      <div className="mx-auto w-full max-w-6xl px-4 lg:flex lg:gap-8 lg:px-6 lg:py-8">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block lg:w-56 lg:shrink-0">
          <nav className="sticky top-24 space-y-1">
            {NAV.map((it) => {
              const Icon = it.icon;
              const isActive = active === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => select(it.id)}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {it.label}
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content — narrow & centered on mobile, wide & flexible on desktop. */}
        <main className="mx-auto max-w-3xl space-y-5 py-6 pb-28 lg:mx-0 lg:max-w-none lg:flex-1 lg:py-0 lg:pb-0">
          {views[active]}
        </main>
      </div>

      {/* Mobile floating bottom nav (hidden on desktop, which uses the sidebar). */}
      <nav className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4 lg:hidden">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-card/80 p-1.5 shadow-xl shadow-black/20 backdrop-blur-md">
          {TABS.map((it) => {
            const Icon = it.icon;
            const isActive = active === it.id;
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => select(it.id)}
                aria-label={it.label}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium transition-all duration-300",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className={isActive ? "inline" : "hidden sm:inline"}>
                  {it.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
