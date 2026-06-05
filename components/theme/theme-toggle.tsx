"use client";

import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/theme/theme-provider";

/** Sun/moon button that flips between light and dark. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition-colors hover:border-primary/40 hover:text-primary"
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5" />
      ) : (
        <Moon className="h-5 w-5" />
      )}
    </button>
  );
}
