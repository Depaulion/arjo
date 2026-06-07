// One-off: mint the platform vault wallet (SafeLock principal + circle bonds)
// once, so the same vault is reused everywhere instead of being re-created on
// each serverless cold start. Creates ONE SCA wallet in the existing wallet set
// and prints the two env values to set. Moves NO funds.
//
//   Run:  node scripts/create-vault.cjs
//
// Then set ARC_VAULT_WALLET_ID and ARC_VAULT_ADDRESS (printed below) in:
//   • Vercel → Settings → Environment Variables (Production + Preview)
//   • your local .env.local
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
  Blockchain,
} = require("@circle-fin/developer-controlled-wallets");

const WALLET_SET_ID = process.env.CIRCLE_WALLET_SET_ID;

(async () => {
  console.log("=== Create platform vault wallet ===");
  console.log("API key present:", Boolean(process.env.CIRCLE_API_KEY));
  console.log("Entity secret present:", Boolean(process.env.CIRCLE_ENTITY_SECRET));
  console.log("Wallet set id present:", Boolean(WALLET_SET_ID));
  if (!WALLET_SET_ID) {
    throw new Error(
      "CIRCLE_WALLET_SET_ID is not set. Set it first so the vault joins your shared wallet set."
    );
  }

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });

  const res = await client.createWallets({
    walletSetId: WALLET_SET_ID,
    blockchains: [Blockchain.ArcTestnet],
    accountType: "SCA",
    count: 1,
  });

  const wallet = res.data?.wallets?.[0];
  if (!wallet?.address || !wallet?.id) {
    throw new Error("Circle did not return a vault wallet.");
  }

  console.log("\nVault wallet created. Set these two env vars everywhere:\n");
  console.log(`ARC_VAULT_WALLET_ID=${wallet.id}`);
  console.log(`ARC_VAULT_ADDRESS=${wallet.address}`);
  console.log("\n(Add to Vercel Production + Preview, and to local .env.local.)");
})().catch((e) => {
  console.error("ERROR:", e?.message || e);
  process.exit(1);
});
