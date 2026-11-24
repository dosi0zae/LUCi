import { NextRequest, NextResponse } from "next/server";
import { logToSheet } from "@/features/mobile/log-sheet";

export const runtime = "nodejs";

// "withdrawn": the person tapped their chosen side again to take the answer back.
const RATINGS = new Set(["good", "bad", "withdrawn"]);
const REASONS = new Set(["places", "conditions", "other"]);

// A person's answer to "was this recommendation good?" (see recommend-feedback.tsx). The sentence and the stops come from the
// page that showed them, so a row can be read on its own in the sheet.
export async function POST(request: NextRequest) {
  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const rating = typeof body.rating === "string" && RATINGS.has(body.rating) ? body.rating : null;
  if (!rating) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const reason = typeof body.reason === "string" && REASONS.has(body.reason) ? body.reason : "";
  const comment = typeof body.comment === "string" ? body.comment : "";

  await logToSheet({
    kind: "feedback",
    locale: typeof body.locale === "string" ? body.locale : "",
    prompt: typeof body.prompt === "string" ? body.prompt : "",
    model: typeof body.model === "string" ? body.model : "",
    usedAI: body.usedAI === true,
    placeIds: Array.isArray(body.placeIds) ? body.placeIds.filter((id): id is string => typeof id === "string") : [],
    unmet: Array.isArray(body.unmet) ? body.unmet.filter((tag): tag is string => typeof tag === "string").slice(0, 6) : [],
    rating,
    comment: [reason, comment].filter(Boolean).join(": "),
  });
  return NextResponse.json({ ok: true });
}
