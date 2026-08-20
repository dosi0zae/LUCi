import { NextRequest, NextResponse } from "next/server";
import {
  ATTRIBUTE_TAXONOMY,
  buildChain,
  fallbackIntent,
  SEOUL_DISTRICTS,
  type RecommendIntent,
} from "@/features/mobile/recommend-engine";
import type { PlaceCategory } from "@/features/mobile/mobile-data";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const CATEGORIES: PlaceCategory[] = ["문화재", "관광지", "문화시설", "축제행사"];

const REASON_LANGUAGE_NAME: Record<string, string> = {
  ko: "한국어",
  en: "English",
  ja: "日本語",
  zh: "简体中文",
};

function buildSystemPrompt(locale: string): string {
  const languageName = REASON_LANGUAGE_NAME[locale] ?? REASON_LANGUAGE_NAME.en;
  return `너는 서울 전역의 문화재·관광지·문화시설·축제를 엮어주는 여행 코스 추천 서비스의 의도 분석기야. 사용자의 문장 하나를 분석해서 아래 JSON 스키마로만 답해.
- categories: 문화재, 관광지, 문화시설, 축제행사 중 문장과 관련 있는 것만 (없으면 빈 배열).
- attributes: 다음 목록에서만 골라 문장의 분위기/상황을 표현: ${ATTRIBUTE_TAXONOMY.join(", ")}.
- placeCount: 추천할 장소 개수, 보통 3~5 사이 정수. 특별한 언급 없으면 4.
- area: 문장이 서울의 특정 구(區)를 명시했으면(어느 언어로 쓰였든, 예: "용산구", "Yongsan", "종로") 아래 목록 중 정확히 일치하는 값 하나로 답해. 특정 구가 명시되지 않았거나 "인사동"처럼 구보다 작은 동네/장소 이름만 나왔으면 null.
  목록: ${SEOUL_DISTRICTS.join(", ")}
- reason: 왜 이렇게 추천하는지 ${languageName}로 쓴 한 문장.`;
}

type GeminiAiIntent = {
  categories?: string[];
  attributes?: string[];
  placeCount?: number;
  area?: string | null;
  reason?: string;
};

async function getAiIntent(prompt: string, locale: string): Promise<GeminiAiIntent | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: buildSystemPrompt(locale) }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          categories: { type: "ARRAY", items: { type: "STRING", enum: [...CATEGORIES] } },
          attributes: { type: "ARRAY", items: { type: "STRING", enum: [...ATTRIBUTE_TAXONOMY] } },
          placeCount: { type: "INTEGER" },
          area: { type: "STRING", enum: [...SEOUL_DISTRICTS], nullable: true },
          reason: { type: "STRING" },
        },
        required: ["categories", "attributes", "placeCount", "area"],
      },
    },
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8000),
      },
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (typeof text !== "string") {
      return null;
    }

    return JSON.parse(text) as GeminiAiIntent;
  } catch {
    return null;
  }
}

// A literal substring match against the known district list, checked before/instead of
// trusting the LLM's own extraction — gemini-flash-lite has been observed missing an
// exact, unambiguous district name that's sitting right there in the prompt text, so
// this deterministic check is the primary source of truth and can't have that failure
// mode. Longest-first so no district name can be shadowed by a substring of another.
const DISTRICTS_BY_LENGTH_DESC = [...SEOUL_DISTRICTS].sort((a, b) => b.length - a.length);

function detectAreaFromPrompt(prompt: string): string | null {
  return DISTRICTS_BY_LENGTH_DESC.find((district) => prompt.includes(district)) ?? null;
}

function normalizeIntent(
  aiIntent: GeminiAiIntent | null,
  anchor: { lat: number; lng: number } | null,
  radiusKm: number | undefined,
  promptAreaMatch: string | null,
): RecommendIntent {
  if (!aiIntent) {
    // No AI read on the prompt, but the direct district match still applies.
    return { ...fallbackIntent(), areaFilter: promptAreaMatch, anchor: promptAreaMatch ? null : anchor, radiusKm };
  }

  const categories = Array.isArray(aiIntent.categories)
    ? aiIntent.categories.filter((category): category is PlaceCategory =>
        CATEGORIES.includes(category as PlaceCategory),
      )
    : [];

  const attributes = Array.isArray(aiIntent.attributes)
    ? aiIntent.attributes.filter((attribute) =>
        (ATTRIBUTE_TAXONOMY as readonly string[]).includes(attribute),
      )
    : [];

  const placeCount = typeof aiIntent.placeCount === "number" ? aiIntent.placeCount : 4;
  const aiArea = typeof aiIntent.area === "string" ? aiIntent.area : null;
  const areaFilter = promptAreaMatch ?? aiArea;
  // A prompt naming its own district (e.g. "용산구에서") shouldn't be overridden by the
  // device's current location — buildChain uses areaFilter as ground truth instead.
  const effectiveAnchor = areaFilter ? null : anchor;

  return { categories, attributes, placeCount, areaFilter, anchor: effectiveAnchor, radiusKm };
}

export async function POST(request: NextRequest) {
  let prompt = "";
  let locale = "en";
  let anchor: { lat: number; lng: number } | null = null;
  let radiusKm: number | undefined;

  try {
    const body = await request.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
    locale = typeof body?.locale === "string" ? body.locale : "en";
    if (
      body?.anchor &&
      typeof body.anchor.lat === "number" &&
      typeof body.anchor.lng === "number"
    ) {
      anchor = { lat: body.anchor.lat, lng: body.anchor.lng };
    }
    if (typeof body?.radiusKm === "number") {
      radiusKm = body.radiusKm;
    }
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const promptAreaMatch = detectAreaFromPrompt(prompt);
  const aiIntent = await getAiIntent(prompt, locale);
  const intent = normalizeIntent(aiIntent, anchor, radiusKm, promptAreaMatch);
  const result = buildChain(intent);

  return NextResponse.json({
    placeIds: result.placeIds,
    anchor: result.anchor,
    reason: aiIntent?.reason ?? null,
    usedAI: Boolean(aiIntent),
  });
}
