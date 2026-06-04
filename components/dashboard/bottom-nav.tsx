"use client";

import { useEffect, useState } from "react";
import { BarChart3, History, Home, Users, Vault } from "lucide-react";

import { cn } from "@/lib/utils";

const ITEMS = [
  { id: "overview", label: "Home", icon: Home },
  { id: "analytics", label: "Stats", icon: BarChart3 },
  { id: "save", label: "Save", icon: Vault },
  { id: "community", label: "Circles", icon: Users },
  { id: "activity", label: "Activity", icon: History },
] as const;

/**
 * Floating pill bottom-nav for the dashboard. Smooth-scrolls to each section
 * (anchors are matching `id`s on the page) and highlights the section currently
 * in view via an IntersectionObserver scroll-spy.
 */
export function BottomNav() {
  const [active, setActive] = useState<string>("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    for (const it of ITEMS) {
      const el = document.getElementById(it.id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="pointer-events-none fixed inset-x-0 bottom-5 z-50 flex justify-center px-4">
      <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-card/80 p-1.5 shadow-xl shadow-black/40 backdrop-blur-md">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const isActive = active === it.id;
          return (
            <a
              key={it.id}
              href={`#${it.id}`}
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
            </a>
          );
        })}
      </div>
    </nav>
  );
}
