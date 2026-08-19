import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const TARGET_LOCALES = ["ko", "en", "ja", "zh"] as const;

const SYSTEM_PROMPT = `You translate short travel-course titles and descriptions for a Seoul tourism app.
Detect the source language automatically. Translate the given "title" and "description" into all four target locales: ko (Korean), en (English), ja (Japanese), zh (Simplified Chinese) — including the source language itself, so the caller always has a consistent value for every locale.
If "description" is an empty string, return an empty string for its translation in every locale.
Keep the tone casual and concise, matching the original length. Respond only via the provided JSON schema.`;

const localizedTripSchema = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
  },
  required: ["title", "description"],
};

export async function POST(request: NextRequest) {
  let title = "";
  let description = "";

  try {
    const body = await request.json();
    title = typeof body?.title === "string" ? body.title.trim() : "";
    description = typeof body?.description === "string" ? body.description.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ translations: null });
  }

  const requestBody = {
    contents: [{ parts: [{ text: JSON.stringify({ title, description }) }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: Object.fromEntries(TARGET_LOCALES.map((locale) => [locale, localizedTripSchema])),
        required: [...TARGET_LOCALES],
      },
    },
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ translations: null });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== "string") {
      return NextResponse.json({ translations: null });
    }

    return NextResponse.json({ translations: JSON.parse(text) });
  } catch {
    return NextResponse.json({ translations: null });
  }
}
