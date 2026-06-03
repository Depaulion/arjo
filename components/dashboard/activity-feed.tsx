"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Coins,
  Gift,
  Loader2,
  Lock,
  RefreshCw,
  Repeat,
  TriangleAlert,
} from "lucide-react";

import { arcTxUrl, shortenHex } from "@/lib/arc";
import type { LedgerEntry, LedgerKind, LedgerStatus } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const KIND_META: Record<
  LedgerKind,
  { label: string; icon: React.ReactNode; outgoing: boolean }
> = {
  contribution: { label: "Contribution", icon: <ArrowUpRight className="h-4 w-4" />, outgoing: true },
  lock: { label: "SafeLock deposit", icon: <Lock className="h-4 w-4" />, outgoing: true },
  autosave: { label: "Auto-save", icon: <Repeat className="h-4 w-4" />, outgoing: true },
  withdraw: { label: "Withdrawal", icon: <ArrowDownLeft className="h-4 w-4" />, outgoing: false },
  payout: { label: "Payout", icon: <ArrowDownLeft className="h-4 w-4" />, outgoing: false },
  penalty: { label: "Penalty", icon: <TriangleAlert className="h-4 w-4" />, outgoing: true },
  bonus: { label: "Yield bonus", icon: <Gift className="h-4 w-4" />, outgoing: false },
};

const STATUS_META: Record<
  LedgerStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    className: "text-amber-500",
    icon: <Clock className="h-3.5 w-3.5" />,
  },
  confirmed: {
    label: "Confirmed",
    className: "text-primary",
    icon: <CheckCircle2 className="h-3.5 w-3.5" />,
  },
  failed: {
    label: "Failed",
    className: "text-destructive",
    icon: <TriangleAlert className="h-3.5 w-3.5" />,
  },
};

export function ActivityFeed({
  entries,
  hasPending,
}: {
  entries: LedgerEntry[];
  /** True when at least one entry is pending with a Circle tx to poll. */
  hasPending: boolean;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function sync() {
    setSyncing(true);
    setNotice(null);
    const res = await fetch("/api/ledger/reconcile", { method: "POST" });
    const json = await res.json().catch(() => ({}));
    setSyncing(false);
    if (res.ok && json.summary) {
      const { confirmed, failed, stillPending } = json.summary;
      setNotice(
        `Synced — ${confirmed} confirmed, ${failed} failed, ${stillPending} still pending.`
      );
      router.refresh();
    } else {
      setNotice(json.error ?? "Could not sync settlement status.");
    }
  }

  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border py-8 text-center">
        <Coins className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">
          No activity yet. Contribute to a circle or open a SafeLock vault and
          your USDC actions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Every USDC action, settled on Arc Testnet.
        </p>
        {hasPending && (
          <button
            onClick={sync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
          >
            {syncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Sync status
          </button>
        )}
      </div>

      {notice && (
        <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-xs text-primary">
          {notice}
        </p>
      )}

      <ul className="divide-y divide-border">
        {entries.map((e) => {
          const meta = KIND_META[e.kind];
          const status = STATUS_META[e.status];
          return (
            <li
              key={e.id}
              className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${
                    meta.outgoing
                      ? "bg-accent/15 text-accent-foreground"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {meta.icon}
                </span>
                <div>
                  <p className="text-sm font-medium">{meta.label}</p>
                  <p className="flex items-center gap-2 text-xs text-muted-foreground">
                    {formatDateTime(e.created_at)}
                    {e.tx_hash && (
                      <a
                        href={arcTxUrl(e.tx_hash)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono hover:text-primary hover:underline"
                      >
                        {shortenHex(e.tx_hash)}
                      </a>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={`text-sm font-semibold ${
                    meta.outgoing ? "text-foreground" : "text-primary"
                  }`}
                >
                  {meta.outgoing ? "−" : "+"}
                  {fmt(e.amount)} {e.currency}
                </span>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-medium ${status.className}`}
                >
                  {status.icon}
                  {status.label}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
