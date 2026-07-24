"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownToLine,
  Check,
  ChevronLeft,
  ExternalLink,
  Loader2,
  Lock,
  Users,
  Vault,
  Wallet,
} from "lucide-react";

import { arcTxUrl, shortenHex } from "@/lib/arc";

export type WithdrawVault = {
  id: string;
  name: string;
  principal: number;
  currency: string;
  planType: "flex" | "locked" | "target" | "auto";
  lockUntil: string | null;
};

export type WithdrawCircle = {
  id: string;
  name: string;
  role: "creator" | "member";
  status: "forming" | "active" | "completed";
};

type Mode = "cashout" | "vaults" | "circle";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function WithdrawFlow({
  walletAddress,
  balance,
  currency,
  vaults,
  circles,
  userId,
}: {
  walletAddress: string | null;
  balance: number | null;
  currency: string;
  vaults: WithdrawVault[];
  circles: WithdrawCircle[];
  userId: string;
}) {
  const [mode, setMode] = useState<Mode>("cashout");

  const TABS: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "cashout", label: "Cash out", icon: <Wallet className="h-4 w-4" /> },
    { id: "vaults", label: "Vaults", icon: <Vault className="h-4 w-4" /> },
    { id: "circle", label: "Circle", icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      {/* Mode switch */}
      <div className="grid grid-cols-3 gap-2 rounded-2xl border border-border/60 bg-card p-1.5">
        {TABS.map((t) => {
          const active = mode === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`flex items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {mode === "cashout" && (
        <CashOut
          walletAddress={walletAddress}
          balance={balance}
          currency={currency}
        />
      )}
      {mode === "vaults" && <Vaults vaults={vaults} currency={currency} />}
      {mode === "circle" && <CircleExit circles={circles} userId={userId} />}
    </div>
  );
}

/* --------------------------------- Cash out -------------------------------- */

function CashOut({
  walletAddress,
  balance,
  currency,
}: {
  walletAddress: string | null;
  balance: number | null;
  currency: string;
}) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [address, setAddress] = useState("");
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ txHash: string | null; pending: boolean } | null>(
    null
  );

  const amountNum = Number(amount);
  const amountValid =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (balance === null || amountNum <= balance);
  const addressValid = ADDRESS_RE.test(address.trim());
  const canReview = amountValid && addressValid && Boolean(walletAddress);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/wallet/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amountNum, toAddress: address.trim() }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Withdrawal failed.");
        setStep("form");
        return;
      }
      setResult({ txHash: json.transfer?.txHash ?? null, pending: json.pending });
      setStep("done");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  if (!walletAddress) {
    return (
      <Notice>
        Your wallet is still being set up. Once it&apos;s ready you can cash
        out to any address.
      </Notice>
    );
  }

  if (step === "done" && result) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </span>
        <p className="mt-3 text-lg font-semibold">
          {result.pending ? "Withdrawal submitted" : "Withdrawal sent"}
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmt(amountNum)} {currency} to {shortenHex(address.trim())}.
          {result.pending
            ? " It will settle on Arc shortly — track it in Activity."
            : ""}
        </p>
        {result.txHash && (
          <a
            href={arcTxUrl(result.txHash)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1.5 rounded-2xl bg-secondary px-4 py-2.5 text-sm font-medium transition-colors hover:bg-secondary/70"
          >
            View on explorer
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
    );
  }

  if (step === "review") {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
        <button
          type="button"
          onClick={() => setStep("form")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Edit
        </button>
        <p className="mt-3 text-sm text-muted-foreground">You&apos;re sending</p>
        <p className="text-3xl font-bold tracking-tight">
          {fmt(amountNum)}{" "}
          <span className="text-lg font-semibold text-muted-foreground">
            {currency}
          </span>
        </p>
        <div className="mt-4 space-y-2 rounded-2xl bg-secondary/50 p-4 text-sm">
          <Row label="To" value={shortenHex(address.trim(), 10, 8)} />
          <Row label="Network" value="Arc Testnet" />
          <Row label="Fee" value="Network fee (paid in gas)" />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          onchain transfers are irreversible. Double-check the address before
          confirming.
        </p>
        {error && <ErrorText>{error}</ErrorText>}
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowDownToLine className="h-4 w-4" />
          )}
          Confirm withdrawal
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor="wd-amount">
          Amount
        </label>
        <span className="text-xs text-muted-foreground">
          Available: {balance === null ? "—" : `${fmt(balance)} ${currency}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3">
        <input
          id="wd-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-sm font-medium text-muted-foreground">
          {currency}
        </span>
        {balance !== null && balance > 0 && (
          <button
            type="button"
            onClick={() => setAmount(String(balance))}
            className="rounded-lg bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
          >
            Max
          </button>
        )}
      </div>

      <label className="mt-4 block text-sm font-medium" htmlFor="wd-address">
        Destination address
      </label>
      <input
        id="wd-address"
        placeholder="0x…"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        spellCheck={false}
        className="mt-2 w-full rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 font-mono text-sm outline-none focus:border-primary/50"
      />
      {address.length > 0 && !addressValid && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
          Enter a valid Arc address (0x followed by 40 hex characters).
        </p>
      )}
      {amount.length > 0 && !amountValid && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
          {balance !== null && amountNum > balance
            ? `You can withdraw at most ${fmt(balance)} ${currency}.`
            : "Enter an amount greater than zero."}
        </p>
      )}
      {error && <ErrorText>{error}</ErrorText>}

      <button
        type="button"
        disabled={!canReview}
        onClick={() => setStep("review")}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        Review withdrawal
      </button>
    </div>
  );
}

