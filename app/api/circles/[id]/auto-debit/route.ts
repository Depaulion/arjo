import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Toggle the caller's own auto-debit for a circle. When on, the platform cron
 * (/api/cron/circle-rounds) pulls each round's contribution from the member's
 * Circle wallet on the due date. Member-scoped: the SECURITY DEFINER RPC
 * set_auto_debit (migration 0021) flips only the caller's row.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const enabled = body.enabled === true;

  const { data, error } = await supabase.rpc("set_auto_debit", {
    p_circle_id: params.id,
    p_enabled: enabled,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, autoDebit: data === true });
}
