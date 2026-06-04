import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Cancel an OPEN proposal. RLS ("Proposers and creators can update proposals")
 * limits this to the proposal's author or the circle's creator.
 */
export async function POST(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { error } = await supabase
    .from("proposals")
    .update({ status: "CANCELLED", resolved_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("status", "OPEN");

  if (error) {
    return NextResponse.json(
      { error: "Could not cancel this proposal." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}
