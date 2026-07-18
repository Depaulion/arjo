// Standalone onchain verification: connect to Circle, list wallets in the
// configured wallet set, and read each wallet's native USDC balance from the
// Arc RPC. Read-only — moves no funds. Run: node scripts/verify-circle.cjs
const fs = require("fs");
const path = require("path");

// Load .env.local into process.env without printing any values.
const envPath = path.join(__dirname, "..", ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) {
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const {
  initiateDeveloperControlledWalletsClient,
} = require("@circle-fin/developer-controlled-wallets");

const RPC = process.env.NEXT_PUBLIC_ARC_RPC_URL;
const WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;

async function nativeBalance(address) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getBalance",
      params: [address, "latest"],
    }),
  });
  const json = await res.json();
  if (!json.result) return null;
  return Number(BigInt(json.result)) / 1e18; // USDC is the 18-decimal native gas token
}

(async () => {
  console.log("=== Circle connectivity check ===");
  console.log("API key present:", Boolean(process.env.CIRCLE_API_KEY));
  console.log("Entity secret present:", Boolean(process.env.CIRCLE_ENTITY_SECRET));
  console.log("Wallet set id present:", Boolean(WALLET_SET_ID));

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });

  const res = await client.listWallets(
    WALLET_SET_ID ? { walletSetId: WALLET_SET_ID } : {}
  );
  const wallets = res.data?.wallets ?? [];
  console.log(`\nWallets in set: ${wallets.length}`);

  for (const w of wallets) {
    const bal = await nativeBalance(w.address);
    console.log(
      `  ${w.address}  [${w.blockchain}]  state=${w.state}  ` +
        `balance=${bal === null ? "n/a" : bal.toFixed(4)} USDC  ` +
        `walletId=${String(w.id).slice(0, 8)}…`
    );
  }
})().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
