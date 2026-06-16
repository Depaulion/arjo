import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://arc-ajo.vercel.app"
  );
}

function inviteLink(circleId: string, code: string): string {
  return `${siteUrl()}/circles/${circleId}?invite=${code}`;
}

/**
 * Manage a circle's invite link (creator-only).
 *   POST  { regenerate? } → get-or-create (or rotate) the code; returns the link
 *   DELETE                → revoke the invite (invalidates shared links)
 * Both go through creator-gated SECURITY DEFINER RPCs (migration 0027).
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

  let regenerate = false;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    regenerate = body.regenerate === true;
  } catch {
    /* no body → get-or-create */
  }

  const { data, error } = await supabase.rpc("set_circle_invite", {
    p_circle_id: params.id,
    p_regenerate: regenerate,
  });
  if (error || typeof data !== "string") {
    return NextResponse.json(
      { error: error?.message ?? "Couldn't create the invite." },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    code: data,
    link: inviteLink(params.id, data),
  });
}

export async function DELETE(
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

  const { error } = await supabase.rpc("revoke_circle_invite", {
    p_circle_id: params.id,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
