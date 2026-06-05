import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Coins, LifeBuoy, MessageSquare } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
  type SupportTicket,
} from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { SupportForm } from "@/components/support/support-form";

function categoryLabel(value: SupportTicket["category"]) {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function statusVariant(
  status: SupportTicket["status"]
): "default" | "accent" | "outline" {
  if (status === "resolved" || status === "closed") return "accent";
  if (status === "in_progress") return "default";
  return "outline";
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default async function SupportPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/support");
  }

  const { data } = await supabase
    .from("support_tickets")
    .select(
      "id, user_id, subject, category, message, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  const tickets = (data ?? []) as SupportTicket[];

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

      <main className="container max-w-2xl py-12">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <LifeBuoy className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Help &amp; support</h1>
            <p className="mt-1 text-muted-foreground">
              Have a question or hit a snag? Send us a message and we&apos;ll get
              back to you.
            </p>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contact support</CardTitle>
            <CardDescription>
              For quick answers, check the{" "}
              <Link href="/docs#faq" className="text-primary hover:underline">
                FAQ
              </Link>{" "}
              first — otherwise, drop us a note below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SupportForm userId={user.id} />
          </CardContent>
        </Card>

        {/* Past tickets */}
        <section className="mt-10">
          <h2 className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <MessageSquare className="h-5 w-5 text-primary" />
            Your messages
          </h2>
          {tickets.length === 0 ? (
            <p className="mt-3 rounded-2xl border border-dashed border-border/70 bg-card p-6 text-center text-sm text-muted-foreground">
              You haven&apos;t contacted support yet. Anything you send will show
              up here so you can track its status.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {tickets.map((t) => (
                <li
                  key={t.id}
                  className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate font-semibold leading-tight">
                        {t.subject}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {categoryLabel(t.category)} · {formatDate(t.created_at)}
                      </p>
                    </div>
                    <Badge variant={statusVariant(t.status)}>
                      {SUPPORT_STATUS_LABELS[t.status]}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {t.message}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
