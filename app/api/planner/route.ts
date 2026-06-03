import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { applyGamification } from "@/lib/savings-actions";
import {
  buildFinancialPlan,
  type FinancialPlan,
  type PlannerInput,
  type RiskAppetite,
} from "@/lib/financial-planner";

export const runtime = "nodejs";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const RISKS: RiskAppetite[] = ["cautious", "balanced", "ambitious"];

function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Claude rewrites only the narrative around the deterministic numbers. */
async function enrichWithClaude(
  plan: FinancialPlan,
  input: PlannerInput
): Promise<{ summary?: string; recommendations?: string[] } | null> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const system =
    "You are a friendly personal-finance coach for a stablecoin savings app (Arc Ajo) used across Africa. " +
    "You are given a user's finances and a pre-computed, authoritative savings plan. " +
    "Do NOT change any numbers. Write warm, specific, practical guidance. " +
    "Respond with ONLY a JSON object: " +
    '{"summary": string (2-3 sentences), "recommendations": string[] (3-5 specific, actionable tips)}.';

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
        max_tokens: 800,
        system,
        messages: [
          {
            role: "user",
            content: `Write the narrative for this plan and return the JSON.\n\n${JSON.stringify(
              { input, plan }
            )}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };
    const text = json.content?.find((c) => c.type === "text")?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1));
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

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const monthlyIncome = Number(body.monthlyIncome);
  const monthlyExpenses = Number(body.monthlyExpenses);
  const goalAmount = Number(body.goalAmount);
  const risk = String(body.risk ?? "balanced") as RiskAppetite;

  if (!Number.isFinite(monthlyIncome) || monthlyIncome <= 0) {
    return NextResponse.json(
      { error: "Enter your monthly income." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(monthlyExpenses) || monthlyExpenses < 0) {
    return NextResponse.json(
      { error: "Enter your monthly expenses." },
      { status: 400 }
    );
  }
  if (!Number.isFinite(goalAmount) || goalAmount <= 0) {
    return NextResponse.json(
      { error: "Enter a savings goal amount." },
      { status: 400 }
    );
  }

  const input: PlannerInput = {
    monthlyIncome,
    monthlyExpenses,
    goalAmount,
    horizonMonths:
      body.horizonMonths != null ? Number(body.horizonMonths) : undefined,
    risk: RISKS.includes(risk) ? risk : "balanced",
    currentSavings:
      body.currentSavings != null ? Number(body.currentSavings) : undefined,
    currency: typeof body.currency === "string" ? body.currency : "USDC",
  };

  const plan = buildFinancialPlan(input);

  if (isAiConfigured()) {
    const enrichment = await enrichWithClaude(plan, input);
    if (enrichment) {
      plan.source = "ai";
      if (enrichment.summary) plan.summary = enrichment.summary;
      if (
        Array.isArray(enrichment.recommendations) &&
        enrichment.recommendations.length > 0
      ) {
        plan.recommendations = enrichment.recommendations
          .filter((r) => typeof r === "string")
          .slice(0, 6);
      }
    }
  }

  // Reward engaging with the planner (also unlocks the Strategist badge).
  const gamification = await applyGamification(supabase, user.id, "goalCreated", {
    usedPlanner: true,
  });

  return NextResponse.json({ plan, gamification, aiConfigured: isAiConfigured() });
}
