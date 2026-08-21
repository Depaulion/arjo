import { NextResponse } from "next/server";
import { verifyMessage, isAddress, getAddress } from "viem";

import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** The exact message the user signs to prove wallet ownership. */
function challenge(address: string, nonce: string): string {
  return [
    "Arjo — verify wallet ownership",
    "",
    "Sign this message to link this wallet to your Arjo account.",
    "It does not cost anything and grants no spending permission.",
    "",
    `Address: ${address}`,
    `Nonce: ${nonce}`,
  ].join("\n");
}

/**
 * Connect & verify an external wallet.
 *   GET    → issue a one-time nonce + the message to sign
 *   POST   → verify the signature and save the address as verified
 *   DELETE → unlink the verified wallet
 * All operate on the caller's own profile row via RLS — no service-role key.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data } = await supabase
    .from("profiles")
    .select("verified_wallet_address")
    .eq("id", user.id)
    .maybeSingle<{ verified_wallet_address: string | null }>();

  const nonce =
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  await supabase
    .from("profiles")
    .update({
      wallet_link_nonce: nonce,
      wallet_link_nonce_expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    })
    .eq("id", user.id);

  return NextResponse.json({
    connected: data?.verified_wallet_address ?? null,
    nonce,
    // Client fills in its own address; we return a template it completes.
    messageTemplate: challenge("{address}", nonce),
  });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = rateLimit(`walletconnect:u:${user.id}`, 10, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { address?: unknown; signature?: unknown };
  try {
    body = (await request.json()) as { address?: unknown; signature?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const address = String(body.address ?? "");
  const signature = String(body.signature ?? "");
  if (!isAddress(address) || !signature.startsWith("0x")) {
    return NextResponse.json({ error: "Invalid address or signature." }, { status: 400 });
  }

  // Load the caller's stored nonce and confirm it's still valid.
  const { data: profile } = await supabase
    .from("profiles")
    .select("wallet_link_nonce, wallet_link_nonce_expires_at")
    .eq("id", user.id)
    .maybeSingle<{
      wallet_link_nonce: string | null;
      wallet_link_nonce_expires_at: string | null;
    }>();

  const nonce = profile?.wallet_link_nonce;
  const notExpired =
    profile?.wallet_link_nonce_expires_at != null &&
    new Date(profile.wallet_link_nonce_expires_at) > new Date();
  if (!nonce || !notExpired) {
    return NextResponse.json(
      { error: "Verification expired — start again." },
      { status: 400 }
    );
  }

  // Verify the signature over the EXACT message the client signed (the address
  // must appear byte-for-byte as the client used it, so we don't re-checksum it
  // for the message — viem compares the recovered signer case-insensitively).
  let valid = false;
  try {
    valid = await verifyMessage({
      address: address as `0x${string}`,
      message: challenge(address, nonce),
      signature: signature as `0x${string}`,
    });
  } catch {
    valid = false;
  }
  if (!valid) {
    return NextResponse.json(
      { error: "Signature didn't verify. Make sure you signed with that wallet." },
      { status: 400 }
    );
  }

  // Ownership proven — save the checksummed address and consume the nonce.
  const checksummed = getAddress(address);
  const { error } = await supabase
    .from("profiles")
    .update({
      verified_wallet_address: checksummed,
      wallet_link_nonce: null,
      wallet_link_nonce_expires_at: null,
    })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, connected: checksummed });
}

export async function DELETE() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("profiles")
    .update({ verified_wallet_address: null })
    .eq("id", user.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
