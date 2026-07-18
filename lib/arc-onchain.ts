/**
 * Read-only Arc Testnet onchain access for USDC.
 *
 * Arc emits a single ERC-20 `Transfer` event for ALL USDC movement (native
 * sends and `transfer()` calls) on the USDC contract, so one event gives full
 * coverage. The ERC-20 interface uses 6 decimals (the native gas token uses 18
 * — don't mix them). Source: Arc docs, "Indexing events" / "Contract addresses".
 */
import { ARC_TESTNET, ARC_USDC_ADDRESS } from "@/lib/arc";

/** USDC ERC-20 interface decimals on Arc (NOT the 18-dec native gas token). */
export const ARC_USDC_DECIMALS = 6;

/** topic0 of Transfer(address indexed from, address indexed to, uint256 value). */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** keccak256("balanceOf(address)") first 4 bytes. */
const BALANCE_OF_SELECTOR = "0x70a08231";

type RpcResponse<T> = {
  result?: T;
  error?: { code: number; message: string };
};

type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

type RawBlock = { timestamp: string } | null;

export type TransferDirection = "in" | "out";

export type UsdcTransfer = {
  txHash: string;
  logIndex: number;
  blockNumber: number;
  /** ISO timestamp, or null if the block could not be fetched. */
  timestamp: string | null;
  from: string;
  to: string;
  /** Amount in whole USDC (6-decimal value applied). */
  amount: number;
  /** Direction relative to the wallet being inspected. */
  direction: TransferDirection;
  /** The other party (sender for "in", recipient for "out"). */
  counterparty: string;
};

async function rpc<T>(
  method: string,
  params: unknown[],
  { timeoutMs = 15000, retries = 2 }: { timeoutMs?: number; retries?: number } = {}
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(ARC_TESTNET.rpcUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: controller.signal,
        cache: "no-store",
      });
      const json = (await res.json()) as RpcResponse<T>;
      if (json.error) throw new Error(`${method}: ${json.error.message}`);
      return json.result as T;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error(`RPC ${method} failed`);
}

/** Batched JSON-RPC call. Returns results in request order. */
async function rpcBatch<T>(
  calls: Array<{ method: string; params: unknown[] }>,
  { timeoutMs = 15000 }: { timeoutMs?: number } = {}
): Promise<Array<T | null>> {
  if (calls.length === 0) return [];
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(ARC_TESTNET.rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(
        calls.map((c, i) => ({
          jsonrpc: "2.0",
          id: i,
          method: c.method,
          params: c.params,
        }))
      ),
      signal: controller.signal,
      cache: "no-store",
    });
    const json = (await res.json()) as Array<RpcResponse<T> & { id: number }>;
    const ordered: Array<T | null> = new Array(calls.length).fill(null);
    for (const entry of json) {
      if (typeof entry.id === "number" && entry.result !== undefined) {
        ordered[entry.id] = entry.result;
      }
    }
    return ordered;
  } finally {
    clearTimeout(timer);
  }
}

function toAddress(topic: string): string {
  // A 32-byte topic; the address is the low 20 bytes (last 40 hex chars).
  return ("0x" + topic.slice(-40)).toLowerCase();
}

function topicForAddress(address: string): string {
  return "0x" + address.toLowerCase().replace(/^0x/, "").padStart(64, "0");
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex === "0x" || !hex ? "0x0" : hex);
}

/** Convert a raw 6-decimal USDC value to a JS number of whole USDC. */
export function formatUsdcUnits(value: bigint): number {
  // 10 ** decimals, built without a BigInt literal (tsconfig targets < ES2020).
  const divisor = BigInt("1" + "0".repeat(ARC_USDC_DECIMALS));
  const whole = value / divisor;
  const frac = value % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}

/** Convert a raw integer token value at `decimals` precision to a JS number. */
export function formatTokenUnits(value: bigint, decimals: number): number {
  const divisor = BigInt("1" + "0".repeat(decimals));
  const whole = value / divisor;
  const frac = value % divisor;
  return Number(whole) + Number(frac) / Number(divisor);
}

/**
 * Read an ERC-20 `balanceOf(address)` for any token on Arc and return the
 * balance as a whole-token JS number. Used for USDC (6dp) and USYC (6dp) alike.
 */
export async function erc20BalanceOf(
  tokenAddress: string,
  holder: string,
  decimals: number
): Promise<number> {
  const data = BALANCE_OF_SELECTOR + holder.replace(/^0x/, "").padStart(64, "0");
  const result = await rpc<string>("eth_call", [
    { to: tokenAddress, data },
    "latest",
  ]);
  return formatTokenUnits(hexToBigInt(result), decimals);
}

