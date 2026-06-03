import "server-only";

import { getCircleClient, isCircleConfigured } from "@/lib/circle";
import { ARC_USDC_ADDRESS } from "@/lib/arc";

/**
 * On-chain USDC transfers on Arc Testnet via Circle Programmable Wallets.
 *
 * Arc's USDC is exposed as an ERC-20 precompile at ARC_USDC_ADDRESS (6 decimals).
 * We move it with `createTransaction({ tokenAddress, blockchain, ... })`, which
 * avoids needing a Circle-side tokenId lookup. Callers should treat a thrown
 * error as "transfer not sent" and keep their ledger row in the `pending` state
 * for later reconciliation — the on-chain balance always stays authoritative.
 */

export type SendUsdcParams = {
  /** Circle wallet id of the sender (from profiles.circle_wallet_id). */
  fromWalletId: string;
  /** Destination Arc address (0x…40 hex). */
  toAddress: string;
  /** Whole-USDC amount, e.g. 12.5. Must be > 0. */
  amount: number;
  /** Optional idempotency key so retries don't double-send. */
  idempotencyKey?: string;
  /** Optional human-readable reference stored with the transaction. */
  refId?: string;
};

export type SendUsdcResult = {
  /** Circle transaction id (poll with getTransferStatus). */
  circleTxId: string;
  /** On-chain hash once Circle has broadcast it (often null at creation time). */
  txHash: string | null;
  /** Circle transaction state, e.g. INITIATED / SENT / CONFIRMED. */
  state: string | null;
};

const USDC_DP = 6;

/** Format a JS number as a fixed-decimal string Circle accepts (no float drift). */
function toAmountString(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Transfer amount must be a positive number.");
  }
  // Trim trailing zeros but keep a valid decimal string.
  return amount.toFixed(USDC_DP).replace(/\.?0+$/, "") || "0";
}

/**
 * Send USDC on Arc Testnet from a developer-controlled wallet to an address.
 * Resolves once Circle has accepted the transaction (state ~ INITIATED). Use
 * getTransferStatus to follow it to CONFIRMED/COMPLETE.
 */
export async function sendUsdc(
  params: SendUsdcParams
): Promise<SendUsdcResult> {
  if (!isCircleConfigured()) {
    throw new Error("Circle is not configured; cannot send on-chain.");
  }

  const client = getCircleClient();
  // With a walletId the originating chain is inferred from the wallet, so we
  // identify the token by its address only (passing `blockchain` here would
  // collide with the wallet-id input variant's `blockchain?: never`).
  const res = await client.createTransaction({
    walletId: params.fromWalletId,
    tokenAddress: ARC_USDC_ADDRESS,
    destinationAddress: params.toAddress,
    amount: [toAmountString(params.amount)],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    ...(params.idempotencyKey
      ? { idempotencyKey: params.idempotencyKey }
      : {}),
    ...(params.refId ? { refId: params.refId } : {}),
  });

  const data = res.data as
    | { id?: string; state?: string; txHash?: string }
    | undefined;
  const id = data?.id;
  if (!id) {
    throw new Error("Circle did not return a transaction id.");
  }

  return {
    circleTxId: id,
    txHash: data?.txHash ?? null,
    state: data?.state ?? null,
  };
}

export type TransferStatus = {
  state: string | null;
  txHash: string | null;
  /** True once the network has confirmed (CONFIRMED or COMPLETE). */
  confirmed: boolean;
  /** True for a terminal failure (CANCELLED / DENIED / FAILED / STUCK). */
  failed: boolean;
};

const CONFIRMED_STATES = new Set(["CONFIRMED", "COMPLETE"]);
const FAILED_STATES = new Set(["CANCELLED", "DENIED", "FAILED", "STUCK"]);

/** Fetch the current state of a Circle transaction (single read, no polling). */
export async function getTransferStatus(
  circleTxId: string
): Promise<TransferStatus> {
  const client = getCircleClient();
  const res = await client.getTransaction({ id: circleTxId });
  const tx = res.data?.transaction as
    | { state?: string; txHash?: string }
    | undefined;
  const state = tx?.state ?? null;
  return {
    state,
    txHash: tx?.txHash ?? null,
    confirmed: state ? CONFIRMED_STATES.has(state) : false,
    failed: state ? FAILED_STATES.has(state) : false,
  };
}
