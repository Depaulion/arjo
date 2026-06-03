import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { isCircleConfigured, provisionWalletForUser } from "@/lib/circle";

// Handles the OAuth (Google) and email-confirmation redirect: exchanges the
// `code` for a session, auto-provisions a Circle wallet for new users, then
// sends them on to their destination.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const redirect = searchParams.get("redirect") ?? "/account";

  if (code) {
    const supabase = createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Best-effort wallet provisioning — never block sign-in if Circle is down
      // or unconfigured. The account page retries as a fallback.
      if (data.user && isCircleConfigured()) {
        try {
          await provisionWalletForUser(supabase, data.user.id);
        } catch (err) {
          console.error("[circle] wallet provisioning failed on callback:", err);
        }
      }
      return NextResponse.redirect(`${origin}${redirect}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
