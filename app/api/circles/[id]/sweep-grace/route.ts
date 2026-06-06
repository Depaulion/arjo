import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Grace-expiry sweep (Phase 4b). Creator-only: opens a RESTRUCTURE proposal for
 * every member whose grace window has passed without catching up, and notifies
 * the circle. Idempotent — members already under an open restructure vote are
 * skipped — so the creator's circle view can fire this on load. The creator
 * guard + all writes live in the SECURITY DEFINER fn sweep_grace_expiries
 * (migration 0016); a non-creator caller gets the function's error.
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

  const { data, error } = await supabase.rpc("sweep_grace_expiries", {
    p_circle_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, opened: Math.max(0, Number(data) || 0) });
}
