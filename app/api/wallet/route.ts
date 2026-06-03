import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured, provisionWalletForUser } from "@/lib/circle";

// Returns the signed-in user's wallet (if any).
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
    .select("arc_wallet_address, circle_wallet_id, wallet_blockchain")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    address: data?.arc_wallet_address ?? null,
    walletId: data?.circle_wallet_id ?? null,
    blockchain: data?.wallet_blockchain ?? null,
    configured: isCircleConfigured(),
  });
}

// Idempotently provisions a Circle wallet for the signed-in user.
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (!isCircleConfigured()) {
    return NextResponse.json(
      { error: "Circle wallets are not configured on the server." },
      { status: 503 }
    );
  }

  try {
    const wallet = await provisionWalletForUser(supabase, user.id);
    return NextResponse.json(wallet);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Provisioning failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
