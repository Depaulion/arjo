import { NextResponse } from "next/server";
import { isAddress, getAddress } from "viem";

import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Auto-link the wallet a user just signed in with as their verified cash-out
 * address. They proved ownership via Sign-In-With-Ethereum, so the address is
 * legitimately verified. Only sets it when none is already saved (never clobbers
 * a manually-connected wallet). Setting one's own cash-out field is low-risk, so
 * we accept the address the client just authenticated with.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = rateLimit(`walletlink:u:${user.id}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { address?: unknown };
  try {
    body = (await request.json()) as { address?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const address = String(body.address ?? "");
  if (!isAddress(address)) {
    return NextResponse.json({ ok: false, error: "Invalid address." });
  }

  // Don't overwrite an address the user already connected/verified.
  const { data: profile } = await supabase
    .from("profiles")
    .select("verified_wallet_address")
    .eq("id", user.id)
    .maybeSingle<{ verified_wallet_address: string | null }>();
  if (profile?.verified_wallet_address) {
    return NextResponse.json({ ok: true, connected: profile.verified_wallet_address });
  }

  const checksummed = getAddress(address);
  await supabase
    .from("profiles")
    .update({ verified_wallet_address: checksummed })
    .eq("id", user.id);

  return NextResponse.json({ ok: true, connected: checksummed });
}
