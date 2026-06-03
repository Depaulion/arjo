import "server-only";

import {
  ARC_TESTNET_BLOCKCHAIN,
  getCircleClient,
  isCircleConfigured,
} from "@/lib/circle";

/**
 * The platform "vault" — a single Circle developer-controlled wallet that holds
 * principal for SafeLock / target / auto-save plans. Members transfer USDC into
 * it when they lock, and it transfers back (minus any early-exit penalty) when a
 * plan is withdrawn or matures.
 *
 * Reuses the shared Arc Ajo wallet set. Provide ARC_VAULT_WALLET_ID and
 * ARC_VAULT_ADDRESS via env after the first run to reuse the same vault across
 * restarts; otherwise we create one, cache it for this instance, and log the
 * ids to set.
 */

export type VaultWallet = { walletId: string; address: string };

let cachedVault: VaultWallet | null =
  process.env.ARC_VAULT_WALLET_ID && process.env.ARC_VAULT_ADDRESS
    ? {
        walletId: process.env.ARC_VAULT_WALLET_ID,
        address: process.env.ARC_VAULT_ADDRESS,
      }
    : null;

let inFlight: Promise<VaultWallet> | null = null;

async function createVault(): Promise<VaultWallet> {
  const client = getCircleClient();

  // Reuse the existing wallet set if configured; otherwise make a vault-only one.
  let walletSetId = process.env.CIRCLE_WALLET_SET_ID || null;
  if (!walletSetId) {
    const set = await client.createWalletSet({ name: "Arc Ajo Vault" });
    walletSetId = set.data?.walletSet?.id ?? null;
    if (!walletSetId) throw new Error("Failed to create vault wallet set.");
  }

  const res = await client.createWallets({
    walletSetId,
    blockchains: [ARC_TESTNET_BLOCKCHAIN],
    accountType: "SCA",
    count: 1,
  });

  const wallet = res.data?.wallets?.[0];
  if (!wallet?.address || !wallet?.id) {
    throw new Error("Circle did not return a vault wallet.");
  }

  const vault: VaultWallet = { walletId: wallet.id, address: wallet.address };
  console.warn(
    `[vault] Created platform vault wallet. Set ARC_VAULT_WALLET_ID=${vault.walletId} and ARC_VAULT_ADDRESS=${vault.address} in your env to reuse it.`
  );
  return vault;
}

/** Idempotently ensure the platform vault wallet exists; returns its id+address. */
export async function ensureVault(): Promise<VaultWallet> {
  if (!isCircleConfigured()) {
    throw new Error("Circle is not configured; vault unavailable.");
  }
  if (cachedVault) return cachedVault;
  if (!inFlight) {
    inFlight = createVault()
      .then((v) => {
        cachedVault = v;
        return v;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  return inFlight;
}

/** The vault address if known (env or already-created), else null. No network. */
export function knownVaultAddress(): string | null {
  return cachedVault?.address ?? null;
}
