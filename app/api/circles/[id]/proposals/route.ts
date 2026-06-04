import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { ProposalType } from "@/lib/types";

export const runtime = "nodejs";

const VALID_TYPES: ProposalType[] = [
  "PAYOUT_ORDER_CHANGE",
  "MEMBER_EXIT_REQUEST",
  "MEMBER_REMOVAL",
  "RULE_CHANGE",
];

/**
 * Raise a governance proposal in a circle. RLS guarantees the caller is a member
 * of the circle (insert policy "Members can raise proposals").
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

  const type = body.type as ProposalType;
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: "Unknown proposal type." }, { status: 400 });
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (title.length < 2 || title.length > 140) {
    return NextResponse.json(
      { error: "Give the proposal a title (2–140 characters)." },
      { status: 400 },
    );
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const targetUserId =
    typeof body.targetUserId === "string" && body.targetUserId
      ? body.targetUserId
      : null;

  // Payload validation per type.
  let payload: Record<string, unknown> = {};
  if (type === "PAYOUT_ORDER_CHANGE") {
    const order = Array.isArray(body.order)
      ? (body.order as unknown[]).filter((x) => typeof x === "string")
      : [];
    if (order.length < 2) {
      return NextResponse.json(
        { error: "Provide the new payout order." },
        { status: 400 },
      );
    }
    payload = { order };
  } else if (type === "MEMBER_EXIT_REQUEST" || type === "MEMBER_REMOVAL") {
    if (!targetUserId) {
      return NextResponse.json(
        { error: "Select which member this proposal is about." },
        { status: 400 },
      );
    }
  }

  const { data, error } = await supabase
    .from("proposals")
    .insert({
      circle_id: params.id,
      created_by: user.id,
      type,
      title,
      description,
      payload,
      target_user_id: targetUserId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "Could not create the proposal." },
      { status: 400 },
    );
  }

  return NextResponse.json({ id: data.id });
}
