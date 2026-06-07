// USYC go-live helper — run after Circle allowlists the vault.
//
//   node scripts/usyc-golive.cjs            (default: read-only "check")
//   node scripts/usyc-golive.cjs check      (same as above)
//   node scripts/usyc-golive.cjs approve    (WRITE: grant the Teller an ERC-20
//                                            allowance to pull the vault's USDC)
//
// The "check" mode moves nothing: it reads the vault's USDC/USYC balances, the
// current USDC allowance the vault has granted the Teller, and confirms a
// contract is actually deployed at the Teller address — then prints a PASS/TODO
// checklist for going live. Run this FIRST and after each step to see progress.
//
// The "approve" mode submits ONE on-chain transaction from the platform vault
// wallet: ERC-20 approve(teller, amount) on the USDC token, so the Teller can
// pull USDC when minting USYC. It does NOT move or mint anything by itself. It
// is gated behind the explicit `approve` argument AND a typed confirmation
// (CONFIRM=yes) so it can never fire by accident.
//
// Signature note: this script never hand-computes 4-byte selectors. For the
// WRITE it passes the human-readable signature to the Circle SDK, which encodes
// it. For READS it uses only the canonical, standardised ERC-20 selectors
// (balanceOf / allowance). To CONFIRM the Teller's mint/redeem function names,
// open the printed explorer link and read the verified contract — that is the
// authoritative source, not a guess.

const fs = require("fs");
const path = require("path");

// --- Load .env.local into process.env without printing any secret values. ----
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

// --- Config (env-overridable, mirrors lib/usyc.ts + lib/arc.ts) --------------
const RPC = process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";
const EXPLORER =
  process.env.NEXT_PUBLIC_ARC_EXPLORER_URL || "https://testnet.arcscan.app";
const USDC = "0x3600000000000000000000000000000000000000"; // Arc native USDC precompile
const USYC_TOKEN =
  process.env.ARC_USYC_TOKEN_ADDRESS ||
  "0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C";
const TELLER =
  process.env.ARC_USYC_TELLER_ADDRESS ||
  "0x9fdF14c5B14173D74C08Af27AebFf39240dC105A";
const MINT_FN = process.env.ARC_USYC_TELLER_MINT_FN || "buy(uint256)";
const REDEEM_FN = process.env.ARC_USYC_TELLER_REDEEM_FN || "sell(uint256)";
const VAULT_ADDRESS = process.env.ARC_VAULT_ADDRESS;
const VAULT_WALLET_ID = process.env.ARC_VAULT_WALLET_ID;
const DECIMALS = 6;
const UNIT = 10 ** DECIMALS;

// Canonical, standardised ERC-20 4-byte selectors (part of the ERC-20 spec,
// stable across every compliant token — NOT derived here).
const SEL_BALANCE_OF = "0x70a08231"; // balanceOf(address)
const SEL_ALLOWANCE = "0xdd62ed3e"; // allowance(address,address)

function pad32(hexNo0x) {
  return hexNo0x.replace(/^0x/, "").toLowerCase().padStart(64, "0");
}

async function rpc(method, params) {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`${method}: ${json.error.message}`);
  return json.result;
}

function fromUnits(hex) {
  const v = BigInt(hex && hex !== "0x" ? hex : "0x0");
  const div = BigInt(UNIT);
  return Number(v / div) + Number(v % div) / UNIT;
}

async function erc20BalanceOf(token, holder) {
  const data = SEL_BALANCE_OF + pad32(holder);
  return fromUnits(await rpc("eth_call", [{ to: token, data }, "latest"]));
}

async function erc20Allowance(token, owner, spender) {
  const data = SEL_ALLOWANCE + pad32(owner) + pad32(spender);
  return fromUnits(await rpc("eth_call", [{ to: token, data }, "latest"]));
}

async function isContract(address) {
  const code = await rpc("eth_getCode", [address, "latest"]);
  return typeof code === "string" && code !== "0x" && code.length > 2;
}

function line() {
  console.log("-".repeat(64));
}

