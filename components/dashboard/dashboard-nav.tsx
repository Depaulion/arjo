"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  BarChart3,
  Check,
  Compass,
  Copy,
  ExternalLink,
  FileText,
  History,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  Plus,
  ShieldCheck,
  Vault,
  Wallet,
  X,
} from "lucide-react";

import { arcAddressUrl, shortenHex } from "@/lib/arc";
import { Button } from "@/components/ui/button";

const SECTIONS = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "analytics", label: "Analytics", icon: BarChart3 },
  { id: "save", label: "Save", icon: Vault },
  { id: "activity", label: "Activity", icon: History },
  { id: "community", label: "Community", icon: Compass },
];

const itemClass =
  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

/**
 * Professional header nav for the dashboard: a primary "New circle" CTA on
 * desktop plus a hamburger menu that opens a dropdown with section jump-links
 * and account actions. Closes on outside-click, Escape, or selecting an item.
 */
export function DashboardNav({
  walletAddress = null,
  currency = "USDC",
  isAdmin = false,
}: {
  walletAddress?: string | null;
  currency?: string;
  isAdmin?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  async function copyAddress() {
    if (!walletAddress) return;
    try {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently ignore.
    }
  }

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
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        asChild
        className="hidden sm:inline-flex"
      >
        <Link href="/circles/new">
          <Plus className="h-4 w-4" />
          New circle
        </Link>
      </Button>

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-border/60 bg-card/60 text-foreground transition-colors hover:border-primary/40 hover:text-primary"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {open && (
          <div className="absolute right-0 top-12 z-50 w-60 overflow-hidden rounded-2xl border border-border/60 bg-card/95 p-2 shadow-2xl shadow-black/50 backdrop-blur-md">
            <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Jump to
            </p>
            {SECTIONS.map((s) => {
              const Icon = s.icon;
              return (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={() => setOpen(false)}
                  className={itemClass}
                >
                  <Icon className="h-4 w-4" />
                  {s.label}
                </a>
              );
            })}

            <div className="my-2 h-px bg-border/60" />

            {/* Wallet — show the Arc address with copy + explorer shortcuts. */}
            <p className="px-3 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Wallet
            </p>
            {walletAddress ? (
              <div className="rounded-xl bg-secondary/40 px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Wallet className="h-4 w-4 text-primary" />
                  <span className="font-mono">{shortenHex(walletAddress)}</span>
                  <span className="ml-auto rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                    {currency}
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={copyAddress}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-primary" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        Copy
                      </>
                    )}
                  </button>
                  <a
                    href={arcAddressUrl(walletAddress)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setOpen(false)}
                    className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border px-2 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Explorer
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2.5 text-xs text-muted-foreground">
                <Wallet className="h-4 w-4" />
                Wallet provisioning…
              </div>
            )}

            <div className="my-2 h-px bg-border/60" />

            <Link
              href="/circles/new"
              onClick={() => setOpen(false)}
              className={`${itemClass} text-foreground sm:hidden`}
            >
              <Plus className="h-4 w-4 text-primary" />
              New circle
            </Link>
            <Link
              href="/docs"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <FileText className="h-4 w-4" />
              Docs
            </Link>
            <Link
              href="/support"
              onClick={() => setOpen(false)}
              className={itemClass}
            >
              <LifeBuoy className="h-4 w-4" />
              Help &amp; support
            </Link>
            {isAdmin && (
              <Link
                href="/admin/support"
                onClick={() => setOpen(false)}
                className={`${itemClass} text-foreground`}
              >
                <ShieldCheck className="h-4 w-4 text-primary" />
                Support inbox
              </Link>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
