import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// A public site must not let one visitor run up the Gemini bill, so every /api request is counted
// per client address and answered with 429 once it is over the limit. The app already copes with a
// failed request (the first course falls back to the plain builder, edits show an error line).
//
// The counters live in this server instance's memory: on Vercel each warm instance counts on its
// own, so this stops a script hammering the site but is not an exact global limit. A shared store
// (Upstash Redis / Vercel KV) would make it exact; the shape below is the same either way.
// Set RATE_LIMIT_DISABLED=1 to switch it off (e.g. for load tests).

type Rule = { windowMs: number; max: number };

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Every route that calls Gemini is paid per request, so each gets its own, tighter budget.
const LIMITS: Record<string, Rule[]> = {
  "/api/recommend": [
    { windowMs: MINUTE, max: 10 },
    { windowMs: HOUR, max: 80 },
  ],
  "/api/refine-course": [
    { windowMs: MINUTE, max: 15 },
    { windowMs: HOUR, max: 120 },
  ],
  "/api/search-trips": [
    { windowMs: MINUTE, max: 15 },
    { windowMs: HOUR, max: 120 },
  ],
};
const DEFAULT_LIMITS: Rule[] = [
  { windowMs: MINUTE, max: 20 },
  { windowMs: HOUR, max: 200 },
];

const MAX_TRACKED_KEYS = 5000;
const hits = new Map<string, number[]>();

function clientAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  return (forwarded ? forwarded.split(",")[0] : request.headers.get("x-real-ip"))?.trim() || "unknown";
}

// Returns how many seconds to wait when over a limit, or 0 when the request may go through.
function check(key: string, rules: Rule[], now: number): number {
  const longest = Math.max(...rules.map((rule) => rule.windowMs));
  const recent = (hits.get(key) ?? []).filter((time) => now - time < longest);

  for (const rule of rules) {
    const inWindow = recent.filter((time) => now - time < rule.windowMs);
    if (inWindow.length >= rule.max) {
      hits.set(key, recent);
      return Math.max(1, Math.ceil((inWindow[0] + rule.windowMs - now) / 1000));
    }
  }

  recent.push(now);
  hits.set(key, recent);
  return 0;
}

function trim(now: number) {
  if (hits.size <= MAX_TRACKED_KEYS) {
    return;
  }
  // Drop addresses that have been quiet for the longest window first, then the oldest of the rest.
  for (const [key, times] of hits) {
    if (now - (times[times.length - 1] ?? 0) >= HOUR) {
      hits.delete(key);
    }
  }
  for (const key of hits.keys()) {
    if (hits.size <= MAX_TRACKED_KEYS) {
      break;
    }
    hits.delete(key);
  }
}

export function proxy(request: NextRequest) {
  if (process.env.RATE_LIMIT_DISABLED === "1") {
    return NextResponse.next();
  }

  const now = Date.now();
  const path = request.nextUrl.pathname;
  const rules = LIMITS[path] ?? DEFAULT_LIMITS;
  const retryAfter = check(`${path}|${clientAddress(request)}`, rules, now);
  trim(now);

  if (retryAfter > 0) {
    return NextResponse.json(
      { error: "rate_limited", retryAfterSeconds: retryAfter },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
