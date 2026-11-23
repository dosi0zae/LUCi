import { NextRequest, NextResponse } from "next/server";
import { describeCourseWithGemini, type DescribedStop } from "@/features/mobile/describe-course";

export const runtime = "nodejs";

// Writes the one-or-two-sentence description of a course again after its stops were changed by hand (a stop added,
// removed or swapped): the first description was written for the first set of stops and would say things that are not
// true any more. The stops come from the client as plain names, so a place found on the map screen is described too.
// Returns { reason: string | null }; the app hides the old text when there is no new one.

const MAX_STOPS = 10;

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

function parseStops(value: unknown): DescribedStop[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .slice(0, MAX_STOPS)
    .map((item) => {
      const stop = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
      return { name: clip(stop.name, 60), category: clip(stop.category, 12), area: clip(stop.area, 20) };
    })
    .filter((stop) => stop.name);
}

export async function POST(request: NextRequest) {
  let stops: DescribedStop[] = [];
  let prompt = "";
  let locale = "ko";
  try {
    const body = await request.json();
    stops = parseStops(body?.stops);
    prompt = clip(body?.prompt, 200);
    locale = clip(body?.locale, 5) || "ko";
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (stops.length < 2) {
    return NextResponse.json({ error: "stops are required" }, { status: 400 });
  }
  return NextResponse.json({ reason: await describeCourseWithGemini({ stops, prompt, locale }) });
}
