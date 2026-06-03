import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured } from "@/lib/circle";
import { reconcilePendingLedger } from "@/lib/reconcile";

export const runtime = "nodejs";

/**
 * Poll pending ledger entries against Circle's transaction state and settle
 * them. Triggered from the dashboard "Sync" button; safe to call repeatedly.
 */
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const summary = await reconcilePendingLedger(supabase, user.id);
  return NextResponse.json({
    summary,
    configured: isCircleConfigured(),
  });
}
