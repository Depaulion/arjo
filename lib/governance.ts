import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  CircleMember,
  Proposal,
  ProposalVote,
  VoteChoice,
} from "@/lib/types";

/** A circle member as governance needs it (no profile join — RLS-safe). */
export type GovMember = {
  user_id: string;
  role: CircleMember["role"];
  payout_position: number | null;
  payout_address: string | null;
  reputation: number;
};

/** A proposal with its vote tally computed against the circle's membership. */
export type ProposalWithTally = Proposal & {
  yesCount: number;
  noCount: number;
  memberCount: number;
  /** YES as a percent of all members (the approval metric). */
  yesPct: number;
  noPct: number;
  /** The current user's vote, if any. */
  myVote: VoteChoice | null;
};

export type GovernanceData = {
  members: GovMember[];
  proposals: ProposalWithTally[];
  /** The viewer's membership row, if they belong to the circle. */
  me: GovMember | null;
  isMember: boolean;
  isCreator: boolean;
};

/**
 * Load everything the governance panel needs for a circle: the member roster,
 * all proposals, and each proposal's vote tally (with the viewer's own vote).
 * Returns an empty, non-member result if Supabase is unavailable or the viewer
 * isn't signed in.
 */
export async function getGovernanceData(
  supabase: SupabaseClient,
  circleId: string,
  userId: string | null,
): Promise<GovernanceData> {
  const empty: GovernanceData = {
    members: [],
    proposals: [],
    me: null,
    isMember: false,
    isCreator: false,
  };

  try {
    const { data: memberRows } = await supabase
      .from("circle_members")
      .select("user_id, role, payout_position, payout_address, reputation")
      .eq("circle_id", circleId);

    const members: GovMember[] = (memberRows ?? []).map((m) => ({
      user_id: m.user_id as string,
      role: (m.role as CircleMember["role"]) ?? "member",
      payout_position: (m.payout_position as number | null) ?? null,
      payout_address: (m.payout_address as string | null) ?? null,
      reputation: (m.reputation as number | null) ?? 100,
    }));
    members.sort(
      (a, b) =>
        (a.payout_position ?? 1e9) - (b.payout_position ?? 1e9) ||
        a.user_id.localeCompare(b.user_id),
    );

    const me = members.find((m) => m.user_id === userId) ?? null;
    const memberCount = members.length;

    const { data: proposalRows } = await supabase
      .from("proposals")
      .select("*")
      .eq("circle_id", circleId)
      .order("created_at", { ascending: false });

    const proposals = (proposalRows ?? []) as Proposal[];

    let votes: ProposalVote[] = [];
    if (proposals.length > 0) {
      const { data: voteRows } = await supabase
        .from("proposal_votes")
        .select("proposal_id, user_id, choice, created_at")
        .in(
          "proposal_id",
          proposals.map((p) => p.id),
        );
      votes = (voteRows ?? []) as ProposalVote[];
    }

    const withTally: ProposalWithTally[] = proposals.map((p) => {
      const pv = votes.filter((v) => v.proposal_id === p.id);
      const yesCount = pv.filter((v) => v.choice === "YES").length;
      const noCount = pv.filter((v) => v.choice === "NO").length;
      const myVote =
        pv.find((v) => v.user_id === userId)?.choice ?? null;
      const yesPct = memberCount > 0 ? (yesCount / memberCount) * 100 : 0;
      const noPct = memberCount > 0 ? (noCount / memberCount) * 100 : 0;
      return {
        ...p,
        payload: (p.payload ?? {}) as Record<string, unknown>,
        yesCount,
        noCount,
        memberCount,
        yesPct,
        noPct,
        myVote,
      };
    });

    return {
      members,
      proposals: withTally,
      me,
      isMember: Boolean(me),
      isCreator: me?.role === "creator",
    };
  } catch {
    return empty;
  }
}
