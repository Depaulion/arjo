import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Notification, NotificationType } from "@/lib/types";
import type {
  AppNotification,
  NotificationTone,
} from "@/components/dashboard/notification-bell";

/**
 * Presentation metadata for each persisted notification type: the bell icon,
 * the urgency tone, and a short title (the stored message becomes the body).
 */
const META: Record<
  NotificationType,
  { title: string; icon: AppNotification["icon"]; tone: NotificationTone }
> = {
  default_warning: { title: "Missed contribution", icon: "alert", tone: "alert" },
  grace_period: { title: "Grace period active", icon: "alert", tone: "alert" },
  bond_slashed: { title: "Bond slashed", icon: "alert", tone: "alert" },
  payout_delayed: { title: "Payout delayed", icon: "sync", tone: "reminder" },
  restructure_vote: { title: "Circle restructure vote", icon: "vote", tone: "reminder" },
  payout_protected: { title: "Your payout is protected", icon: "shield", tone: "info" },
  reinstatement_eligible: { title: "You can rejoin circles", icon: "gift", tone: "info" },
  auto_debit_upcoming: { title: "Auto-debit upcoming", icon: "sync", tone: "reminder" },
  auto_debit_paid: { title: "Contribution auto-paid", icon: "wallet", tone: "info" },
  auto_debit_failed: { title: "Auto-debit couldn't run", icon: "alert", tone: "alert" },
};

/** Map a stored notification row to the bell's presentational shape. */
function toApp(n: Notification): AppNotification {
  const meta = META[n.type];
  return {
    id: `db:${n.id}`,
    title: meta.title,
    body: n.message,
    icon: meta.icon,
    tone: meta.tone,
    href: n.circle_id ? `/circles/${n.circle_id}` : "#community",
  };
}

/**
 * Fetch a member's most recent persisted notifications, newest first, already
 * mapped for the header bell. Owner-scoped by RLS; safe to call on every load.
 */
export async function getPersistedNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 12
): Promise<AppNotification[]> {
  const { data } = await supabase
    .from("notifications")
    .select("id, user_id, circle_id, type, message, read, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  return ((data ?? []) as Notification[]).map(toApp);
}
