import "server-only";

import { getCircleClient, isCircleConfigured } from "@/lib/circle";
import { ARC_USDC_ADDRESS } from "@/lib/arc";
import { erc20BalanceOf } from "@/lib/arc-onchain";

/**
 * USYC integration — the *real* yield source behind Arjo's savings APY.
 *
 * USYC is Circle's tokenised money-market fund (shares of a vehicle holding
 * short-term U.S. Treasuries). On Arc it is a first-class, protocol-level asset
 * with live testnet contracts:
 *
 *   USYC token    0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C  (6 decimals)
 *   Teller        0x9fdF14c5B14173D74C08Af27AebFf39240dC105A  (mint/redeem ⇄ USDC)
 *   Entitlements  0xcc205224862c7641930c87679e98999d23c26113  (allowlist control)
 *
 * Source: Arc docs → "Contract addresses" / "Stablecoin native model".
 *
 * HOW YIELD ACTUALLY WORKS HERE
 * -----------------------------
 * When live, the platform vault deposits its idle USDC into USYC via the Teller
 * (mint). USYC's redemption value rises continuously as the underlying Treasury
 * portfolio accrues — so when the vault redeems (sell), it receives more USDC
 * than it deposited. That difference IS the yield; it is not a subsidy or token
 * emission. Per-plan attribution is computed by lib/yield-engine.ts at a rate
 * that tracks the published USYC rate, and is funded by the vault's real USYC
 * appreciation.
 *
 * THE ALLOWLIST GATE
 * ------------------
 * USYC is permissioned: a wallet must be allowlisted (Entitlements) before the
 * Teller will mint/redeem for it. On testnet you obtain this by opening a Circle
 * Support ticket with the vault's Arc address (~24–48h). Because that approval
 * is external and time-gated, this module is OFF by default and the app runs in
 * a clearly-labelled "simulated" yield mode until enabled. Enabling is a config
 * change, not a rewrite:
 *
 *   1. Get ARC_VAULT_ADDRESS allowlisted via Circle Support.
 *   2. Confirm the deployed Teller's mint/redeem function signatures and set
 *      ARC_USYC_TELLER_MINT_FN / ARC_USYC_TELLER_REDEEM_FN (defaults below are
 *      the conventional Hashnote Teller shape and MUST be verified onchain).
 *   3. Set ARC_USYC_ENABLED=true.
 *
 * Read paths (balanceOf) are standard ERC-20 and work for any address without
 * allowlisting, so getUsycBalance() is always real.
 */

/** USYC ERC-20 interface decimals on Arc (matches USDC's 6dp). */
export const USYC_DECIMALS = 6;

/** Live USYC contract addresses on Arc Testnet (env-overridable). */
export const USYC_TOKEN_ADDRESS =
  process.env.ARC_USYC_TOKEN_ADDRESS ??
  "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
export const USYC_TELLER_ADDRESS =
  process.env.ARC_USYC_TELLER_ADDRESS ??
  "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A";
export const USYC_ENTITLEMENTS_ADDRESS =
  process.env.ARC_USYC_ENTITLEMENTS_ADDRESS ??
  "0xcc205224862c7641930c87679e98999d23c26113";

/**
 * Teller function signatures used for contract execution. Defaults are the
 * VERIFIED signatures of the deployed Arc Testnet Teller (ERC-4626 style,
 * implementation 0x238Dc235…adf6 behind the TellerProxy):
 *
 *   deposit(uint256 assets, address receiver)         — USDC in, USYC minted
 *   redeem(uint256 shares, address receiver, address owner) — USYC in, USDC out
 *
 * Parameters are filled positionally from the signature: every uint256 gets the
 * amount (smallest units) and every address gets the vault's own address
 * (receiver/owner — the wallet executing the call). Env-overridable in case a
 * future deployment changes shape.
 */
const TELLER_MINT_FN =
  process.env.ARC_USYC_TELLER_MINT_FN ?? "deposit(uint256,address)";
const TELLER_REDEEM_FN =
  process.env.ARC_USYC_TELLER_REDEEM_FN ?? "redeem(uint256,address,address)";

export type YieldMode = "live" | "simulated";

/**
 * Whether live USYC is enabled. Requires the explicit operator opt-in AND Circle
 * to be configured (mint/redeem are developer-controlled-wallet transactions).
 * Defaults to false so the app never *claims* a live position it cannot back.
 */
export function isUsycEnabled(): boolean {
  return process.env.ARC_USYC_ENABLED === "true" && isCircleConfigured();
}

/** "live" when real USYC is wired and enabled, otherwise "simulated". */
export function yieldMode(): YieldMode {
  return isUsycEnabled() ? "live" : "simulated";
}

