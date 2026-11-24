// Server-side only. Appends one row to the "TripChain 추천 로그" Google Sheet through its Apps Script web app (a POST that carries a
// shared token; the same token is written in that script). Never throws and never blocks a response: when the two environment
// variables are missing (a fresh checkout, a preview deploy) nothing is logged.
//
// What goes in: the sentence a person typed, what the app read from it, the stops it gave, and (for a good/bad answer) the rating
// and a short comment. Anything that looks like an email address, a phone number or a long number is removed first, and every
// field is cut to a safe length.

export type LogRow = {
  kind: "recommend" | "feedback";
  locale?: string;
  prompt?: string;
  model?: string;
  usedAI?: boolean;
  intent?: unknown;
  placeIds?: string[];
  unmet?: string[];
  rating?: string;
  comment?: string;
};

const MAX_TEXT = 500;
const VERSION = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";

export function scrub(text: unknown, max = MAX_TEXT): string {
  if (typeof text !== "string") {
    return "";
  }
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[number]")
    .slice(0, max);
}

export async function logToSheet(row: LogRow): Promise<void> {
  const url = process.env.TRIPCHAIN_LOG_URL;
  const token = process.env.TRIPCHAIN_LOG_TOKEN;
  if (!url || !token) {
    return;
  }
  try {
    await fetch(url, {
      method: "POST",
      // text/plain keeps this a "simple" request: Apps Script answers it without a pre-flight round trip.
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify({
        token,
        kind: row.kind,
        locale: scrub(row.locale, 8),
        prompt: scrub(row.prompt),
        model: scrub(row.model, 60),
        usedAI: row.usedAI ?? "",
        intent: row.intent === undefined ? "" : scrub(JSON.stringify(row.intent), 800),
        placeIds: (row.placeIds ?? []).slice(0, 12).join(","),
        unmet: (row.unmet ?? []).join(","),
        rating: scrub(row.rating, 20),
        comment: scrub(row.comment, 300),
        version: VERSION,
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    // A lost log row is not worth an error for the person using the app.
  }
}
