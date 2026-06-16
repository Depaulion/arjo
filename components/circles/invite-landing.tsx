import Link from "next/link";
import { ArrowLeft, Coins, ShieldCheck, Users } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { JoinCircleButton } from "@/components/dashboard/join-circle-button";

function fmt(n: number) {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

/**
 * Landing shown to a signed-in non-member who opened a circle's invite link.
 * Surfaces the join terms (contribution, cadence, member cap, bond) and a Join
 * button that carries the invite code — the entry point for a private circle
 * they otherwise can't see.
 */
export function InviteLanding({
  circleId,
  inviteCode,
  name,
  description,
  currency,
  contributionAmount,
  frequencyLabel,
  memberCount,
  requiredBond,
  isPublic,
}: {
  circleId: string;
  inviteCode: string;
  name: string;
  description: string | null;
  currency: string;
  contributionAmount: number;
  frequencyLabel: string | null;
  memberCount: number;
  requiredBond: number;
  isPublic: boolean;
}) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="container flex h-16 items-center">
          <Link
            href="/account"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Arjo
          </Link>
        </div>
      </header>

      <main className="container max-w-lg py-10">
        <div className="mb-2 text-sm font-medium text-primary">
          You&apos;re invited to join
        </div>
        <h1 className="text-3xl font-bold tracking-tight">{name}</h1>
        {description && (
          <p className="mt-2 text-muted-foreground">{description}</p>
        )}

        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">Circle terms</CardTitle>
            <CardDescription>
              What you&apos;re agreeing to by joining.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Row
              icon={<Coins className="h-4 w-4 text-primary" />}
              label="Contribution"
              value={`${fmt(contributionAmount)} ${currency}${
                frequencyLabel ? ` · ${frequencyLabel}` : ""
              }`}
            />
            <Row
              icon={<Users className="h-4 w-4 text-primary" />}
              label="Members"
              value={`Up to ${memberCount}`}
            />
            <Row
              icon={<ShieldCheck className="h-4 w-4 text-primary" />}
              label="Refundable bond"
              value={
                requiredBond > 0
                  ? `${fmt(requiredBond)} ${currency}`
                  : "None"
              }
            />
            {requiredBond > 0 && (
              <p className="rounded-lg bg-emerald-500/5 px-3 py-2 text-xs text-muted-foreground">
                The bond is held in the vault and{" "}
                <span className="font-medium text-emerald-500">
                  earns ~8% APY
                </span>{" "}
                while the circle runs — returned with the yield when you finish
                in good standing.
              </p>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between gap-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm text-muted-foreground">
            Ready to save together?
          </p>
          <JoinCircleButton
            circleId={circleId}
            joined={false}
            inviteCode={inviteCode}
          />
        </div>

        {!isPublic && (
          <p className="mt-3 text-center text-xs text-muted-foreground">
            This is a private circle — you can only see it because you have an
            invite.
          </p>
        )}
      </main>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {icon}
        {label}
      </span>
      <span className="text-sm font-semibold">{value}</span>
    </div>
  );
}
