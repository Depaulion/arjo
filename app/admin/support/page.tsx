import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Coins, Inbox, ShieldCheck } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import {
  SUPPORT_CATEGORIES,
  SUPPORT_STATUS_LABELS,
  type SupportTicket,
  type SupportTicketStatus,
} from "@/lib/types";
import { AdminTicketStatus } from "@/components/support/admin-ticket-status";

export const dynamic = "force-dynamic";

function categoryLabel(value: SupportTicket["category"]) {
  return SUPPORT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

type Member = { id: string; full_name: string | null; email: string | null };

const STATUS_ORDER: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

export default async function AdminSupportPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/admin/support");
  }

  const { data: me } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", user.id)
    .single<{ is_admin: boolean }>();

  // Hide the page entirely from non-admins (404 rather than leak its existence).
  if (!me?.is_admin) {
    notFound();
  }

  const { data: ticketData } = await supabase
    .from("support_tickets")
    .select(
      "id, user_id, subject, category, message, status, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  const tickets = (ticketData ?? []) as SupportTicket[];

  // Attribute each ticket to its member (admin RLS allows reading all profiles).
  const userIds = Array.from(new Set(tickets.map((t) => t.user_id)));
  const memberById = new Map<string, Member>();
  if (userIds.length > 0) {
    const { data: members } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const m of (members ?? []) as Member[]) memberById.set(m.id, m);
  }

  const counts = STATUS_ORDER.reduce<Record<SupportTicketStatus, number>>(
    (acc, s) => {
      acc[s] = tickets.filter((t) => t.status === s).length;
      return acc;
    },
    { open: 0, in_progress: 0, resolved: 0, closed: 0 }
  );

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

      <main className="container max-w-3xl py-12">
        <div className="mb-8 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Support inbox</h1>
            <p className="mt-1 text-muted-foreground">
              Every member message, newest first. Change a status to triage.
            </p>
          </div>
        </div>

        {/* Status summary */}
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {STATUS_ORDER.map((s) => (
            <div
              key={s}
              className="rounded-2xl border border-border/60 bg-card p-4 text-center shadow-sm"
            >
              <p className="text-2xl font-bold tabular-nums">{counts[s]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {SUPPORT_STATUS_LABELS[s]}
              </p>
            </div>
          ))}
        </div>

        {tickets.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-border/70 bg-card p-10 text-center shadow-sm">
            <Inbox className="mx-auto h-7 w-7 text-muted-foreground" />
            <p className="mt-3 text-base font-semibold">No tickets yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
              When members contact support, their messages land here.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {tickets.map((t) => {
              const member = memberById.get(t.user_id);
              return (
                <li
                  key={t.id}
                  className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold leading-tight">{t.subject}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {member?.full_name || member?.email || "Member"}
                        {member?.email && member?.full_name
                          ? ` · ${member.email}`
                          : ""}{" "}
                        · {categoryLabel(t.category)} · {formatDate(t.created_at)}
                      </p>
                    </div>
                    <AdminTicketStatus ticketId={t.id} status={t.status} />
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">
                    {t.message}
                  </p>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
