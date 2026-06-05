"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  Loader2,
  Plus,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Vote,
  X,
} from "lucide-react";

import { shortenHex } from "@/lib/arc";
import {
  PROPOSAL_TYPES,
  type ProposalStatus,
  type ProposalType,
  type VoteChoice,
} from "@/lib/types";
import type { GovMember, ProposalWithTally } from "@/lib/governance";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function memberLabel(m: GovMember | undefined, currentUserId: string | null) {
  if (!m) return "Unknown member";
  if (m.user_id === currentUserId) return "You";
  if (m.payout_address) return shortenHex(m.payout_address, 6, 4);
  return `Member ${m.user_id.slice(0, 4)}`;
}

const STATUS_BADGE: Record<
  ProposalStatus,
  { label: string; variant: "default" | "accent" | "outline"; className?: string }
> = {
  OPEN: { label: "Open · voting", variant: "outline" },
  APPROVED: { label: "Approved", variant: "accent" },
  EXECUTED: { label: "Executed", variant: "accent" },
  REJECTED: {
    label: "Rejected",
    variant: "outline",
    className: "border-destructive/40 text-destructive",
  },
  CANCELLED: { label: "Cancelled", variant: "outline" },
};

const TYPE_LABEL: Record<ProposalType, string> = {
  PAYOUT_ORDER_CHANGE: "Payout order",
  MEMBER_EXIT_REQUEST: "Exit request",
  MEMBER_REMOVAL: "Member removal",
  RULE_CHANGE: "Rule change",
};

