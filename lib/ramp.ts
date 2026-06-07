/**
 * Fiat on/off-ramp quoting (Problem 4).
 *
 * Isomorphic — imported by both the client ramp UI and the server off-ramp
 * route, so it stays free of `server-only` and of any secret access. The rates
 * here are indicative testnet values, NOT a live FX feed: on Arc Testnet USDC is
 * funded from Circle's faucet, so the on-ramp is a guided faucet hand-off and the
 * off-ramp records a settlement request a provider would fulfil. No real money
 * moves through these functions.
 */

export type FiatCurrency = "USD" | "NGN" | "GHS" | "KES";

export type FiatMeta = {
  code: FiatCurrency;
  symbol: string;
  name: string;
  /** USDC received per 1 unit of this fiat (USD pegged ~1:1). */
  usdcPerUnit: number;
};

/**
 * Ajo is practised widely across West/East Africa, so we surface the locally
 * relevant currencies alongside USD. Rates are illustrative and rounded.
 */
export const FIAT_CURRENCIES: FiatMeta[] = [
  { code: "USD", symbol: "$", name: "US Dollar", usdcPerUnit: 1 },
  { code: "NGN", symbol: "₦", name: "Nigerian Naira", usdcPerUnit: 1 / 1600 },
  { code: "GHS", symbol: "₵", name: "Ghanaian Cedi", usdcPerUnit: 1 / 15 },
  { code: "KES", symbol: "KSh", name: "Kenyan Shilling", usdcPerUnit: 1 / 130 },
];

/** Provider spread baked into each direction (testnet-indicative). */
export const ONRAMP_FEE_PCT = 0.015;
export const OFFRAMP_FEE_PCT = 0.02;

/** Funding/settlement methods, country-appropriate for the ajo audience. */
export type RampMethod = "bank" | "card" | "mobile";

export const RAMP_METHODS: { id: RampMethod; label: string; blurb: string }[] = [
  { id: "bank", label: "Bank transfer", blurb: "Direct from your bank account" },
  { id: "card", label: "Debit card", blurb: "Visa or Mastercard" },
  { id: "mobile", label: "Mobile money", blurb: "M-Pesa, MoMo, OPay & more" },
];

export function getFiat(code: FiatCurrency): FiatMeta {
  return FIAT_CURRENCIES.find((f) => f.code === code) ?? FIAT_CURRENCIES[0];
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type OnRampQuote = {
  /** Fiat the user pays in. */
  fiatAmount: number;
  currency: FiatCurrency;
  /** Provider fee, in fiat. */
  feeFiat: number;
  /** Fiat actually converted after the fee. */
  netFiat: number;
  /** USDC credited to the wallet. */
  usdcReceived: number;
  /** USDC per 1 fiat unit used for this quote. */
  rate: number;
};

export type OffRampQuote = {
  /** USDC the user cashes out. */
  usdcAmount: number;
  currency: FiatCurrency;
  /** Gross fiat before the fee. */
  grossFiat: number;
  /** Provider fee, in USDC-equivalent fiat. */
  feeFiat: number;
  /** Fiat the user receives in their bank / mobile wallet. */
  fiatReceived: number;
  /** USDC per 1 fiat unit used for this quote. */
  rate: number;
};

/** Quote fiat → USDC. Returns null if the amount is not a positive number. */
export function quoteOnRamp(
  fiatAmount: number,
  currency: FiatCurrency
): OnRampQuote | null {
  if (!Number.isFinite(fiatAmount) || fiatAmount <= 0) return null;
  const meta = getFiat(currency);
  const feeFiat = fiatAmount * ONRAMP_FEE_PCT;
  const netFiat = fiatAmount - feeFiat;
  return {
    fiatAmount: round2(fiatAmount),
    currency,
    feeFiat: round2(feeFiat),
    netFiat: round2(netFiat),
    usdcReceived: round2(netFiat * meta.usdcPerUnit),
    rate: meta.usdcPerUnit,
  };
}

/** Quote USDC → fiat. Returns null if the amount is not a positive number. */
export function quoteOffRamp(
  usdcAmount: number,
  currency: FiatCurrency
): OffRampQuote | null {
  if (!Number.isFinite(usdcAmount) || usdcAmount <= 0) return null;
  const meta = getFiat(currency);
  const grossFiat = usdcAmount / meta.usdcPerUnit;
  const feeFiat = grossFiat * OFFRAMP_FEE_PCT;
  return {
    usdcAmount: round2(usdcAmount),
    currency,
    grossFiat: round2(grossFiat),
    feeFiat: round2(feeFiat),
    fiatReceived: round2(grossFiat - feeFiat),
    rate: meta.usdcPerUnit,
  };
}

/** Format a fiat amount with its symbol, e.g. "₦16,000.00". */
export function formatFiat(amount: number, currency: FiatCurrency): string {
  const meta = getFiat(currency);
  const n = amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${meta.symbol}${n}`;
}
