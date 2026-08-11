import { NextRequest, NextResponse } from "next/server";
import {
  ATTRIBUTE_TAXONOMY,
  buildChain,
  fallbackIntent,
  type RecommendIntent,
} from "@/features/mobile/recommend-engine";
import {
  detectAreaFromText,
  inferArea,
  type AreaId,
  type PlaceCategory,
} from "@/features/mobile/mobile-data";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const AREA_IDS: AreaId[] = ["seongsu", "hongdae", "gangnam"];
const CATEGORIES: PlaceCategory[] = ["전시", "카페", "팝업", "산책"];

const SYSTEM_PROMPT = `너는 서울 데이트/나들이 코스 추천 서비스의 의도 분석기야. 사용자의 자연어 문장 하나를 분석해서 아래 JSON 스키마로만 답해.
- areaId: 성수(seongsu), 홍대(hongdae), 강남(gangnam) 중 문장에서 추론되는 지역 하나. 명시되지 않았거나 애매하면 null.
- categories: 전시, 카페, 팝업, 산책 중 문장과 관련 있는 것만 (없으면 빈 배열).
- attributes: 다음 목록에서만 골라 문장의 분위기/상황을 표현: ${ATTRIBUTE_TAXONOMY.join(", ")}.
- placeCount: 추천할 장소 개수, 보통 3~5 사이 정수. 특별한 언급 없으면 4.
- reason: 왜 이렇게 추천하는지 한국어 한 문장.`;

type GeminiAiIntent = {
  areaId?: string | null;
  categories?: string[];
  attributes?: string[];
  placeCount?: number;
  reason?: string;
};

async function getAiIntent(prompt: string): Promise<GeminiAiIntent | null> {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return null;
  }

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          areaId: { type: "STRING", enum: [...AREA_IDS], nullable: true },
          categories: { type: "ARRAY", items: { type: "STRING", enum: [...CATEGORIES] } },
          attributes: { type: "ARRAY", items: { type: "STRING", enum: [...ATTRIBUTE_TAXONOMY] } },
          placeCount: { type: "INTEGER" },
          reason: { type: "STRING" },
        },
        required: ["categories", "attributes", "placeCount"],
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

function normalizeIntent(prompt: string, aiIntent: GeminiAiIntent | null): RecommendIntent {
  if (!aiIntent) {
    return fallbackIntent(prompt);
  }

  // An area name written in the prompt is a stronger signal than the AI's guess,
  // which sometimes mis-infers the area for lightweight/free-tier models.
  const explicitArea = detectAreaFromText(prompt);
  const areaId =
    explicitArea ??
    (AREA_IDS.includes(aiIntent.areaId as AreaId) ? (aiIntent.areaId as AreaId) : inferArea(prompt));

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

  return { areaId, categories, attributes, placeCount };
}

export async function POST(request: NextRequest) {
  let prompt = "";

  try {
    const body = await request.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const aiIntent = await getAiIntent(prompt);
  const intent = normalizeIntent(prompt, aiIntent);
  const { areaId, placeIds } = buildChain(intent);

  return NextResponse.json({
    areaId,
    placeIds,
    reason: aiIntent?.reason ?? null,
    usedAI: Boolean(aiIntent),
  });
}
