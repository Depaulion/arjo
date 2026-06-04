import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { VoteChoice } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Cast (or change) the caller's YES/NO vote on a proposal. Uses upsert so a
 * member can switch their vote. RLS enforces: member of the proposal's circle +
 * proposal still OPEN + one row per (proposal, user). The DB tally trigger
 * auto-approves/rejects/executes the proposal once thresholds are crossed.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } },
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

  const choice = body.choice as VoteChoice;
  if (choice !== "YES" && choice !== "NO") {
    return NextResponse.json(
      { error: "Vote must be YES or NO." },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("proposal_votes")
    .upsert(
      { proposal_id: params.id, user_id: user.id, choice },
      { onConflict: "proposal_id,user_id" },
    );

  if (error) {
    return NextResponse.json(
      {
        error:
          "Could not record your vote. The proposal may be closed or you may not be a member.",
      },
      { status: 400 },
    );
  }

  // Read back the (possibly now-resolved) proposal for the client.
  const { data: proposal } = await supabase
    .from("proposals")
    .select("status")
    .eq("id", params.id)
    .single<{ status: string }>();

  return NextResponse.json({ ok: true, status: proposal?.status ?? "OPEN" });
}
