"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";

export function JoinCircleButton({
  circleId,
  joined,
}: {
  circleId: string;
  /** Present for API parity with callers; the join route derives the user. */
  userId?: string;
  joined: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [done, setDone] = useState(joined);

  async function join() {
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/circles/${circleId}/join`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        error?: string;
        bond?: number;
        bondMultiplier?: number;
        currency?: string;
        pending?: boolean;
      };
      if (!res.ok) {
        setError(json.error ?? "Could not join this circle.");
        return;
      }
      if (json.bond && json.bond > 0) {
        const surcharge =
          json.bondMultiplier && json.bondMultiplier > 1
            ? ` (${json.bondMultiplier}× risk surcharge)`
            : "";
        setNotice(
          json.pending
            ? `Joined. Bond of ${json.bond} ${json.currency}${surcharge} is pending — fund your Arc wallet and it will settle.`
            : `Joined. ${json.bond} ${json.currency}${surcharge} bond is held and refunded when you complete the circle.`
        );
      }
      setDone(true);
      router.refresh();
    } catch {
      setError("Network error — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (done) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button size="sm" variant="outline" disabled className="shrink-0">
          <Check className="h-4 w-4" />
          Joined
        </Button>
        {notice && (
          <p className="max-w-[16rem] text-right text-xs text-muted-foreground">
            {notice}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={join} disabled={loading} className="shrink-0">
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <UserPlus className="h-4 w-4" />
        )}
        Join
      </Button>
      {error && (
        <p className="max-w-[16rem] text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