export function GovernancePanel({
  circleId,
  currentUserId,
  members,
  proposals,
  isMember,
  isCreator,
}: {
  circleId: string;
  currentUserId: string | null;
  members: GovMember[];
  proposals: ProposalWithTally[];
  isMember: boolean;
  isCreator: boolean;
}) {
  const [creating, setCreating] = useState(false);

  const memberById = useMemo(() => {
    const map = new Map<string, GovMember>();
    members.forEach((m) => map.set(m.user_id, m));
    return map;
  }, [members]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <Vote className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-xl font-bold tracking-tight">Governance</h2>
            <p className="text-sm text-muted-foreground">
              Members decide together. Proposals pass at 70% YES.
            </p>
          </div>
        </div>
        {isMember && !creating && (
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            New proposal
          </Button>
        )}
      </div>

      {!isMember && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            Join this circle to raise proposals and vote.
          </CardContent>
        </Card>
      )}

      {/* Create form */}
      {creating && isMember && (
        <CreateProposalForm
          circleId={circleId}
          members={members}
          currentUserId={currentUserId}
          onClose={() => setCreating(false)}
        />
      )}

      {/* Member roster + payout order */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Members &amp; payout order</CardTitle>
          <CardDescription>
            The rotation that decides who is paid next. Reputation rises with
            contributions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.length > 0 ? (
            <ul className="divide-y divide-border">
              {members.map((m) => (
                <li
                  key={m.user_id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold text-muted-foreground">
                      {m.payout_position ?? "—"}
                    </span>
                    <div>
                      <p className="text-sm font-medium">
                        {memberLabel(m, currentUserId)}
                        {m.role === "creator" && (
                          <span className="ml-2 text-xs font-normal text-primary">
                            creator
                          </span>
                        )}
                      </p>
                      {m.payout_address && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {shortenHex(m.payout_address)}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                    {m.reputation} rep
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No members to show.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Proposals */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground">
          Proposals ({proposals.length})
        </h3>
        {proposals.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No proposals yet. {isMember && "Raise the first one."}
            </CardContent>
          </Card>
        ) : (
          proposals.map((p) => (
            <ProposalCard
              key={p.id}
              circleId={circleId}
              proposal={p}
              currentUserId={currentUserId}
              isMember={isMember}
              isCreator={isCreator}
              memberById={memberById}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ProposalCard({
  circleId,
  proposal,
  currentUserId,
  isMember,
  isCreator,
  memberById,
}: {
  circleId: string;
  proposal: ProposalWithTally;
  currentUserId: string | null;
  isMember: boolean;
  isCreator: boolean;
  memberById: Map<string, GovMember>;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<VoteChoice | "cancel" | "settle" | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const open = proposal.status === "OPEN";
  const status = STATUS_BADGE[proposal.status];
  const target = proposal.target_user_id
    ? memberById.get(proposal.target_user_id)
    : undefined;

  // An approved exit/removal that the creator still needs to settle (refund the
  // leaving member's net contributions on-chain, then remove them).
  const isExit =
    proposal.type === "MEMBER_EXIT_REQUEST" ||
    proposal.type === "MEMBER_REMOVAL";
  const awaitingSettlement =
    isExit && proposal.status === "APPROVED" && Boolean(target?.pending_exit);
  const yesPct = Math.round(proposal.yesPct);
  const noPct = Math.round(proposal.noPct);
  const notVoted = Math.max(
    0,
    proposal.memberCount - proposal.yesCount - proposal.noCount,
  );
  const canCancel =
    open && (isCreator || proposal.created_by === currentUserId);

  async function vote(choice: VoteChoice) {
    setError(null);
    setLoading(choice);
    const res = await fetch(`/api/proposals/${proposal.id}/vote`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ choice }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError(json.error ?? "Could not record your vote.");
      return;
    }
    router.refresh();
  }

  async function cancel() {
    setError(null);
    setLoading("cancel");
    const res = await fetch(`/api/proposals/${proposal.id}/cancel`, {
      method: "POST",
    });
    setLoading(null);
    if (!res.ok) {
      setError("Could not cancel this proposal.");
      return;
    }
    router.refresh();
  }

  async function settle() {
    setError(null);
    setNotice(null);
    setLoading("settle");
    const res = await fetch(`/api/circles/${circleId}/settle-exit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ proposalId: proposal.id }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(null);
    if (!res.ok) {
      setError(json.error ?? "Could not settle this exit.");
      return;
    }
    const amount = Number(json.refund) || 0;
    const cur = json.currency ?? "";
    setNotice(
      amount > 0
        ? `Refunded ${amount} ${cur} and removed the member.`
        : json.message ?? "Exit settled.",
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{TYPE_LABEL[proposal.type]}</Badge>
              <Badge variant={status.variant} className={status.className}>
                {status.label}
              </Badge>
            </div>
            <CardTitle className="text-base">{proposal.title}</CardTitle>
          </div>
        </div>
        {proposal.description && (
          <CardDescription>{proposal.description}</CardDescription>
        )}
        {target && (
          <CardDescription>
            Member: {memberLabel(target, currentUserId)}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tally bar */}
        <div className="space-y-2">
          <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full bg-primary"
              style={{ width: `${yesPct}%` }}
            />
            <div
              className="h-full bg-destructive/70"
              style={{ width: `${noPct}%` }}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
            <span className="font-semibold text-primary">
              YES: {proposal.yesCount} ({yesPct}%)
            </span>
            <span className="font-semibold text-destructive">
              NO: {proposal.noCount} ({noPct}%)
            </span>
            <span className="text-muted-foreground">
              {notVoted} not voted · needs {proposal.threshold_pct}% YES
            </span>
          </div>
        </div>

        {/* Vote actions */}
        {open && isMember && (
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={proposal.myVote === "YES" ? "default" : "outline"}
              onClick={() => vote("YES")}
              disabled={loading !== null}
            >
              {loading === "YES" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsUp className="h-4 w-4" />
              )}
              Vote yes
            </Button>
            <Button
              size="sm"
              variant={proposal.myVote === "NO" ? "default" : "outline"}
              onClick={() => vote("NO")}
              disabled={loading !== null}
            >
              {loading === "NO" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ThumbsDown className="h-4 w-4" />
              )}
              Vote no
            </Button>
            {proposal.myVote && (
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Check className="h-3.5 w-3.5 text-primary" />
                You voted {proposal.myVote}
              </span>
            )}
            {canCancel && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto text-muted-foreground"
                onClick={cancel}
                disabled={loading !== null}
              >
                {loading === "cancel" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Cancel
              </Button>
            )}
          </div>
        )}
        {/* Creator settles an approved exit: refund net contributions, remove. */}
        {awaitingSettlement && isCreator && (
          <div className="space-y-2 rounded-xl border border-accent/30 bg-accent/5 p-3">
            <p className="text-sm">
              Approved — settle to refund{" "}
              {memberLabel(target, currentUserId)}&apos;s net contributions from
              the pot and remove them from the circle.
            </p>
            <Button size="sm" onClick={settle} disabled={loading !== null}>
              {loading === "settle" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ShieldCheck className="h-4 w-4" />
              )}
              Settle &amp; refund
            </Button>
          </div>
        )}
        {awaitingSettlement && !isCreator && (
          <p className="text-xs text-muted-foreground">
            Approved — awaiting the circle creator to settle the refund.
          </p>
        )}
        {notice && <p className="text-sm text-primary">{notice}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}

function CreateProposalForm({
  circleId,
  members,
  currentUserId,
  onClose,
}: {
  circleId: string;
  members: GovMember[];
  currentUserId: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<ProposalType>("RULE_CHANGE");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [order, setOrder] = useState<string[]>(() =>
    members.map((m) => m.user_id),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const needsTarget =
    type === "MEMBER_EXIT_REQUEST" || type === "MEMBER_REMOVAL";
  const needsOrder = type === "PAYOUT_ORDER_CHANGE";

  function move(index: number, dir: -1 | 1) {
    setOrder((prev) => {
      const next = [...prev];
      const swap = index + dir;
      if (swap < 0 || swap >= next.length) return prev;
      [next[index], next[swap]] = [next[swap], next[index]];
      return next;
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 2) {
      setError("Give the proposal a title.");
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/circles/${circleId}/proposals`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        targetUserId: needsTarget ? targetUserId : undefined,
        order: needsOrder ? order : undefined,
      }),
    });
    const json = await res.json().catch(() => ({}));
    setLoading(false);
    if (!res.ok) {
      setError(json.error ?? "Could not create the proposal.");
      return;
    }
    onClose();
    router.refresh();
  }

  const fieldClass =
    "h-11 w-full rounded-xl border border-input bg-background px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  // Members eligible as a target (exclude the creator from removal/exit).
  const targetable = members.filter((m) => m.role !== "creator");

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-base">New proposal</CardTitle>
        <CardDescription>
          The circle votes; it passes at 70% YES of all members.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as ProposalType)}
              className={fieldClass}
            >
              {PROPOSAL_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {PROPOSAL_TYPES.find((t) => t.value === type)?.description}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={140}
              placeholder="What are we deciding?"
              className={fieldClass}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Details <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Add context for the other members."
              className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {needsTarget && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Member</label>
              <select
                value={targetUserId}
                onChange={(e) => setTargetUserId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Select a member…</option>
                {(type === "MEMBER_EXIT_REQUEST" ? members : targetable).map(
                  (m) => (
                    <option key={m.user_id} value={m.user_id}>
                      {memberLabel(m, currentUserId)}
                    </option>
                  ),
                )}
              </select>
            </div>
          )}

          {needsOrder && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">New payout order</label>
              <ul className="space-y-2">
                {order.map((uid, i) => {
                  const m = members.find((x) => x.user_id === uid);
                  return (
                    <li
                      key={uid}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-secondary/40 px-3 py-2"
                    >
                      <span className="flex items-center gap-2 text-sm">
                        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                          {i + 1}
                        </span>
                        {memberLabel(m, currentUserId)}
                      </span>
                      <span className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="rounded-lg p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                          aria-label="Move up"
                        >
                          <ArrowUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === order.length - 1}
                          className="rounded-lg p-1 text-muted-foreground hover:bg-secondary disabled:opacity-30"
                          aria-label="Move down"
                        >
                          <ArrowDown className="h-4 w-4" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Create proposal
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
