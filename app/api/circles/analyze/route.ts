import { NextResponse } from "next/server";

import {
  analyzeCircleHeuristic,
  type AnalysisMember,
  type CircleAnalysis,
} from "@/lib/circle-analysis";

export const runtime = "nodejs";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

function isAiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function parseMembers(input: unknown): AnalysisMember[] | null {
  if (!Array.isArray(input)) return null;
  const members: AnalysisMember[] = [];
  for (const raw of input) {
    if (typeof raw !== "object" || raw === null) return null;
    const m = raw as Record<string, unknown>;
    const id = String(m.id ?? "").trim();
    const contribution = Number(m.contribution);
    const paidCount = Number(m.paidCount);
    const totalRounds = Number(m.totalRounds);
    if (
      !id ||
      !Number.isFinite(contribution) ||
      !Number.isFinite(paidCount) ||
      !Number.isFinite(totalRounds)
    ) {
      return null;
    }
    members.push({
      id,
      contribution: Math.max(0, contribution),
      paidCount: Math.max(0, Math.round(paidCount)),
      totalRounds: Math.max(0, Math.round(totalRounds)),
    });
  }
  return members;
}

type AiEnrichment = {
  summary?: string;
  recommendations?: string[];
  outlook?: string;
  riskNotes?: Array<{ id: string; note: string }>;
};

/**
 * Ask Claude to write the qualitative layer on top of the deterministic
 * numbers. The model never sets the score — it explains and advises.
 */
async function enrichWithClaude(
  base: CircleAnalysis,
  members: AnalysisMember[],
  circleName: string
): Promise<AiEnrichment | null> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const system =
    "You are a financial co-pilot for rotating savings circles (Ajo/ROSCA) settled in USDC on the Arc blockchain. " +
    "You are given member payment data and pre-computed, authoritative metrics. " +
    "Do NOT recompute or change the numbers. Write concise, practical, encouraging guidance for the circle organiser. " +
    "Respond with ONLY a JSON object, no markdown, matching: " +
    '{"summary": string, "recommendations": string[] (3-5 items, specific and actionable), ' +
    '"outlook": string (2-3 sentences on the next 4 weeks), ' +
    '"riskNotes": [{"id": string, "note": string}] (one short note per risk member)}.';

  const payload = {
    circle: circleName,
    currency: base.currency,
    members,
    computed: {
      healthScore: base.healthScore,
      healthLabel: base.healthLabel,
      metrics: base.metrics,
      riskMembers: base.riskMembers,
      prediction: {
        stability: base.prediction.stability,
        confidence: base.prediction.confidence,
        projectedCollectionRate: base.prediction.projectedCollectionRate,
        projectedInflow: base.prediction.projectedInflow,
      },
    },
  };

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
        max_tokens: 1024,
        system,
        messages: [
          {
            role: "user",
            content: `Analyse this savings circle and return the JSON object.\n\n${JSON.stringify(
              payload
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
    const text =
      json.content?.find((c) => c.type === "text")?.text ?? "";
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1) return null;
    return JSON.parse(text.slice(start, end + 1)) as AiEnrichment;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const members = parseMembers(payload?.members);
  if (!members || members.length === 0) {
    return NextResponse.json(
      { error: "Provide a non-empty `members` array." },
      { status: 400 }
    );
  }

  const currency =
    typeof payload?.currency === "string" ? payload.currency : "USDC";
  const circleName =
    typeof payload?.name === "string" ? payload.name : "this circle";

  const analysis = analyzeCircleHeuristic(members, currency);

  if (isAiConfigured()) {
    const enrichment = await enrichWithClaude(analysis, members, circleName);
    if (enrichment) {
      analysis.source = "ai";
      if (enrichment.summary) analysis.summary = enrichment.summary;
      if (enrichment.outlook) analysis.prediction.outlook = enrichment.outlook;
      if (
        Array.isArray(enrichment.recommendations) &&
        enrichment.recommendations.length > 0
      ) {
        analysis.recommendations = enrichment.recommendations
          .filter((r) => typeof r === "string")
          .slice(0, 6);
      }
      if (Array.isArray(enrichment.riskNotes)) {
        const noteById = new Map(
          enrichment.riskNotes
            .filter((n) => n && typeof n.id === "string")
            .map((n) => [n.id, n.note])
        );
        analysis.riskMembers = analysis.riskMembers.map((m) =>
          noteById.has(m.id)
            ? { ...m, reason: String(noteById.get(m.id)) }
            : m
        );
      }
    }
  }

  return NextResponse.json({ analysis, aiConfigured: isAiConfigured() });
}
