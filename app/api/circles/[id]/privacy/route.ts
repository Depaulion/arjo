import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Toggle a circle's "private amounts" mode (privacy with governed visibility).
 * Creator-only: the SECURITY DEFINER RPC set_circle_privacy (migration 0022)
 * enforces the creator check and flips circles.private_amounts. When on, the
 * pot total stays visible to all members but individual contribution figures
 * are masked from everyone except the member themselves and the creator.
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

  const isPrivate = body.private === true;

  const { data, error } = await supabase.rpc("set_circle_privacy", {
    p_circle_id: params.id,
    p_private: isPrivate,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, private: data === true });
}
