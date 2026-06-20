/**
 * "Ask Arjo" assistant — shared types, knowledge base, and the rule-based
 * fallback used when no Claude key is configured.
 *
 * The assistant is ADVISORY: it answers questions about the user's own savings,
 * circles, goals and yield, explains how Arjo works, and points to the right
 * screen for actions — it never moves money. When ANTHROPIC_API_KEY is set the
 * API route hands this context to Claude; otherwise fallbackAnswer() responds
 * from the same facts, so the assistant is useful either way.
 *
 * Pure module (no I/O, no secrets): safe on client or server.
 */

export type AssistantPlan = {
  name: string;
  type: string;
  principal: number;
  apy: number;
  currency: string;
};

export type AssistantGoal = {
  name: string;
  target: number;
  funded: number;
  currency: string;
};

export type AssistantCircle = {
  name: string;
  status: string;
  round: string | null;
  dueAt: string | null;
  contribution: number;
  currency: string;
};

export type AssistantContext = {
  firstName: string | null;
  currency: string;
  walletBalance: number | null;
  totalLocked: number;
  yieldEarned: number;
  plans: AssistantPlan[];
  goals: AssistantGoal[];
  circles: AssistantCircle[];
};

const money = (n: number, c = "USDC") =>
  `${n.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${c}`;

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";

/** A compact, factual snapshot of the user's account for the model prompt. */
export function buildContextSummary(ctx: AssistantContext): string {
  const lines: string[] = [];
  lines.push(`User: ${ctx.firstName ?? "there"} (saves in ${ctx.currency}).`);
  if (ctx.walletBalance != null) {
    lines.push(`Wallet balance: ${money(ctx.walletBalance, ctx.currency)}.`);
  }
  lines.push(
    `Locked in vaults: ${money(ctx.totalLocked, ctx.currency)} across ${ctx.plans.length} plan(s); yield earned so far: ${money(ctx.yieldEarned, ctx.currency)}.`
  );
  if (ctx.plans.length) {
    lines.push(
      "Savings plans: " +
        ctx.plans
          .map((p) => `${p.name} (${p.type}, ${money(p.principal, p.currency)}, ${p.apy}% APY)`)
          .join("; ")
    );
  }
  if (ctx.goals.length) {
    lines.push(
      "Goals: " +
        ctx.goals
          .map((g) => `${g.name} (${money(g.funded, g.currency)} of ${money(g.target, g.currency)})`)
          .join("; ")
    );
  }
  if (ctx.circles.length) {
    lines.push(
      "Circles: " +
        ctx.circles
          .map(
            (c) =>
              `${c.name} (${c.status}${c.round ? `, round ${c.round}` : ""}${c.dueAt ? `, due ${fmtDate(c.dueAt)}` : ""}, ${money(c.contribution, c.currency)}/round)`
          )
          .join("; ")
    );
  }
  return lines.join("\n");
}

export const ASSISTANT_SYSTEM = `You are "Arjo", the friendly in-app assistant for the Arjo savings app — group savings circles (Ajo/ROSCA) and personal savings, settled in USDC on Arc.

Rules:
- Be concise, warm and practical. Prefer 1–4 short sentences. Use the user's real data below; never invent numbers.
- You are ADVISORY ONLY. You cannot move money, join circles, or change settings. When the user wants to act, tell them exactly where in the app to do it (e.g. "open the Save tab and choose SafeLock", "open the circle and tap Join").
- If you don't have a number in the context, say so plainly and point them to the relevant screen.
- Never give individualized investment advice or guarantees; rates track the market.

How Arjo works (facts you can rely on):
- Circles: members contribute a fixed amount each round; the whole pot rotates to one member per round until everyone is paid. Rounds have due dates; auto-debit can pull contributions automatically.
- SafeLock savings: locked vaults earn tiered, Treasury-backed yield by duration — under 1 month 5%, 1–3 months 6%, 3–6 months 7%, 6+ months 8% APY. Early withdrawal forfeits the bonus and incurs a 10% penalty.
- Other plans: Flexible (0% APY, withdraw anytime), Target (4%), Auto-save (2%).
- Yield source: idle funds are held in USYC, Circle's token backed by short-term US Treasuries — real yield, not token emissions.
- Bonds: joining a circle posts a refundable bond (default 110% of one contribution) held in the vault; it earns ~8% APY and is returned with the yield if you finish in good standing, or slashed if you default.
- Privacy: a circle creator can hide individual member amounts; the shared pot total stays visible to all.
- Invites: a creator shares an invite link so people can join a private circle.
- Telegram: connect in Settings to get reminders and use /balance, /circles, /discover, /save.
- Wallet: a Circle wallet is auto-created at sign-in; on testnet you fund it with free test USDC from the Circle faucet.`;