async function check() {
  console.log("=== USYC go-live check (read-only) ===\n");

  console.log("Credentials present (booleans only, never printed):");
  console.log("  CIRCLE_API_KEY      :", Boolean(process.env.CIRCLE_API_KEY));
  console.log("  CIRCLE_ENTITY_SECRET:", Boolean(process.env.CIRCLE_ENTITY_SECRET));
  console.log("  ARC_VAULT_ADDRESS   :", VAULT_ADDRESS || "(MISSING!)");
  console.log("  ARC_VAULT_WALLET_ID :", VAULT_WALLET_ID ? "present" : "(MISSING!)");
  console.log("  ARC_USYC_ENABLED    :", process.env.ARC_USYC_ENABLED || "(unset → simulated)");
  line();

  console.log("Contracts:");
  console.log("  USDC token :", USDC);
  console.log("  USYC token :", USYC_TOKEN);
  console.log("  Teller     :", TELLER);
  console.log("  Mint  fn   :", MINT_FN);
  console.log("  Redeem fn  :", REDEEM_FN);
  line();

  if (!VAULT_ADDRESS) {
    console.log("Cannot read balances: ARC_VAULT_ADDRESS is not set.");
    return;
  }

  const [vaultUsdc, vaultUsyc, allowance, tellerDeployed] = await Promise.all([
    erc20BalanceOf(USDC, VAULT_ADDRESS).catch(() => null),
    erc20BalanceOf(USYC_TOKEN, VAULT_ADDRESS).catch(() => null),
    erc20Allowance(USDC, VAULT_ADDRESS, TELLER).catch(() => null),
    isContract(TELLER).catch(() => null),
  ]);

  console.log("Vault on-chain state:");
  console.log("  address          :", VAULT_ADDRESS);
  console.log("  USDC balance     :", vaultUsdc === null ? "read failed" : vaultUsdc.toFixed(6));
  console.log("  USYC balance     :", vaultUsyc === null ? "read failed" : vaultUsyc.toFixed(6));
  console.log("  USDC→Teller allow:", allowance === null ? "read failed" : allowance.toFixed(6));
  console.log("  Teller deployed  :", tellerDeployed === null ? "check failed" : tellerDeployed);
  line();

  console.log("Go-live checklist:");
  const allowOk = typeof allowance === "number" && allowance > 0;
  console.log(
    `  [${allowOk ? "x" : " "}] 1. Teller has a USDC allowance from the vault` +
      (allowOk ? "" : "  → run: node scripts/usyc-golive.cjs approve")
  );
  console.log(
    `  [ ] 2. Confirm Teller mint/redeem signatures on the explorer (read below)`
  );
  console.log(
    `  [${process.env.ARC_USYC_ENABLED === "true" ? "x" : " "}] 3. Set ARC_USYC_ENABLED=true in Vercel env + redeploy`
  );
  line();

  console.log("Verify the Teller's real function names here (authoritative):");
  console.log(`  ${EXPLORER}/address/${TELLER}#code`);
  console.log(
    "  Look for the mint (USDC→USYC) and redeem (USYC→USDC) functions. If they\n" +
      `  are NOT "${MINT_FN}" / "${REDEEM_FN}", set ARC_USYC_TELLER_MINT_FN /\n` +
      "  ARC_USYC_TELLER_REDEEM_FN in env to match before going live.\n"
  );
  console.log("Vault on the explorer:");
  console.log(`  ${EXPLORER}/address/${VAULT_ADDRESS}`);
}

async function approve() {
  if (process.env.CONFIRM !== "yes") {
    console.log(
      "This submits an on-chain ERC-20 approve() from the vault wallet.\n" +
        "It grants the Teller permission to pull the vault's USDC (no funds move,\n" +
        "nothing is minted). Re-run with CONFIRM=yes to proceed:\n\n" +
        "  CONFIRM=yes node scripts/usyc-golive.cjs approve [amountUSDC]\n\n" +
        "Omit the amount to approve a very large cap (effectively unlimited)."
    );
    return;
  }
  if (!VAULT_WALLET_ID) throw new Error("ARC_VAULT_WALLET_ID is not set.");
  if (!process.env.CIRCLE_API_KEY || !process.env.CIRCLE_ENTITY_SECRET) {
    throw new Error("Circle credentials are not set.");
  }

  // Amount in smallest units. Default: a huge cap so we approve once.
  const amountArg = process.argv[3];
  const amountUnits = amountArg
    ? Math.round(Number(amountArg) * UNIT).toString()
    : (BigInt(UNIT) * BigInt(1_000_000_000)).toString(); // 1e9 USDC cap

  const client = initiateDeveloperControlledWalletsClient({
    apiKey: process.env.CIRCLE_API_KEY,
    entitySecret: process.env.CIRCLE_ENTITY_SECRET,
  });

  console.log(`Approving Teller ${TELLER} to spend ${amountUnits} USDC units from the vault…`);
  const res = await client.createContractExecutionTransaction({
    walletId: VAULT_WALLET_ID,
    contractAddress: USDC,
    abiFunctionSignature: "approve(address,uint256)",
    abiParameters: [TELLER, amountUnits],
    fee: { type: "level", config: { feeLevel: "MEDIUM" } },
  });
  const data = res && res.data ? res.data : {};
  console.log("Submitted. Circle tx id:", data.id || "(none)");
  console.log("State:", data.state || "(pending)");
  console.log("\nRe-run the check to confirm the allowance landed:");
  console.log("  node scripts/usyc-golive.cjs");
}

(async () => {
  const mode = (process.argv[2] || "check").toLowerCase();
  if (mode === "approve") return approve();
  return check();
})().catch((e) => {
  console.error("ERROR:", (e && e.message) || e);
  process.exit(1);
});
