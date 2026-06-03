import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Coins } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth/auth-form";

export default async function LoginPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect("/account");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="container flex flex-1 items-center justify-center py-12">
        <div className="w-full max-w-md">
          <Link
            href="/"
            className="mb-8 flex items-center justify-center gap-2 text-lg font-bold"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            Arc<span className="text-primary">Ajo</span>
          </Link>

          <div className="rounded-3xl border border-border/70 bg-card p-8 shadow-xl">
            <div className="mb-6 text-center">
              <h1 className="text-2xl font-bold tracking-tight">
                Welcome back
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Save together, powered by stablecoins on Arc.
              </p>
            </div>

            <Suspense fallback={<div className="h-72" />}>
              <AuthForm />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            By continuing you agree to Arc Ajo&apos;s Terms and Privacy Policy.
          </p>
        </div>
      </div>
    </div>
  );
}
