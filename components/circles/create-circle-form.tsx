"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { CIRCLE_FREQUENCIES, type CircleFrequency } from "@/lib/types";
import type { ArcStablecoin } from "@/lib/arc";
import { Button } from "@/components/ui/button";

export function CreateCircleForm({
  userId,
  currency,
}: {
  userId: string;
  currency: ArcStablecoin;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [frequency, setFrequency] = useState<CircleFrequency>("monthly");
  const [memberCount, setMemberCount] = useState("8");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const contribution = Number(amount);
    const members = Number(memberCount);

    if (!name.trim()) {
      setError("Give your circle a name.");
      return;
    }
    if (!Number.isFinite(contribution) || contribution <= 0) {
      setError("Enter a contribution amount greater than zero.");
      return;
    }
    if (!Number.isInteger(members) || members < 2 || members > 100) {
      setError("A circle needs between 2 and 100 members.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.from("circles").insert({
      created_by: userId,
      name: name.trim(),
      contribution_amount: contribution,
      currency,
      frequency,
      member_count: members,
      description: description.trim() || null,
      is_public: isPublic,
    });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push("/account");
    router.refresh();
  }

  const pool = Number(amount) * Number(memberCount);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-1.5">
        <label htmlFor="name" className="text-sm font-medium">
          Group name
        </label>
        <input
          id="name"
          type="text"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lagos Founders Circle"
          className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="amount" className="text-sm font-medium">
          Contribution amount
        </label>
        <div className="flex items-center rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
          <input
            id="amount"
            type="number"
            inputMode="decimal"
            min="1"
            step="0.01"
            required
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="1500"
            className="h-11 w-full rounded-xl bg-transparent px-4 text-sm focus:outline-none"
          />
          <span className="px-4 text-sm font-semibold text-muted-foreground">
            {currency}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Each member contributes this amount in {currency} every period.
        </p>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="frequency" className="text-sm font-medium">
            Frequency
          </label>
          <select
            id="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value as CircleFrequency)}
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {CIRCLE_FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="memberCount" className="text-sm font-medium">
            Number of members
          </label>
          <input
            id="memberCount"
            type="number"
            min="2"
            max="100"
            step="1"
            required
            value={memberCount}
            onChange={(e) => setMemberCount(e.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="description" className="text-sm font-medium">
          Description <span className="text-muted-foreground">(optional)</span>
        </label>
        <textarea
          id="description"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A monthly circle for early-stage founders saving toward runway."
          className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <label
        htmlFor="isPublic"
        className="flex cursor-pointer items-start gap-3 rounded-xl border border-input bg-background px-4 py-3"
      >
        <input
          id="isPublic"
          type="checkbox"
          checked={isPublic}
          onChange={(e) => setIsPublic(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-input"
        />
        <span className="text-sm">
          <span className="font-medium">List in the community marketplace</span>
          <span className="block text-xs text-muted-foreground">
            Anyone can discover and join this circle. Leave off to keep it private.
          </span>
        </span>
      </label>

      {pool > 0 && (
        <div className="rounded-xl bg-secondary/60 px-4 py-3 text-sm">
          Each payout round:{" "}
          <span className="font-semibold text-primary">
            {pool.toLocaleString()} {currency}
          </span>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" size="lg" className="w-full" disabled={loading}>
        {loading && <Loader2 className="animate-spin" />}
        Create circle
      </Button>
    </form>
  );
}
