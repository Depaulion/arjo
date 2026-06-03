"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Brain,
  Lightbulb,
  Loader2,
  Sparkles,
  TrendingUp,
} from "lucide-react";

import type { AnalysisMember, CircleAnalysis } from "@/lib/circle-analysis";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function scoreColor(score: number) {
  if (score >= 70) return "text-primary";
  if (score >= 55) return "text-accent-foreground";
  return "text-destructive";
}

function scoreBar(score: number) {
  if (score >= 70) return "from-primary to-accent";
  if (score >= 55) return "from-accent to-accent";
  return "from-destructive to-destructive";
}

const LEVEL_BADGE: Record<string, string> = {
  high: "bg-destructive/10 text-destructive border-transparent",
  medium: "bg-accent/15 text-accent-foreground border-transparent",
  low: "bg-primary/10 text-primary border-transparent",
};

const STABILITY_LABEL: Record<string, string> = {
  stable: "Stable",
  moderate: "Moderately stable",
  "at-risk": "At risk",
};

export function CircleInsights({
  members,
  currency,
  name,
}: {
  members: AnalysisMember[];
  currency: string;
  name: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<CircleAnalysis | null>(null);
  const [aiConfigured, setAiConfigured] = useState(false);

  const canAnalyze = members.length > 0;

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/circles/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ members, currency, name }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? "Analysis failed.");
        return;
      }
      setAnalysis(body.analysis as CircleAnalysis);
      setAiConfigured(Boolean(body.aiConfigured));
    } catch {
      setError("Could not reach the analysis service.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Brain className="h-5 w-5" />
            </span>
            <div>
              <CardTitle>AI insights</CardTitle>
              <CardDescription>
                Health, risk and a 4-week outlook for this circle.
              </CardDescription>
            </div>
          </div>
          {analysis && (
            <Badge variant={analysis.source === "ai" ? "accent" : "outline"}>
              <Sparkles className="h-3.5 w-3.5" />
              {analysis.source === "ai" ? "Claude" : "Heuristic"}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {!analysis && (
          <div className="flex flex-col items-start gap-3">
            <p className="text-sm text-muted-foreground">
              {canAnalyze
                ? "Run an AI analysis of contribution reliability to get a group health score, flagged risk members, recommendations and a stability forecast."
                : "No contribution data yet to analyse. Once members start funding the pot on Arc, insights will be available here."}
            </p>
            <Button onClick={run} disabled={!canAnalyze || loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              {loading ? "Analysing…" : "Analyse circle"}
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </div>
        )}

        {analysis && (
          <>
            {/* Score + summary */}
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <div className="flex items-end gap-1">
                  <span
                    className={`text-5xl font-bold leading-none ${scoreColor(
                      analysis.healthScore
                    )}`}
                  >
                    {analysis.healthScore}
                  </span>
                  <span className="mb-1 text-sm text-muted-foreground">
                    /100
                  </span>
                </div>
                <p className="mt-1 text-sm font-medium">
                  {analysis.healthLabel} health
                </p>
                <div className="mt-2 h-2 w-40 overflow-hidden rounded-full bg-secondary">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${scoreBar(
                      analysis.healthScore
                    )}`}
                    style={{ width: `${analysis.healthScore}%` }}
                  />
                </div>
              </div>
              <p className="text-sm text-muted-foreground">{analysis.summary}</p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric
                label="Collection rate"
                value={`${Math.round(analysis.metrics.collectionRate * 100)}%`}
              />
              <Metric
                label="Avg reliability"
                value={`${Math.round(analysis.metrics.avgReliability * 100)}%`}
              />
              <Metric
                label="Consistency"
                value={`${Math.round(analysis.metrics.consistency * 100)}%`}
              />
            </div>

            {/* Risk members */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <AlertTriangle className="h-4 w-4 text-accent-foreground" />
                Risk members
              </p>
              {analysis.riskMembers.length > 0 ? (
                <ul className="space-y-2">
                  {analysis.riskMembers.map((m) => (
                    <li
                      key={m.id}
                      className="flex items-start justify-between gap-3 rounded-lg bg-secondary/40 px-3 py-2"
                    >
                      <div>
                        <span className="font-medium">{m.id}</span>
                        <p className="text-xs text-muted-foreground">
                          {m.reason}
                        </p>
                      </div>
                      <Badge className={`shrink-0 ${LEVEL_BADGE[m.level]}`}>
                        {m.level} risk
                      </Badge>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No risk members — everyone is contributing reliably.
                </p>
              )}
            </div>

            {/* Recommendations */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
                <Lightbulb className="h-4 w-4 text-primary" />
                Recommendations
              </p>
              <ul className="space-y-1.5">
                {analysis.recommendations.map((r, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-muted-foreground"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {/* Prediction */}
            <div className="rounded-xl border border-border bg-secondary/30 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-1.5 text-sm font-semibold">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Next 4 weeks
                </p>
                <div className="flex items-center gap-2">
                  <Badge variant="accent">
                    {STABILITY_LABEL[analysis.prediction.stability]}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {Math.round(analysis.prediction.confidence * 100)}% confidence
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {analysis.prediction.outlook}
              </p>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
                <span>
                  Projected collection:{" "}
                  <span className="font-semibold text-foreground">
                    {Math.round(
                      analysis.prediction.projectedCollectionRate * 100
                    )}
                    %
                  </span>
                </span>
                <span>
                  Projected inflow:{" "}
                  <span className="font-semibold text-foreground">
                    {analysis.prediction.projectedInflow} {currency}
                  </span>
                </span>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={run}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Brain className="h-4 w-4" />
              )}
              Re-run analysis
            </Button>
            {!aiConfigured && (
              <p className="text-xs text-muted-foreground">
                Using the built-in scoring engine. Set{" "}
                <code className="font-mono">ANTHROPIC_API_KEY</code> to enable
                Claude-written insights.
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-secondary/40 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
