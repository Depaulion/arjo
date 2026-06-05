"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggle: () => void;
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

const STORAGE_KEY = "arjo-theme";

/**
 * Lightweight class-based theme provider (no external deps). The actual class
 * is applied to <html> by an inline script in the root layout BEFORE paint to
 * avoid a flash; this provider just keeps React state in sync and persists the
 * user's choice. Default is light — the consumer fintech look — with dark as an
 * opt-in toggle.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // Hydrate from the class the inline script already set (or storage).
  useEffect(() => {
    const stored = (() => {
      try {
        return localStorage.getItem(STORAGE_KEY) as Theme | null;
      } catch {
        return null;
      }
    })();
    const initial: Theme =
      stored ??
      (document.documentElement.classList.contains("dark") ? "dark" : "light");
    setThemeState(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    try {
      localStorage.setItem(STORAGE_KEY, t);
    } catch {
      /* storage unavailable — non-fatal */
    }
    document.documentElement.classList.toggle("dark", t === "dark");
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "dark" ? "light" : "dark"),
    [theme, setTheme]
  );

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
