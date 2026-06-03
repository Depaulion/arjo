"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, UserPlus } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function JoinCircleButton({
  circleId,
  userId,
  joined,
}: {
  circleId: string;
  userId: string;
  joined: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(joined);

  async function join() {
    setLoading(true);
    setError(null);
    const { error } = await supabase
      .from("circle_members")
      .insert({ circle_id: circleId, user_id: userId, role: "member" });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
    router.refresh();
  }

  if (done) {
    return (
      <Button size="sm" variant="outline" disabled className="shrink-0">
        <Check className="h-4 w-4" />
        Joined
      </Button>
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
