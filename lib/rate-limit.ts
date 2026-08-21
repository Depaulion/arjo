import { NextResponse } from "next/server";

/**
 * Lightweight in-memory rate limiter (fixed window).
 *
 * Zero-dependency and instant, so it protects the sensitive routes without any
 * setup. Caveat: on serverless (Vercel) the store lives per-instance and resets
 * on cold starts, so this is a best-effort BURST limiter, not a hard global cap.
 * For a strict global limit across instances, swap the store for Upstash/Redis
 * behind the same rateLimit() signature — the call sites won't change.
 */
type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export type RateResult = {
  ok: boolean;
  remaining: number;
  /** Seconds until the window resets (for a Retry-After header). */
  retryAfter: number;
};

/** Consume one unit for `key`; allow up to `limit` per `windowMs`. */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  const now = Date.now();

  // Opportunistic prune so the map can't grow unbounded.
  if (store.size > 5000 && Math.random() < 0.02) {
    store.forEach((v, k) => {
      if (v.resetAt <= now) store.delete(k);
    });
  }

  const e = store.get(key);
  if (!e || e.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, remaining: limit - 1, retryAfter: 0 };
  }
  if (e.count >= limit) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((e.resetAt - now) / 1000) };
  }
  e.count += 1;
  return { ok: true, remaining: limit - e.count, retryAfter: 0 };
}

/** Derive a stable client key: the signed-in user if known, else the caller IP. */
export function clientKey(request: Request, userId?: string | null): string {
  if (userId) return `u:${userId}`;
  const fwd = request.headers.get("x-forwarded-for") ?? "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `ip:${ip}`;
}

/** Standard 429 response with a Retry-After header. */
export function tooManyRequests(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests — please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(Math.max(1, retryAfter)) } }
  );
}
