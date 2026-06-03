/**
 * Arc (Circle) ecosystem constants — Arc Testnet.
 * Source: Arc developer docs (Connect to Arc, Contract addresses).
 * USDC is the native gas token on Arc (18 decimals).
 */
export const ARC_TESTNET = {
  name: "Arc Testnet",
  chainId: Number(process.env.NEXT_PUBLIC_ARC_CHAIN_ID ?? 5042002),
  rpcUrl: process.env.NEXT_PUBLIC_ARC_RPC_URL ?? "https://rpc.testnet.arc.network",
  explorerUrl:
    process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ?? "https://testnet.arcscan.app",
  faucetUrl: "https://faucet.circle.com",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 18 },
} as const;

/** Stablecoins supported on Arc that an Ajo circle can save in. */
export const ARC_STABLECOINS = ["USDC", "EURC", "USYC"] as const;
export type ArcStablecoin = (typeof ARC_STABLECOINS)[number];

/** Native USDC ERC-20 precompile address on Arc. */
export const ARC_USDC_ADDRESS =
  "0x3600000000000000000000000000000000000000" as const;

/** Build a block-explorer link for an address on Arc Testnet. */
export function arcAddressUrl(address: string) {
  return `${ARC_TESTNET.explorerUrl}/address/${address}`;
}

/** Build a block-explorer link for a transaction hash on Arc Testnet. */
export function arcTxUrl(txHash: string) {
  return `${ARC_TESTNET.explorerUrl}/tx/${txHash}`;
}

/** Shorten an EVM address/hash for display, e.g. 0x1234…abcd. */
export function shortenHex(value: string, lead = 6, tail = 4) {
  if (value.length <= lead + tail + 1) return value;
  return `${value.slice(0, lead)}…${value.slice(-tail)}`;
}

/** Loose check for an EVM (0x-prefixed, 40 hex) address. */
export function isEvmAddress(value: string) {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}
