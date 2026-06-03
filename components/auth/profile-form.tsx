"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { ARC_STABLECOINS } from "@/lib/arc";
import type { Profile } from "@/lib/types";
import { Button } from "@/components/ui/button";

export function ProfileForm({ profile }: { profile: Profile }) {
  const router = useRouter();
  const supabase = createClient();

  const [fullName, setFullName] = useState(profile.full_name ?? "");
  const [stablecoin, setStablecoin] = useState(profile.preferred_stablecoin);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        preferred_stablecoin: stablecoin,
      })
      .eq("id", profile.id);
    setSaving(false);

    if (error) {
      setError(error.message);
      return;
    }
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="fullName" className="text-sm font-medium">
          Full name
        </label>
        <input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={profile.email ?? ""}
          disabled
          className="h-11 w-full rounded-xl border border-input bg-muted px-4 text-sm text-muted-foreground"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="stablecoin" className="text-sm font-medium">
          Preferred stablecoin
        </label>
        <select
          id="stablecoin"
          value={stablecoin}
          onChange={(e) =>
            setStablecoin(e.target.value as Profile["preferred_stablecoin"])
          }
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {ARC_STABLECOINS.map((coin) => (
            <option key={coin} value={coin}>
              {coin}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save changes
        </Button>
        {saved && (
          <span className="flex items-center gap-1 text-sm text-primary">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
      </div>
    </form>
  );
}
