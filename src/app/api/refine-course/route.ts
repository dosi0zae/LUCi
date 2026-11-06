import { NextRequest, NextResponse } from "next/server";
import { refineCourseCore, type RefineInput } from "@/features/mobile/refine-course";

export const runtime = "nodejs";

function clip(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function parseBody(raw: unknown): RefineInput | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const body = raw as Record<string, unknown>;
  const asIds = (value: unknown) =>
    Array.isArray(value) ? value.filter((id): id is string => typeof id === "string").slice(0, 30) : [];
  const instruction = clip(body.instruction, 200).trim();
  const stopIds = asIds(body.stopIds);
  if (!instruction || stopIds.length === 0) {
    return null;
  }
  return { instruction, stopIds, pinnedIds: asIds(body.pinnedIds), locale: clip(body.locale, 5) };
}

export async function POST(request: NextRequest) {
  let input: RefineInput | null = null;
  try {
    input = parseBody(await request.json());
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  if (!input) {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
  return NextResponse.json(await refineCourseCore(input));
}
