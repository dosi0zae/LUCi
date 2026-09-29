import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-flash-lite-latest";

const SUMMARY_LANGUAGE_NAME: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "简体中文",
};

function buildSystemPrompt(locale: string): string {
  const languageName = SUMMARY_LANGUAGE_NAME[locale] ?? SUMMARY_LANGUAGE_NAME.en;
  return `다음은 한 관광/문화 장소에 대한 상세 설명이야. 이 장소가 어떤 곳인지 핵심만 골라 ${languageName}로 자연스러운 문장 2~3개(130자 이내)로 새로 요약해. 원문을 그대로 잘라내지 말고, 실제로 요약된 문장을 새로 써줘. 다른 말 없이 요약 문장만 답해.`;
}

// Used whenever Gemini is unavailable (no key, timeout, error) — cuts at the last
// sentence boundary within the window instead of hard-truncating mid-word/mid-sentence
// the way a CSS line-clamp does, so even the fallback reads as a complete thought.
function fallbackSummary(description: string, maxLength = 120): string {
  if (description.length <= maxLength) {
    return description;
  }

  const window = description.slice(0, maxLength + 20);
  const lastPeriod = window.lastIndexOf(".");
  if (lastPeriod > maxLength * 0.5) {
    return window.slice(0, lastPeriod + 1);
  }

  const lastSpace = description.slice(0, maxLength).lastIndexOf(" ");
  return `${description.slice(0, lastSpace > 0 ? lastSpace : maxLength)}...`;
}

export async function POST(request: NextRequest) {
  let description = "";
  let locale = "ko";

  try {
    const body = await request.json();
    description = typeof body?.description === "string" ? body.description.trim() : "";
    locale = typeof body?.locale === "string" ? body.locale : "ko";
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!description) {
    return NextResponse.json({ error: "description is required" }, { status: 400 });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ summary: fallbackSummary(description), usedAI: false });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: description }] }],
          systemInstruction: { parts: [{ text: buildSystemPrompt(locale) }] },
        }),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      return NextResponse.json({ summary: fallbackSummary(description), usedAI: false });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ summary: fallbackSummary(description), usedAI: false });
    }

    return NextResponse.json({ summary: text.trim(), usedAI: true });
  } catch {
    return NextResponse.json({ summary: fallbackSummary(description), usedAI: false });
  }
}
