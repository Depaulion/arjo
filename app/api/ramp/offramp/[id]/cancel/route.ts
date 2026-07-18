import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Cancel a pending off-ramp request before a provider settles it.
 *
 * An off-ramp records a pending `withdraw` row with NO onchain footprint
 * (no circle_tx_id, no tx_hash) — the reconciler never touches those, so they
 * sit pending until cancelled. We mark the row `failed` (the terminal
 * non-success state; there is no `cancelled` status without a migration) and
 * note the reason, which renders inline in the activity feed.
 *
 * The guard only matches rows with no onchain action, so this can never cancel
 * an in-flight transfer. RLS already scopes ledger_entries to the caller; the
 * explicit user_id filter is defence in depth.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("ledger_entries")
    .update({
      status: "failed",
      note: "Off-ramp request cancelled before settlement.",
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .eq("kind", "withdraw")
    .eq("status", "pending")
    .is("circle_tx_id", null)
    .is("tx_hash", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    return NextResponse.json(
      { error: "Could not cancel this request." },
      { status: 400 }
    );
  }
  if (!data) {
    return NextResponse.json(
      { error: "This request can no longer be cancelled." },
      { status: 409 }
    );
  }

  return NextResponse.json({ ok: true });
}
