"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpToLine,
  Building2,
  Check,
  ChevronLeft,
  Copy,
  CreditCard,
  Droplet,
  ExternalLink,
  Loader2,
  Smartphone,
} from "lucide-react";

import {
  FIAT_CURRENCIES,
  RAMP_METHODS,
  formatFiat,
  quoteOffRamp,
  quoteOnRamp,
  type FiatCurrency,
  type RampMethod,
} from "@/lib/ramp";

type Mode = "add" | "cashout";

const METHOD_ICON: Record<RampMethod, React.ReactNode> = {
  bank: <Building2 className="h-4 w-4" />,
  card: <CreditCard className="h-4 w-4" />,
  mobile: <Smartphone className="h-4 w-4" />,
};

function fmtUsdc(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function RampFlow({
  walletAddress,
  balance,
  currency,
  faucetUrl,
}: {
  walletAddress: string | null;
  balance: number | null;
  currency: string;
  faucetUrl: string;
}) {
  const [mode, setMode] = useState<Mode>("add");

  const TABS: { id: Mode; label: string; icon: React.ReactNode }[] = [
    { id: "add", label: "Add money", icon: <ArrowDownToLine className="h-4 w-4" /> },
    { id: "cashout", label: "Cash out", icon: <ArrowUpToLine className="h-4 w-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-border/60 bg-card p-1.5">
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

      {mode === "add" ? (
        <AddMoney
          walletAddress={walletAddress}
          usdcCurrency={currency}
          faucetUrl={faucetUrl}
        />
      ) : (
        <CashOut balance={balance} usdcCurrency={currency} />
      )}
    </div>
  );
}

/* -------------------------------- Add money -------------------------------- */

function AddMoney({
  walletAddress,
  usdcCurrency,
  faucetUrl,
}: {
  walletAddress: string | null;
  usdcCurrency: string;
  faucetUrl: string;
}) {
  const router = useRouter();
  const [fiat, setFiat] = useState<FiatCurrency>("NGN");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<RampMethod>("bank");
  const [copied, setCopied] = useState(false);

  const quote = useMemo(() => quoteOnRamp(Number(amount), fiat), [amount, fiat]);

  function fund() {
    if (walletAddress) {
      navigator.clipboard?.writeText(walletAddress).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 8000);
    }
    window.open(faucetUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <CurrencyChips value={fiat} onChange={setFiat} />

      <label className="mt-5 block text-sm font-medium" htmlFor="onramp-amount">
        You pay
      </label>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3">
        <input
          id="onramp-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-sm font-medium text-muted-foreground">{fiat}</span>
      </div>

      {/* Method picker */}
      <p className="mt-5 text-sm font-medium">Funding method</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {RAMP_METHODS.map((m) => {
          const active = method === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMethod(m.id)}
              className={`flex flex-col items-start gap-1.5 rounded-2xl border p-3 text-left transition-colors ${
                active
                  ? "border-primary/60 bg-primary/10"
                  : "border-border/60 hover:border-primary/40"
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl ${
                  active ? "bg-primary text-primary-foreground" : "bg-secondary"
                }`}
              >
                {METHOD_ICON[m.id]}
              </span>
              <span className="text-xs font-semibold leading-tight">{m.label}</span>
            </button>
          );
        })}
      </div>

      {/* Quote */}
      {quote && (
        <div className="mt-5 space-y-2 rounded-2xl bg-secondary/50 p-4 text-sm">
          <Row label="Fee (1.5%)" value={formatFiat(quote.feeFiat, fiat)} />
          <Row label="Rate" value={`1 ${fiat} ≈ ${fmtUsdc(quote.rate)} USDC`} />
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
            <span className="text-muted-foreground">You receive</span>
            <span className="text-lg font-bold text-primary">
              {fmtUsdc(quote.usdcReceived)} {usdcCurrency}
            </span>
          </div>
        </div>
      )}

      {/* Testnet note + faucet hand-off */}
      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
        This is Arc Testnet, so no real card or bank is charged. We&apos;ll copy
        your wallet address and open the Circle faucet, where you claim free test{" "}
        {usdcCurrency} to fund your account.
      </p>

      {copied && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
          <Check className="h-4 w-4" />
          Address copied — paste it into the faucet, claim, then come back and
          refresh.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={fund}
          disabled={!walletAddress}
          className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
        >
          <Droplet className="h-4 w-4" />
          {walletAddress ? "Continue to fund" : "Wallet not ready"}
          {walletAddress && <ExternalLink className="h-3.5 w-3.5" />}
        </button>
        <button
          type="button"
          onClick={() => router.refresh()}
          title="Refresh balance"
          className="inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border/60 px-4 py-3 text-sm font-medium transition-colors hover:border-primary/40"
        >
          <Copy className="h-4 w-4" />
          Refresh
        </button>
      </div>
    </div>
  );
}

/* --------------------------------- Cash out -------------------------------- */

function CashOut({
  balance,
  usdcCurrency,
}: {
  balance: number | null;
  usdcCurrency: string;
}) {
  const router = useRouter();
  const [fiat, setFiat] = useState<FiatCurrency>("NGN");
  const [amount, setAmount] = useState("");
  const [destination, setDestination] = useState("");
  const [step, setStep] = useState<"form" | "review" | "done">("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = Number(amount);
  const quote = useMemo(() => quoteOffRamp(amountNum, fiat), [amountNum, fiat]);
  const amountValid =
    Number.isFinite(amountNum) &&
    amountNum > 0 &&
    (balance === null || amountNum <= balance);
  const destValid = destination.trim().length >= 4;
  const canReview = amountValid && destValid && Boolean(quote);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/ramp/offramp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          usdcAmount: amountNum,
          currency: fiat,
          destination: destination.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't submit the cash-out.");
        setStep("form");
        return;
      }
      setStep("done");
      router.refresh();
    } catch {
      setError("Network error — please try again.");
      setStep("form");
    } finally {
      setBusy(false);
    }
  }

  if (step === "done" && quote) {
    return (
      <div className="rounded-3xl border border-border/60 bg-card p-6 text-center shadow-sm">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Check className="h-6 w-6" />
        </span>
        <p className="mt-3 text-lg font-semibold">Cash-out requested</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {fmtUsdc(quote.usdcAmount)} {usdcCurrency} →{" "}
          {formatFiat(quote.fiatReceived, fiat)} to {destination.trim()}. A
          settlement provider processes payouts — track it in Activity.
        </p>
      </div>
    );
  }

  if (step === "review" && quote) {
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
        <p className="mt-3 text-sm text-muted-foreground">You cash out</p>
        <p className="text-3xl font-bold tracking-tight">
          {fmtUsdc(quote.usdcAmount)}{" "}
          <span className="text-lg font-semibold text-muted-foreground">
            {usdcCurrency}
          </span>
        </p>
        <div className="mt-4 space-y-2 rounded-2xl bg-secondary/50 p-4 text-sm">
          <Row label="Gross" value={formatFiat(quote.grossFiat, fiat)} />
          <Row label="Fee (2%)" value={`−${formatFiat(quote.feeFiat, fiat)}`} />
          <Row label="To" value={destination.trim()} />
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
            <span className="text-muted-foreground">You receive</span>
            <span className="text-lg font-bold text-primary">
              {formatFiat(quote.fiatReceived, fiat)}
            </span>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
          Testnet: this records a payout request for a settlement provider — no
          real funds are sent and no USDC leaves your wallet automatically.
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
            <ArrowUpToLine className="h-4 w-4" />
          )}
          Confirm cash-out
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-border/60 bg-card p-6 shadow-sm">
      <CurrencyChips value={fiat} onChange={setFiat} />

      <div className="mt-5 flex items-center justify-between">
        <label className="text-sm font-medium" htmlFor="offramp-amount">
          You cash out
        </label>
        <span className="text-xs text-muted-foreground">
          Available: {balance === null ? "—" : `${fmtUsdc(balance)} ${usdcCurrency}`}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3">
        <input
          id="offramp-amount"
          inputMode="decimal"
          placeholder="0.00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full bg-transparent text-2xl font-bold outline-none placeholder:text-muted-foreground/50"
        />
        <span className="text-sm font-medium text-muted-foreground">
          {usdcCurrency}
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

      <label className="mt-4 block text-sm font-medium" htmlFor="offramp-dest">
        Payout account
      </label>
      <input
        id="offramp-dest"
        placeholder="Bank account or mobile-money number"
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        className="mt-2 w-full rounded-2xl border border-border/60 bg-secondary/40 px-4 py-3 text-sm outline-none focus:border-primary/50"
      />

      {quote && (
        <div className="mt-4 space-y-2 rounded-2xl bg-secondary/50 p-4 text-sm">
          <Row label="Fee (2%)" value={`−${formatFiat(quote.feeFiat, fiat)}`} />
          <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
            <span className="text-muted-foreground">You receive</span>
            <span className="text-lg font-bold text-primary">
              {formatFiat(quote.fiatReceived, fiat)}
            </span>
          </div>
        </div>
      )}

      {amount.length > 0 && !amountValid && (
        <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-500">
          {balance !== null && amountNum > balance
            ? `You can cash out at most ${fmtUsdc(balance)} ${usdcCurrency}.`
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
        Review cash-out
      </button>
    </div>
  );
}

/* -------------------------------- Primitives ------------------------------- */

function CurrencyChips({
  value,
  onChange,
}: {
  value: FiatCurrency;
  onChange: (c: FiatCurrency) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {FIAT_CURRENCIES.map((f) => {
        const active = value === f.code;
        return (
          <button
            key={f.code}
            type="button"
            onClick={() => onChange(f.code)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? "border-primary/60 bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {f.symbol} {f.code}
          </button>
        );
      })}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
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
