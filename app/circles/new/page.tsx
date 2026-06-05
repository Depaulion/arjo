import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Coins } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import type { ArcStablecoin } from "@/lib/arc";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CreateCircleForm } from "@/components/circles/create-circle-form";

export default async function NewCirclePage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/circles/new");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferred_stablecoin")
    .eq("id", user.id)
    .single<{ preferred_stablecoin: ArcStablecoin }>();

  const currency = profile?.preferred_stablecoin ?? "USDC";

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 text-lg font-bold">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Coins className="h-5 w-5" />
            </span>
            <span className="tracking-tight">
              Ar<span className="text-primary">jo</span>
            </span>
          </Link>
          <Link
            href="/account"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to account
          </Link>
        </div>
      </header>

      <main className="container max-w-xl py-12">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight">Create a circle</h1>
          <p className="mt-1 text-muted-foreground">
            Set up a new Ajo savings group. You can invite members once it&apos;s
            created.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Circle details</CardTitle>
            <CardDescription>
              Contributions are denominated in {currency} on Arc.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CreateCircleForm userId={user.id} currency={currency} />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
