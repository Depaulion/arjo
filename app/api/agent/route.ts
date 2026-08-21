import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit, tooManyRequests } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Savings Agent policy. GET returns the caller's current policy; POST saves it.
 * Both are auth.uid()-scoped (RLS on savings_agent + the SECURITY DEFINER setter
 * from migration 0028), so a user only ever reads/writes their own agent.
 */
export async function GET() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data } = await supabase
    .from("savings_agent")
    .select("enabled, liquid_floor, lock_days, min_sweep")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    enabled: data?.enabled ?? false,
    liquidFloor: Number(data?.liquid_floor ?? 0),
    lockDays: Number(data?.lock_days ?? 30),
    minSweep: Number(data?.min_sweep ?? 1),
  });
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const rl = rateLimit(`agent:u:${user.id}`, 30, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const enabled = body.enabled === true;
  const liquidFloor = Math.max(0, Number(body.liquidFloor ?? 0));
  const lockDays = Math.min(3650, Math.max(1, Math.round(Number(body.lockDays ?? 30))));
  const minSweep = Math.max(0, Number(body.minSweep ?? 1));

  if (!Number.isFinite(liquidFloor) || !Number.isFinite(minSweep)) {
    return NextResponse.json({ error: "Invalid amounts." }, { status: 400 });
  }

  const { error } = await supabase.rpc("set_savings_agent", {
    p_enabled: enabled,
    p_liquid_floor: liquidFloor,
    p_lock_days: lockDays,
    p_min_sweep: minSweep,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    enabled,
    liquidFloor,
    lockDays,
    minSweep,
  });
}
