"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Coins,
  ExternalLink,
  Gift,
  Loader2,
  Lock,
  RefreshCw,
  Repeat,
  TriangleAlert,
  X,
} from "lucide-react";

import { arcTxUrl, shortenHex } from "@/lib/arc";
import type { LedgerEntry, LedgerKind, LedgerStatus } from "@/lib/types";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function timeOnly(iso: string) {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Group label for a calendar day: Today / Yesterday / "Mon, Jun 2". */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const KIND_META: Record<
  LedgerKind,
  { label: string; icon: React.ReactNode; outgoing: boolean }
> = {
  contribution: {
    label: "Contribution",
    icon: <ArrowUpRight className="h-4 w-4" />,
    outgoing: true,
  },
  lock: {
    label: "SafeLock deposit",
    icon: <Lock className="h-4 w-4" />,
    outgoing: true,
  },
  autosave: {
    label: "Auto-save",
    icon: <Repeat className="h-4 w-4" />,
    outgoing: true,
  },
  withdraw: {
    label: "Withdrawal",
    icon: <ArrowDownLeft className="h-4 w-4" />,
    outgoing: false,
  },
  payout: {
    label: "Payout",
    icon: <ArrowDownLeft className="h-4 w-4" />,
    outgoing: false,
  },
  penalty: {
    label: "Penalty",
    icon: <TriangleAlert className="h-4 w-4" />,
    outgoing: true,
  },
  bonus: {
    label: "USYC yield",
    icon: <Gift className="h-4 w-4" />,
    outgoing: false,
  },
  bond: {
    label: "Bond posted",
    icon: <Lock className="h-4 w-4" />,
    outgoing: true,
  },
  bond_refund: {
    label: "Bond refunded",
    icon: <ArrowDownLeft className="h-4 w-4" />,
    outgoing: false,
  },
  bond_slash: {
    label: "Bond slashed",
    icon: <TriangleAlert className="h-4 w-4" />,
    outgoing: true,
  },
  bond_yield: {
    label: "Bond yield",
    icon: <Coins className="h-4 w-4" />,
    outgoing: false,
  },
};

const STATUS_META: Record<
  LedgerStatus,
  { label: string; className: string; icon: React.ReactNode }
> = {
  pending: {
    label: "Pending",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-500",
    icon: <Clock className="h-3 w-3" />,
  },
  confirmed: {
    label: "Confirmed",
    className: "border-primary/30 bg-primary/10 text-primary",
    icon: <CheckCircle2 className="h-3 w-3" />,
  },
  failed: {
    label: "Failed",
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    icon: <TriangleAlert className="h-3 w-3" />,
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
  const [cancelling, setCancelling] = useState<string | null>(null);

  async function cancelOffRamp(id: string) {
    setCancelling(id);
    setNotice(null);
    const res = await fetch(`/api/ramp/offramp/${id}/cancel`, {
      method: "POST",
    });
    const json = await res.json().catch(() => ({}));
    setCancelling(null);
    if (res.ok) {
      setNotice("Off-ramp request cancelled.");
      router.refresh();
    } else {
      setNotice(json.error ?? "Could not cancel this request.");
    }
  }

  // Entries arrive newest-first; bucket them into ordered day groups.
  const groups = useMemo(() => {
    const map = new Map<string, LedgerEntry[]>();
    for (const e of entries) {
      const key = dayLabel(e.created_at);
      const list = map.get(key);
      if (list) list.push(e);
      else map.set(key, [e]);
    }
    return Array.from(map.entries());
  }, [entries]);

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
      <div className="rounded-xl border border-dashed border-border py-10 text-center">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-secondary/60">
          <Coins className="h-5 w-5 text-muted-foreground" />
        </span>
        <p className="mx-auto mt-3 max-w-xs text-sm text-muted-foreground">
          No activity yet. Contribute to a circle or open a SafeLock vault and
          your USDC actions will appear here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 rounded-full bg-secondary/60 px-3 py-1 text-xs font-medium text-muted-foreground">
          {entries.length} {entries.length === 1 ? "action" : "actions"}
        </span>
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

      {/* Day-grouped timeline */}
      <div className="space-y-5">
        {groups.map(([label, rows]) => (
          <div key={label} className="space-y-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <ul className="overflow-hidden rounded-xl border border-border/60 bg-secondary/20">
              {rows.map((e) => {
                const meta = KIND_META[e.kind];
                const status = STATUS_META[e.status];
                // A pending off-ramp request: a withdraw with no onchain
                // footprint, so it will never auto-settle and can be cancelled.
                const cancellable =
                  e.status === "pending" &&
                  e.kind === "withdraw" &&
                  !e.tx_hash &&
                  !e.circle_tx_id;
                return (
                  <li
                    key={e.id}
                    className="flex items-center justify-between gap-3 border-b border-border/50 px-3 py-3 last:border-b-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                          meta.outgoing
                            ? "bg-accent/15 text-accent-foreground"
                            : "bg-primary/10 text-primary"
                        }`}
                      >
                        {meta.icon}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {meta.label}
                        </p>
                        {e.note && (
                          <p className="truncate text-xs text-muted-foreground">
                            {e.note}
                          </p>
                        )}
                        <p className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{timeOnly(e.created_at)}</span>
                          {e.tx_hash && (
                            <a
                              href={arcTxUrl(e.tx_hash)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-mono hover:text-primary hover:underline"
                            >
                              {shortenHex(e.tx_hash)}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`text-sm font-semibold ${
                          meta.outgoing ? "text-foreground" : "text-primary"
                        }`}
                      >
                        {meta.outgoing ? "−" : "+"}
                        {fmt(e.amount)} {e.currency}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${status.className}`}
                      >
                        {status.icon}
                        {status.label}
                      </span>
                      {cancellable && (
                        <button
                          type="button"
                          onClick={() => cancelOffRamp(e.id)}
                          disabled={cancelling === e.id}
                          className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground transition-colors hover:text-destructive disabled:opacity-60"
                        >
                          {cancelling === e.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                          Cancel
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
