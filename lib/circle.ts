import "server-only";

import {
  Blockchain,
  initiateDeveloperControlledWalletsClient,
} from "@circle-fin/developer-controlled-wallets";
import type { SupabaseClient } from "@supabase/supabase-js";

const ARC_BLOCKCHAIN = Blockchain.ArcTestnet;

export function isCircleConfigured() {
  return Boolean(process.env.CIRCLE_API_KEY && process.env.CIRCLE_ENTITY_SECRET);
}

let cachedClient: ReturnType<
  typeof initiateDeveloperControlledWalletsClient
> | null = null;

function getClient() {
  if (!isCircleConfigured()) {
    throw new Error(
      "Circle is not configured. Set CIRCLE_API_KEY and CIRCLE_ENTITY_SECRET."
    );
  }
  if (!cachedClient) {
    cachedClient = initiateDeveloperControlledWalletsClient({
      apiKey: process.env.CIRCLE_API_KEY!,
      entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
    });
  }
  return cachedClient;
}

/** The Arc Testnet blockchain identifier used by every Circle call here. */
export const ARC_TESTNET_BLOCKCHAIN = ARC_BLOCKCHAIN;

/** Shared, lazily-initialised Circle client for other server modules. */
export function getCircleClient() {
  return getClient();
}

// All users share one wallet set. Provide CIRCLE_WALLET_SET_ID via env after the
// first run; otherwise we create one and cache it for this server instance.
let cachedWalletSetId = process.env.CIRCLE_WALLET_SET_ID || null;

async function ensureWalletSetId() {
  if (cachedWalletSetId) return cachedWalletSetId;

  const client = getClient();
  const res = await client.createWalletSet({ name: "Arc Ajo Wallets" });
  const id = res.data?.walletSet?.id;
  if (!id) throw new Error("Failed to create Circle wallet set.");

  cachedWalletSetId = id;
  console.warn(
    `[circle] Created wallet set ${id}. Set CIRCLE_WALLET_SET_ID=${id} in your env to reuse it across restarts.`
  );
  return id;
}

export type ProvisionedWallet = { address: string; walletId: string };

/**
 * Idempotently ensure the user has a Circle wallet on Arc. If the profile
 * already has an address, returns it; otherwise creates an SCA wallet and
 * persists the address + wallet id to the profile.
 */
export async function provisionWalletForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<ProvisionedWallet> {
  const { data: profile, error: readError } = await supabase
    .from("profiles")
    .select("arc_wallet_address, circle_wallet_id")
    .eq("id", userId)
    .single<{ arc_wallet_address: string | null; circle_wallet_id: string | null }>();

  if (readError) throw new Error(readError.message);

  if (profile?.arc_wallet_address && profile?.circle_wallet_id) {
    return {
      address: profile.arc_wallet_address,
      walletId: profile.circle_wallet_id,
    };
  }

  const client = getClient();
  const walletSetId = await ensureWalletSetId();

  const res = await client.createWallets({
    walletSetId,
    blockchains: [ARC_BLOCKCHAIN],
    accountType: "SCA",
    count: 1,
  });

  const wallet = res.data?.wallets?.[0];
  if (!wallet?.address || !wallet?.id) {
    throw new Error("Circle did not return a wallet.");
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      arc_wallet_address: wallet.address,
      circle_wallet_id: wallet.id,
      wallet_blockchain: ARC_BLOCKCHAIN,
    })
    .eq("id", userId);

  if (updateError) throw new Error(updateError.message);

  return { address: wallet.address, walletId: wallet.id };
}