/* ---------------------------------- Vaults --------------------------------- */

function Vaults({
  vaults,
  currency,
}: {
  vaults: WithdrawVault[];
  currency: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});

  async function withdraw(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/savings/${id}/withdraw`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Withdrawal failed.");
        return;
      }
      const msg = json.isEarly
        ? `Withdrew ${fmt(json.payout)} ${currency} (−${fmt(json.penalty)} penalty)`
        : `Withdrew ${fmt(json.payout)} ${currency}${
            json.bonus > 0 ? ` (+${fmt(json.bonus)} bonus)` : ""
          }`;
      setDone((d) => ({ ...d, [id]: msg }));
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (vaults.length === 0) {
    return (
      <Notice>
        You have no active vaults to withdraw. Lock funds in a SafeLock vault
        from the Save tab to earn a yield bonus.
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      {vaults.map((v) => {
        const locked =
          v.planType === "locked" &&
          v.lockUntil !== null &&
          new Date(v.lockUntil) > new Date();
        const finished = done[v.id];
        return (
          <div
            key={v.id}
            className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{v.name}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {fmt(v.principal)} {v.currency} locked
                </p>
              </div>
              {locked ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-600 dark:text-amber-500">
                  <Lock className="h-3 w-3" />
                  Locked
                </span>
              ) : (
                <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                  Matured
                </span>
              )}
            </div>

            {locked && (
              <p className="mt-2 text-xs text-muted-foreground">
                Unlocks {new Date(v.lockUntil as string).toLocaleDateString()}.
                Withdrawing now incurs a 10% early-exit penalty.
              </p>
            )}

            {finished ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                <Check className="h-4 w-4" />
                {finished}
              </p>
            ) : (
              <button
                type="button"
                disabled={busyId === v.id}
                onClick={() => withdraw(v.id)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
              >
                {busyId === v.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowDownToLine className="h-4 w-4" />
                )}
                {locked ? "Withdraw early" : "Withdraw"}
              </button>
            )}
          </div>
        );
      })}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

/* ------------------------------- Circle exit ------------------------------- */

function CircleExit({
  circles,
  userId,
}: {
  circles: WithdrawCircle[];
  userId: string;
}) {
  void userId;
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, boolean>>({});

  async function requestExit(c: WithdrawCircle) {
    setBusyId(c.id);
    setError(null);
    try {
      const res = await fetch(`/api/circles/${c.id}/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "MEMBER_EXIT_REQUEST",
          title: "Request to leave the circle",
          description:
            "I'd like to exit this circle and receive back my net contributions.",
          targetUserId: userId,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't submit the request.");
        return;
      }
      setDone((d) => ({ ...d, [c.id]: true }));
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setBusyId(null);
    }
  }

  const exitable = circles.filter((c) => c.status !== "completed");

  if (exitable.length === 0) {
    return (
      <Notice>
        You&apos;re not in any active circles. Joining one means your
        contributions help fund the group&apos;s rotating payouts.
      </Notice>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        In a savings circle your contributions fund other members&apos; payouts,
        so you can&apos;t withdraw them directly. Request to leave and the circle
        votes — on approval, your net contributions are returned.
      </p>
      {exitable.map((c) => {
        const isCreator = c.role === "creator";
        const finished = done[c.id];
        return (
          <div
            key={c.id}
            className="rounded-3xl border border-border/60 bg-card p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                  {c.role} · {c.status}
                </p>
              </div>
            </div>

            {isCreator ? (
              <p className="mt-3 text-xs text-muted-foreground">
                You created this circle and hold its pot, so you can&apos;t
                request an exit. Transfer ownership or complete the rotation
                first.
              </p>
            ) : finished ? (
              <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
                <Check className="h-4 w-4" />
                Exit request submitted for a vote.
              </p>
            ) : (
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => requestExit(c)}
                className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-border/60 px-4 py-2.5 text-sm font-semibold transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-60"
              >
                {busyId === c.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Users className="h-4 w-4" />
                )}
                Request to leave
              </button>
            )}
          </div>
        );
      })}
      {error && <ErrorText>{error}</ErrorText>}
    </div>
  );
}

/* -------------------------------- Primitives ------------------------------- */

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-3xl border border-dashed border-border/70 bg-card p-6 text-center text-sm text-muted-foreground shadow-sm">
      {children}
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      {children}
    </p>
  );
}
