import {
  initiateDeveloperControlledWalletsClient,
  Blockchain,
} from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET,
});

const ws = await client.createWalletSet({ name: "Arc Ajo Wallets" });
const walletSetId = ws.data?.walletSet?.id;
console.log("CIRCLE_WALLET_SET_ID=" + walletSetId);

const wallets = await client.createWallets({
  walletSetId,
  blockchains: [Blockchain.ArcTestnet],
  accountType: "SCA",
  count: 1,
});
const w = wallets.data?.wallets?.[0];
console.log("WALLET_ADDRESS=" + w?.address);
console.log("WALLET_ID=" + w?.id);
console.log("BLOCKCHAIN=" + w?.blockchain);
