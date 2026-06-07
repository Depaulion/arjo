import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import type { SavingsPlan } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Link (or unlink) an existing savings plan to a goal so it counts toward that
 * goal's funded progress. Pass `{ goalId: "<uuid>" }` to assign, or
 * `{ goalId: null }` to detach. Owner-scoped: both the plan and the goal must
 * belong to the caller. No money moves — this only re-tags where the already-
 * committed principal is attributed.
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const goalId = body.goalId ? String(body.goalId) : null;

  // Confirm the plan is the caller's.
  const { data: plan, error: planError } = await supabase
    .from("savings_plans")
    .select("id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle<{ id: string }>();
  if (planError || !plan) {
    return NextResponse.json({ error: "Plan not found." }, { status: 404 });
  }

  // If assigning, confirm the goal is the caller's too.
  if (goalId) {
    const { data: goal } = await supabase
      .from("savings_goals")
      .select("id")
      .eq("id", goalId)
      .eq("user_id", user.id)
      .maybeSingle<{ id: string }>();
    if (!goal) {
      return NextResponse.json(
        { error: "That goal could not be found." },
        { status: 400 }
      );
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from("savings_plans")
    .update({ goal_id: goalId })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("*")
    .single<SavingsPlan>();

  if (updateError || !updated) {
    return NextResponse.json(
      { error: updateError?.message ?? "Could not update the plan." },
      { status: 500 }
    );
  }

  return NextResponse.json({ plan: updated });
}