/** Convert a whole-token amount to its smallest-unit decimal string (6dp). */
function toUnits(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("USYC amount must be a positive number.");
  }
  // Integer count of 6-decimal units, as a string (no float/BigInt-literal drift).
  return Math.round(amount * 10 ** USYC_DECIMALS).toString();
}

/**
 * Live onchain USYC balance (whole tokens) of an address. Standard ERC-20
 * read — works regardless of allowlist status, so this is always truthful.
 */
export async function getUsycBalance(address: string): Promise<number> {
  return erc20BalanceOf(USYC_TOKEN_ADDRESS, address, USYC_DECIMALS);
}

export type UsycTxResult = {
  circleTxId: string;
  txHash: string | null;
  state: string | null;
};

function extractTx(res: unknown): UsycTxResult {
  const data = (res as { data?: { id?: string; state?: string; txHash?: string } })
    ?.data;
  const id = data?.id;
  if (!id) throw new Error("Circle did not return a transaction id.");
  return { circleTxId: id, txHash: data?.txHash ?? null, state: data?.state ?? null };
}

/**
 * Positional ABI parameters for a Teller call, derived from the signature:
 * uint256 → the amount (smallest units); address → the vault's own address
 * (the executing wallet, used as receiver and owner). Throws on any other type
 * so a misconfigured signature fails loudly instead of sending a bad call.
 */
function tellerAbiParameters(fn: string, amountUnits: string): string[] {
  const match = fn.match(/\(([^)]*)\)/);
  const types = match && match[1]
    ? match[1].split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  return types.map((t) => {
    if (t.startsWith("uint")) return amountUnits;
    if (t === "address") {
      const self = process.env.ARC_VAULT_ADDRESS;
      if (!self) {
        throw new Error(
          `Teller signature ${fn} needs the vault address; set ARC_VAULT_ADDRESS.`
        );
      }
      return self;
    }
    throw new Error(`Unsupported Teller parameter type "${t}" in ${fn}.`);
  });
}

/** Shared contract-execution call against a configured Teller function. */
async function executeTeller(params: {
  walletId: string;
  fn: string;
  amountUnits: string;
  idempotencyKey?: string;
  refId?: string;
}): Promise<UsycTxResult> {
  if (!isUsycEnabled()) {
    throw new Error("USYC is not enabled; set ARC_USYC_ENABLED=true once the vault is allowlisted.");
  }
  const client = getCircleClient();
  // The developer-controlled-wallets SDK exposes contract execution; the live
  // API field for the call is the ABI signature + positional parameters.
  const body = {
    walletId: params.walletId,
    contractAddress: USYC_TELLER_ADDRESS,
    abiFunctionSignature: params.fn,
    abiParameters: tellerAbiParameters(params.fn, params.amountUnits),
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    ...(params.idempotencyKey ? { idempotencyKey: params.idempotencyKey } : {}),
    ...(params.refId ? { refId: params.refId } : {}),
  };
  const fn = (client as unknown as {
    createContractExecutionTransaction: (
      b: unknown
    ) => Promise<unknown>;
  }).createContractExecutionTransaction;
  if (typeof fn !== "function") {
    throw new Error("Circle client does not support contract execution.");
  }
  const res = await fn.call(client, body);
  return extractTx(res);
}

/**
 * Mint USYC by depositing `usdcAmount` of the vault's USDC into the Teller.
 * NOTE: the Teller must be allowed to pull the USDC (ERC-20 approval) — set
 * that up as part of allowlisting/operator onboarding. Gated by isUsycEnabled().
 */
export async function mintUsycFromUsdc(params: {
  walletId: string;
  usdcAmount: number;
  idempotencyKey?: string;
  refId?: string;
}): Promise<UsycTxResult> {
  return executeTeller({
    walletId: params.walletId,
    fn: TELLER_MINT_FN,
    amountUnits: toUnits(params.usdcAmount),
    idempotencyKey: params.idempotencyKey,
    refId: params.refId,
  });
}

/**
 * Redeem `usycAmount` of USYC back to USDC via the Teller. Gated by
 * isUsycEnabled(). Callers should treat a throw as "not redeemed" and keep the
 * dependent ledger row pending — the onchain balance stays authoritative.
 */
export async function redeemUsycToUsdc(params: {
  walletId: string;
  usycAmount: number;
  idempotencyKey?: string;
  refId?: string;
}): Promise<UsycTxResult> {
  return executeTeller({
    walletId: params.walletId,
    fn: TELLER_REDEEM_FN,
    amountUnits: toUnits(params.usycAmount),
    idempotencyKey: params.idempotencyKey,
    refId: params.refId,
  });
}

/** USDC token address the Teller pairs against (for operator/approval scripts). */
export const USYC_PAIR_USDC_ADDRESS = ARC_USDC_ADDRESS;
