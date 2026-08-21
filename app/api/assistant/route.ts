import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { accrueYield, effectiveApy } from "@/lib/yield-engine";
import { goalFunding } from "@/lib/goals";
import {
  ASSISTANT_SYSTEM,
  buildContextSummary,
  fallbackAnswer,
  type AssistantContext,
} from "@/lib/assistant";
import { clientKey, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import type { SavingsGoal, SavingsPlan } from "@/lib/types";

export const runtime = "nodejs";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

type ChatMessage = { role: "user" | "assistant"; content: string };

/** Pull a compact, RLS-scoped snapshot of the signed-in user's account. */
async function gatherContext(
  supabase: ReturnType<typeof createClient>,
  userId: string
): Promise<AssistantContext> {
  const [{ data: profile }, { data: planRows }, { data: goalRows }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("full_name, preferred_stablecoin")
        .eq("id", userId)
        .maybeSingle<{ full_name: string | null; preferred_stablecoin: string }>(),
      supabase
        .from("savings_plans")
        .select("*")
        .eq("user_id", userId)
        .eq("status", "active"),
      supabase.from("savings_goals").select("*").eq("user_id", userId),
    ]);

  const plans = (planRows ?? []) as SavingsPlan[];
  const goals = (goalRows ?? []) as SavingsGoal[];
  const currency = profile?.preferred_stablecoin ?? "USDC";

  let totalLocked = 0;
  let yieldEarned = 0;
  for (const p of plans) {
    totalLocked += p.principal;
    if (p.apy_bonus > 0 && p.principal > 0) {
      yieldEarned += accrueYield({
        principal: p.principal,
        from: p.created_at,
        apy: effectiveApy(p.apy_bonus),
      });
    }
  }

  // Circles the user belongs to.
  const { data: memberRows } = await supabase
    .from("circle_members")
    .select("circle_id")
    .eq("user_id", userId);
  const circleIds = (memberRows ?? []).map((m) => m.circle_id as string);
  let circles: AssistantContext["circles"] = [];
  if (circleIds.length) {
    const { data: circleRows } = await supabase
      .from("circles")
      .select(
        "name, status, current_round, total_rounds, round_due_at, contribution_amount, currency"
      )
      .in("id", circleIds);
    circles = (circleRows ?? []).map((c) => ({
      name: (c.name as string) ?? "Circle",
      status: (c.status as string) ?? "active",
      round:
        c.current_round && c.total_rounds
          ? `${c.current_round}/${c.total_rounds}`
          : null,
      dueAt: (c.round_due_at as string | null) ?? null,
      contribution: Number(c.contribution_amount ?? 0),
      currency: (c.currency as string) ?? currency,
    }));
  }

  return {
    firstName: profile?.full_name?.split(" ")[0] ?? null,
    currency,
    walletBalance: null, // onchain read is slow; omitted to keep replies snappy
    totalLocked: Math.round(totalLocked * 100) / 100,
    yieldEarned: Math.round(yieldEarned * 100) / 100,
    plans: plans.map((p) => ({
      name: p.name,
      type: p.plan_type,
      principal: p.principal,
      apy: p.apy_bonus,
      currency: p.currency,
    })),
    goals: goals.map((g) => ({
      name: g.name,
      target: g.target_amount,
      funded: Math.min(goalFunding(g.id, plans).funded, g.target_amount),
      currency: g.currency,
    })),
    circles,
  };
}

async function answerWithClaude(
  messages: ChatMessage[],
  contextSummary: string
): Promise<string | null> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 600,
        system: `${ASSISTANT_SYSTEM}\n\n--- The user's current data ---\n${contextSummary}`,
        messages: messages.slice(-8),
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    return json.content?.find((c) => c.type === "text")?.text ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Cap assistant calls (each can hit the paid Claude API) — 20/min per user.
  const rl = rateLimit(`assistant:${clientKey(request, user.id)}`, 20, 60_000);
  if (!rl.ok) return tooManyRequests(rl.retryAfter);

  let body: { messages?: unknown };
  try {
    body = (await request.json()) as { messages?: unknown };
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const messages: ChatMessage[] = Array.isArray(body.messages)
    ? (body.messages as ChatMessage[])
        .filter(
          (m) =>
            m &&
            (m.role === "user" || m.role === "assistant") &&
            typeof m.content === "string" &&
            m.content.length <= 1000
        )
        .slice(-10)
    : [];
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) {
    return NextResponse.json({ error: "Ask a question." }, { status: 400 });
  }

  const ctx = await gatherContext(supabase, user.id);

  let reply: string | null = null;
  let source: "ai" | "rules" = "rules";
  if (process.env.ANTHROPIC_API_KEY) {
    reply = await answerWithClaude(messages, buildContextSummary(ctx));
    if (reply) source = "ai";
  }
  if (!reply) reply = fallbackAnswer(lastUser.content, ctx);

  return NextResponse.json({ reply, source });
}
