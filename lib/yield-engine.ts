/**
 * USYC yield engine — the honest answer to "where does the APY come from?".
 *
 * On Arc mainnet, idle stablecoin principal a member locks (SafeLock / target /
 * auto vaults) would be allocated into USYC — Circle's tokenised, yield-bearing
 * instrument backed by short-term U.S. Treasuries (via overnight reverse repo).
 * USYC accrues value continuously as its price appreciates, so a depositor's
 * balance grows a little every day. That accrual — NOT platform subsidy, NOT new
 * token emissions — is the yield Arjo passes through to savers.
 *
 * USYC is REAL on Arc — see lib/usyc.ts for the on-chain integration (token,
 * Teller mint/redeem, allowlist). This module is the *attribution model*: given
 * a principal and a holding period it computes the yield share, daily-compounded
 * at a rate that tracks the published USYC rate. When live USYC is enabled
 * (isUsycEnabled), that share is funded by the vault's real USYC appreciation;
 * until the vault is allowlisted the same figure runs in a clearly-labelled
 * "simulated" mode. Either way the math is identical — going live is a config
 * change, not a rewrite.
 *
 * Pure module: no I/O, no `server-only`, safe to import on client or server.
 * (Mode detection lives in lib/usyc.ts, which is server-only.)
 */

/** Metadata describing the yield source, surfaced in the UI and docs. */
export const YIELD_SOURCE = {
  token: "USYC",
  name: "Circle USYC",
  backing: "short-term U.S. Treasuries (overnight reverse repo)",
  custodian: "Circle / Hashnote",
} as const;

/**
 * Base annualised yield for USYC-backed balances, as a fraction (0.08 = 8%).
 * Kept aligned with the historical SafeLock rate so existing plans are
 * unaffected; on mainnet this would be read from the live USYC rate feed.
 */
export const USYC_BASE_APY = 0.08;

/** Days the yield model compounds over per year. */
const DAYS_PER_YEAR = 365;
const MS_PER_DAY = 1000 * 60 * 60 * 24;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Whole (fractional) days between two instants, never negative. */
export function daysBetween(from: Date | string, to: Date | string = new Date()): number {
  const a = typeof from === "string" ? new Date(from) : from;
  const b = typeof to === "string" ? new Date(to) : to;
  const ms = b.getTime() - a.getTime();
  return ms > 0 ? ms / MS_PER_DAY : 0;
}

/**
 * Normalise a plan's stored `apy_bonus` (a percent, e.g. 8) into a fraction,
 * falling back to the USYC base rate when the plan carries no explicit bonus.
 */
export function effectiveApy(planApyBonusPercent?: number | null): number {
  const pct = planApyBonusPercent ?? 0;
  return pct > 0 ? pct / 100 : USYC_BASE_APY;
}

/**
 * Yield accrued on `principal` held from `from` until `to`, using daily
 * compounding at the given APY (defaults to the USYC base rate). Returns the
 * gain only (excludes principal), rounded to 2dp.
 */
export function accrueYield(params: {
  principal: number;
  from: Date | string;
  to?: Date | string;
  apy?: number;
}): number {
  const principal = Math.max(0, params.principal);
  const apy = params.apy ?? USYC_BASE_APY;
  const days = daysBetween(params.from, params.to);
  if (principal <= 0 || apy <= 0 || days <= 0) return 0;
  const dailyRate = apy / DAYS_PER_YEAR;
  const growth = Math.pow(1 + dailyRate, days) - 1;
  return round2(principal * growth);
}

/**
 * Forward projection: yield `principal` would earn over `days` at `apy`
 * (defaults to the USYC base rate), daily-compounded. Rounded to 2dp.
 */
export function projectYield(params: {
  principal: number;
  days: number;
  apy?: number;
}): number {
  const principal = Math.max(0, params.principal);
  const apy = params.apy ?? USYC_BASE_APY;
  const days = Math.max(0, params.days);
  if (principal <= 0 || apy <= 0 || days <= 0) return 0;
  const dailyRate = apy / DAYS_PER_YEAR;
  const growth = Math.pow(1 + dailyRate, days) - 1;
  return round2(principal * growth);
}

/**
 * Same daily-compounding math as accrueYield but WITHOUT the 2dp rounding, so
 * sub-cent figures survive. Internal helper for fine-grained period attribution.
 */
function accrueYieldRaw(params: {
  principal: number;
  from: Date | string;
  to?: Date | string;
  apy?: number;
}): number {
  const principal = Math.max(0, params.principal);
  const apy = params.apy ?? USYC_BASE_APY;
  const days = daysBetween(params.from, params.to);
  if (principal <= 0 || apy <= 0 || days <= 0) return 0;
  const dailyRate = apy / DAYS_PER_YEAR;
  return principal * (Math.pow(1 + dailyRate, days) - 1);
}

/**
 * Yield attributed to the most recent `windowDays` for a principal that has been
 * compounding since `from`. Computed as the marginal gain of the window:
 *   accrued(from → to) − accrued(from → to−window)
 * so it correctly reflects daily compounding (and naturally returns the whole
 * accrual when the plan is younger than the window). Deliberately UNROUNDED —
 * sub-cent daily amounts (e.g. 0.0021) would otherwise round away; callers
 * format with adaptive precision. Never negative.
 */
export function periodYield(params: {
  principal: number;
  from: Date | string;
  windowDays: number;
  to?: Date | string;
  apy?: number;
}): number {
  const to =
    params.to === undefined
      ? new Date()
      : typeof params.to === "string"
        ? new Date(params.to)
        : params.to;
  const windowStart = new Date(to.getTime() - params.windowDays * MS_PER_DAY);
  const total = accrueYieldRaw({
    principal: params.principal,
    from: params.from,
    to,
    apy: params.apy,
  });
  const beforeWindow = accrueYieldRaw({
    principal: params.principal,
    from: params.from,
    to: windowStart,
    apy: params.apy,
  });
  const gain = total - beforeWindow;
  return gain > 0 ? gain : 0;
}

/**
 * Format a (possibly sub-cent) yield amount for display. Shows 2dp for normal
 * amounts, but expands to up to 4 significant decimals for tiny values so a
 * real-but-small daily yield (e.g. "0.0021") is never shown as a flat "0.00".
 */
export function formatYieldAmount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0.00";
  if (n >= 0.01) return n.toFixed(2);
  if (n < 0.0001) return "<0.0001";
  return n.toFixed(4);
}
