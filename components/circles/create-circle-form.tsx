"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { CIRCLE_FREQUENCIES, type CircleFrequency } from "@/lib/types";
import type { ArcStablecoin } from "@/lib/arc";
import { BOND_APY, recommendedBond } from "@/lib/bond";
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
  const [bondEnabled, setBondEnabled] = useState(true);
  const [requiredBond, setRequiredBond] = useState("");
  // Tracks whether the creator typed a custom bond; until then the field
  // follows the 110% recommendation as the contribution changes.
  const [bondTouched, setBondTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contribution = Number(amount);
  const suggestedBond = recommendedBond(contribution);
  // The bond actually submitted: the recommendation unless overridden upward.
  const bondValue = bondEnabled
    ? bondTouched && requiredBond.trim() !== ""
      ? Number(requiredBond)
      : suggestedBond
    : 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const members = Number(memberCount);
    const bond = bondValue;

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
    if (bondEnabled && (!Number.isFinite(bond) || bond < suggestedBond)) {
      setError(
        `The bond must be at least ${suggestedBond.toLocaleString()} ${currency} — 110% of one contribution — so a slash always covers a missed round plus a 10% penalty.`
      );
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
      required_bond: Math.round(bond * 100) / 100,
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

      <div className="space-y-2 rounded-2xl border border-input bg-background/60 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Member bond</p>
            <p className="text-xs text-muted-foreground">
              A refundable stake each member posts to join, held in the vault
              until they finish in good standing.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={bondEnabled}
            aria-label="Toggle member bond"
            onClick={() => setBondEnabled((v) => !v)}
            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
              bondEnabled ? "bg-primary" : "bg-secondary"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                bondEnabled ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {bondEnabled && (
          <>
            <div className="flex items-center rounded-xl border border-input bg-background focus-within:ring-2 focus-within:ring-ring">
              <input
                id="requiredBond"
                type="number"
                inputMode="decimal"
                min={suggestedBond || 0}
                step="0.01"
                value={
                  bondTouched ? requiredBond : suggestedBond > 0 ? String(suggestedBond) : ""
                }
                onChange={(e) => {
                  setBondTouched(true);
                  setRequiredBond(e.target.value);
                }}
                placeholder={suggestedBond > 0 ? String(suggestedBond) : "—"}
                className="h-11 w-full rounded-xl bg-transparent px-4 text-sm focus:outline-none"
                aria-label={`Member bond in ${currency}`}
              />
              <span className="px-4 text-sm font-semibold text-muted-foreground">
                {currency}
              </span>
            </div>

            {contribution > 0 ? (
              <div className="space-y-1 rounded-xl bg-emerald-500/5 px-3 py-2 text-xs">
                <p className="font-medium text-emerald-500">
                  Why {suggestedBond.toLocaleString()} {currency}? It&apos;s 110%
                  of one contribution.
                </p>
                <p className="text-muted-foreground">
                  If a member defaults, slashing their bond repays the missed{" "}
                  {contribution.toLocaleString()} {currency} in full <em>and</em>{" "}
                  leaves a 10% penalty for the group — from day one. The bond
                  also earns ~{Math.round(BOND_APY * 100)}% APY (USYC,
                  Treasury-backed) while held, so coverage keeps growing the
                  longer the circle runs. Members who finish cleanly get the
                  bond back <span className="font-medium text-emerald-500">plus the yield</span>.
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                Enter a contribution amount above and we&apos;ll suggest the
                right bond (110% of one round).
              </p>
            )}
            <p className="text-xs text-muted-foreground">
              Higher-risk members are automatically surcharged 2–3× this base.
            </p>
          </>
        )}
        {!bondEnabled && (
          <p className="text-xs text-amber-500">
            Without a bond the group has no recovery if a member defaults —
            recommended only for circles of people who fully trust each other.
          </p>
        )}
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
