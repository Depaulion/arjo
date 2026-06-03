// End-to-end on-chain transfer test. Mirrors lib/circle-transfer.ts (sendUsdc)
// and lib/reconcile.ts (getTransferStatus): initiates a real USDC transfer from
// the Circle wallet to the demo address, then polls Circle until the tx settles
// to CONFIRMED/COMPLETE (or a terminal failure). Moves 1 testnet USDC.
// Run: node scripts/verify-transfer.cjs
const fs = require("fs");
const path = require("path");

const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const {
  initiateDeveloperControlledWalletsClient,
} = require("@circle-fin/developer-controlled-wallets");

const ARC_USDC_ADDRESS = "0x3600000000000000000000000000000000000000";
const EXPLORER = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app";
const FROM_WALLET_ID = process.env.TEST_FROM_WALLET_ID; // resolved below
const TO_ADDRESS = process.env.ARC_DEMO_ADDRESS;
const AMOUNT = "1"; // 1 USDC

const CONFIRMED = new Set(["CONFIRMED", "COMPLETE"]);
const FAILED = new Set(["CANCELLED", "DENIED", "FAILED", "STUCK"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });

  // Resolve the sole wallet in the set as the sender.
  const list = await client.listWallets({ walletSetId: process.env.CIRCLE_WALLET_SET_ID });
  const wallet = list.data?.wallets?.[0];
  const fromWalletId = FROM_WALLET_ID || wallet?.id;
  console.log(`From wallet: ${wallet?.address}  (id ${String(fromWalletId).slice(0, 8)}…)`);
  console.log(`To address : ${TO_ADDRESS}`);
  console.log(`Amount     : ${AMOUNT} USDC\n`);

  console.log("→ Creating transaction (mirrors sendUsdc)…");
  // Exactly the body lib/circle-transfer.ts now builds: amounts + tokenAddress + blockchain.
  const created = await client.createTransaction({
    walletId: fromWalletId,
    tokenAddress: ARC_USDC_ADDRESS,
    blockchain: "ARC-TESTNET",
    destinationAddress: TO_ADDRESS,
    amounts: [AMOUNT],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
    refId: "arc-ajo-verify",
  });
  const txId = created.data?.id;
  console.log(`  circleTxId = ${txId}`);
  console.log(`  initial state = ${created.data?.state}\n`);

  console.log("→ Polling getTransaction (mirrors reconciler)…");
  let last = null;
  for (let i = 0; i < 40; i++) {
    await sleep(3000);
    const res = await client.getTransaction({ id: txId });
    const tx = res.data?.transaction;
    const state = tx?.state ?? "(none)";
    if (state !== last) {
      console.log(`  [${String(i * 3).padStart(3)}s] state=${state}${tx?.txHash ? `  tx=${tx.txHash}` : ""}`);
      last = state;
    }
    if (CONFIRMED.has(state)) {
      console.log(`\n✅ SETTLED. Explorer: ${EXPLORER}/tx/${tx.txHash}`);
      return;
    }
    if (FAILED.has(state)) {
      console.log(`\n❌ FAILED with terminal state ${state}.`);
      process.exit(1);
    }
  }
  console.log("\n⏳ Still in flight after 120s — re-run the check later.");
})().catch((e) => {
  console.error("ERROR message:", e?.message || e);
  if (e?.response?.data) console.error("response.data:", JSON.stringify(e.response.data, null, 2));
  if (e?.response?.status) console.error("status:", e.response.status);
  if (Array.isArray(e?.errors)) console.error("errors:", JSON.stringify(e.errors, null, 2));
  console.error("keys:", Object.keys(e || {}));
  console.error("code:", e?.code, "| status:", e?.status, "| url:", e?.url, "| method:", e?.method);
  process.exit(1);
});