/** Current USDC balance (whole USDC) of an address via the ERC-20 precompile. */
export async function getUsdcBalance(address: string): Promise<number> {
  return erc20BalanceOf(ARC_USDC_ADDRESS, address, ARC_USDC_DECIMALS);
}

export type TransferScan = {
  transfers: UsdcTransfer[];
  /** Lowest block actually scanned (so the UI can show the covered window). */
  fromBlock: number;
  latestBlock: number;
};

/**
 * Fetch USDC transfers to/from `address` over a bounded recent window. Scans in
 * descending block chunks and stops once `maxTransfers` is reached, keeping the
 * call cheap on a 45M-block chain. Returns newest first.
 */
export async function getUsdcTransfers(
  address: string,
  {
    // The public RPC caps eth_getLogs at a 10,000-block range, so chunkSize must
    // stay <= 10,000. Lookback defaults to ~100k blocks of recent history and is
    // overridable via ARC_LOOKBACK_BLOCKS.
    lookbackBlocks = Number(process.env.ARC_LOOKBACK_BLOCKS ?? 100_000),
    chunkSize = 10_000,
    maxTransfers = 50,
  }: { lookbackBlocks?: number; chunkSize?: number; maxTransfers?: number } = {}
): Promise<TransferScan> {
  const latestBlock = Number(hexToBigInt(await rpc<string>("eth_blockNumber", [])));
  const floor = Math.max(0, latestBlock - lookbackBlocks);
  const padded = topicForAddress(address);
  const lower = address.toLowerCase();

  const collected: UsdcTransfer[] = [];
  let cursor = latestBlock;
  let scannedFrom = latestBlock;

  while (cursor > floor && collected.length < maxTransfers) {
    const chunkFrom = Math.max(floor, cursor - chunkSize + 1);
    const fromHex = "0x" + chunkFrom.toString(16);
    const toHex = "0x" + cursor.toString(16);

    // Outgoing (from = address) and incoming (to = address).
    const [outLogs, inLogs] = await Promise.all([
      rpc<RawLog[]>("eth_getLogs", [
        { address: ARC_USDC_ADDRESS, topics: [TRANSFER_TOPIC, padded], fromBlock: fromHex, toBlock: toHex },
      ]).catch(() => [] as RawLog[]),
      rpc<RawLog[]>("eth_getLogs", [
        { address: ARC_USDC_ADDRESS, topics: [TRANSFER_TOPIC, null, padded], fromBlock: fromHex, toBlock: toHex },
      ]).catch(() => [] as RawLog[]),
    ]);

    for (const log of [...outLogs, ...inLogs]) {
      const from = toAddress(log.topics[1]);
      const to = toAddress(log.topics[2]);
      const direction: TransferDirection = from === lower ? "out" : "in";
      collected.push({
        txHash: log.transactionHash,
        logIndex: Number(hexToBigInt(log.logIndex)),
        blockNumber: Number(hexToBigInt(log.blockNumber)),
        timestamp: null,
        from,
        to,
        amount: formatUsdcUnits(hexToBigInt(log.data)),
        direction,
        counterparty: direction === "out" ? to : from,
      });
    }

    scannedFrom = chunkFrom;
    cursor = chunkFrom - 1;
  }

  // Dedupe (a self-transfer would appear in both queries) and sort newest first.
  const seen = new Set<string>();
  const unique = collected.filter((t) => {
    const key = `${t.txHash}:${t.logIndex}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  unique.sort(
    (a, b) => b.blockNumber - a.blockNumber || b.logIndex - a.logIndex
  );
  const transfers = unique.slice(0, maxTransfers);

  // Resolve block timestamps in one batch.
  const uniqueBlocks = Array.from(new Set(transfers.map((t) => t.blockNumber)));
  if (uniqueBlocks.length > 0) {
    try {
      const blocks = await rpcBatch<RawBlock>(
        uniqueBlocks.map((n) => ({
          method: "eth_getBlockByNumber",
          params: ["0x" + n.toString(16), false],
        }))
      );
      const tsByBlock = new Map<number, string>();
      uniqueBlocks.forEach((n, i) => {
        const block = blocks[i];
        if (block?.timestamp) {
          tsByBlock.set(
            n,
            new Date(Number(hexToBigInt(block.timestamp)) * 1000).toISOString()
          );
        }
      });
      for (const t of transfers) {
        t.timestamp = tsByBlock.get(t.blockNumber) ?? null;
      }
    } catch {
      // Timestamps are best-effort; leave them null on failure.
    }
  }

  return { transfers, fromBlock: scannedFrom, latestBlock };
}