/**
 * Rule-based answer for when Claude isn't configured. Matches the question
 * against common intents and answers from the same facts + the user's context.
 */
export function fallbackAnswer(question: string, ctx: AssistantContext): string {
  const q = question.toLowerCase();
  const has = (...words: string[]) => words.some((w) => q.includes(w));

  if (has("balance", "how much", "wallet")) {
    const wallet =
      ctx.walletBalance != null
        ? `Your wallet holds ${money(ctx.walletBalance, ctx.currency)}. `
        : "";
    return `${wallet}You have ${money(ctx.totalLocked, ctx.currency)} locked in ${ctx.plans.length} savings plan(s), and you've earned ${money(ctx.yieldEarned, ctx.currency)} in yield so far. See the full picture on the Home and Benefits tabs.`;
  }
  if (has("due", "next round", "when", "contribut")) {
    if (!ctx.circles.length) return "You're not in any circles yet — browse and join one from the Circles tab.";
    return (
      "Your circles: " +
      ctx.circles
        .map((c) => `${c.name}${c.dueAt ? ` — next due ${fmtDate(c.dueAt)}` : ""}`)
        .join("; ") +
      ". Open a circle to contribute."
    );
  }
  if (has("safelock", "lock", "interest rate", "apy", "best rate")) {
    return "SafeLock earns more the longer you commit: under 1 month 5%, 1–3 months 6%, 3–6 months 7%, and 6+ months the full 8% APY — all Treasury-backed by USYC. Open the Save tab and choose SafeLock to set it up.";
  }
  if (has("yield", "where", "treasur", "usyc")) {
    return "Your yield comes from USYC — Circle's token backed by short-term US Treasuries. Idle savings sit in USYC and earn the underlying rate; it's real yield, not token emissions. More on the Benefits tab.";
  }
  if (has("bond")) {
    return "Joining a circle posts a refundable bond (by default 110% of one contribution) held in the vault. It earns ~8% APY while held and comes back with the yield when you finish in good standing — or is slashed if you default. The bond protects the group from a missed round.";
  }
  if (has("join", "invite", "private")) {
    return "Public circles are joinable from the Circles tab. For a private circle, the creator shares an invite link — open it and tap Join. Either way you'll post the bond and pass a quick eligibility check.";
  }
  if (has("telegram", "notif", "remind")) {
    return "Connect Telegram from Settings to get contribution reminders, auto-debit receipts and payout alerts — and to use /balance, /circles, /discover and /save in chat.";
  }
  if (has("goal")) {
    if (!ctx.goals.length) return "You haven't set any goals yet — create one on the Goals tab and fund it with a SafeLock to earn yield while you save toward it.";
    return (
      "Your goals: " +
      ctx.goals.map((g) => `${g.name} (${money(g.funded, g.currency)} of ${money(g.target, g.currency)})`).join("; ") +
      ". Fund a goal with a SafeLock to grow it. See the Goals tab."
    );
  }
  if (has("withdraw", "unlock", "take out")) {
    return "You can withdraw a Flexible vault anytime. A SafeLock can be withdrawn early but forfeits the yield bonus and incurs a 10% penalty. Manage plans on the Save tab.";
  }
  if (has("fund", "deposit", "add money", "faucet", "test usdc")) {
    return "On testnet you fund your wallet with free test USDC from the Circle faucet — use the Claim test USDC button on your dashboard, then refresh.";
  }
  if (has("what can you", "help", "hi", "hello", "hey")) {
    return `Hi ${ctx.firstName ?? "there"}! I can explain how Arjo works and answer questions about your savings, circles, goals and yield — try "what's my balance?", "how does SafeLock work?", "when's my next contribution due?", or "how do bonds work?".`;
  }
  return `I can help with your savings, circles, goals and how Arjo works — e.g. "what's my balance?", "how does the bond work?", or "what SafeLock rate would I get?". For anything that moves money, I'll point you to the right screen — you confirm it there.`;
}
