"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import {
  SUPPORT_STATUS_LABELS,
  type SupportTicketStatus,
} from "@/lib/types";

const ORDER: SupportTicketStatus[] = [
  "open",
  "in_progress",
  "resolved",
  "closed",
];

/**
 * Admin-only inline status changer for a support ticket. Writes straight to
 * support_tickets (the migration-0011 admin RLS policy authorises the update)
 * and refreshes the server component so counts and ordering stay in sync.
 */
export function AdminTicketStatus({
  ticketId,
  status,
}: {
  ticketId: string;
  status: SupportTicketStatus;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [value, setValue] = useState<SupportTicketStatus>(status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  async function change(next: SupportTicketStatus) {
    const prev = value;
    setValue(next);
    setSaving(true);
    setError(false);
    const { error } = await supabase
      .from("support_tickets")
      .update({ status: next })
      .eq("id", ticketId);
    setSaving(false);
    if (error) {
      setValue(prev);
      setError(true);
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-2">
      {saving && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
      <select
        value={value}
        disabled={saving}
        onChange={(e) => change(e.target.value as SupportTicketStatus)}
        aria-label="Ticket status"
        className={`rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-ring ${
          error ? "border-destructive" : "border-border"
        }`}
      >
        {ORDER.map((s) => (
          <option key={s} value={s}>
            {SUPPORT_STATUS_LABELS[s]}
          </option>
        ))}
      </select>
    </div>
  );
}
