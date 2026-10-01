import { NextRequest, NextResponse } from "next/server";
import {
  ATTRIBUTE_TAXONOMY,
  buildChain,
  derivePreference,
  fallbackIntent,
  getScoredPool,
  localizeDistrictName,
  optimizeRoute,
  SEOUL_DISTRICTS,
  type RecommendIntent,
} from "@/features/mobile/recommend-engine";
import type { MobilePlace, PlaceCategory } from "@/features/mobile/mobile-data";

export const runtime = "nodejs";

const GEMINI_MODEL = "gemini-flash-lite-latest";
const CATEGORIES: PlaceCategory[] = ["문화재", "관광지", "문화시설", "축제행사"];

// Weather codes are WMO's, per Open-Meteo's docs — drizzle/rain/rain-showers/thunderstorm.
// Open-Meteo needs no API key, so this works with zero setup on any machine.
const RAIN_WEATHER_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
// Weather is roughly uniform across a city this size, so a fixed city-center coordinate
// is a fine stand-in when the request has no device/anchor location to check instead
// (e.g. a prompt naming its own district, where the route sends anchor: null).
const SEOUL_FALLBACK_COORD = { lat: 37.5665, lng: 126.978 };

const WEATHER_INDOOR_NOTE: Record<string, string> = {
  ko: "비 소식이 있어 실내 위주로 담아봤어요.",
  en: "Rain's in the forecast, so this leans toward indoor spots.",
  ja: "雨の予報があるため、屋内中心にまとめました。",
  zh: "预报有雨,所以主要安排了室内地点。",
};

// Framed as "we used everything available" rather than "we came up short" — when a
// district's real POI coverage is thin (or a tight radius just doesn't have more), the
// picked count is already the most the data can honestly support, not a bug to apologize
// for. See buildChain's requestedCount vs placeIds.length in the POST handler below.
const PLACE_MAX_SHOWN_NOTE: Record<string, (area: string | null) => string> = {
  ko: (area) => (area ? `${area}에 있는 장소를 최대로 담았어요.` : "지금 조건에 맞는 장소를 최대로 담았어요."),
  en: (area) =>
    area ? `Showing every place available in ${area}.` : "Showing every place available for this request.",
  ja: (area) => (area ? `${area}にある場所を最大限含めました。` : "条件に合う場所を最大限含めました。"),
  zh: (area) => (area ? `已收录${area}内所有可用地点。` : "已收录符合条件的所有地点。"),
};

// Best-effort only: a failed/slow weather lookup should never block a recommendation, so
// this always resolves (to "not raining") rather than throwing.
async function checkIsRaining(coord: { lat: number; lng: number }): Promise<boolean> {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coord.lat}&longitude=${coord.lng}&current=precipitation,weather_code`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!response.ok) {
      return false;
    }
    const data = await response.json();
    const precipitation = data?.current?.precipitation;
    const code = data?.current?.weather_code;
    return (typeof precipitation === "number" && precipitation > 0) || RAIN_WEATHER_CODES.has(code);
  } catch {
    return false;
  }
}

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

// How many of the top-scored pool candidates Gemini gets to choose from — big enough to
// give it a real choice beyond the single best-scoring handful, small enough to keep the
// request/response size and latency reasonable.
const SELECTION_SHORTLIST_SIZE = 24;

function buildSelectionSystemPrompt(locale: string, count: number): string {
  const languageName = REASON_LANGUAGE_NAME[locale] ?? REASON_LANGUAGE_NAME.en;
  return `너는 서울 당일 여행 코스를 짜는 큐레이터야. 사용자의 원래 요청과, 이미 조건에 맞게 걸러진 후보 장소 목록(id/이름/카테고리/지역/태그/설명/인지도)을 줄게.
이 후보들 중에서 정확히 ${count}개를, 하나하나 개별적으로 괜찮은지가 아니라 "하루 코스로 묶였을 때 자연스럽고 분위기가 일관되는 조합"인지를 기준으로 골라.
성격이 서로 겉도는 조합(예: 조용한 전통 공간과 시끌벅적한 핫플레이스를 억지로 섞는 것)은 피하고, 같은 테마/동선으로 이어지는 조합을 우선해.
반드시 주어진 id 목록에 있는 값만 쓰고, 중복 없이 정확히 ${count}개를 골라야 해.
그 다음 왜 이 조합을 골랐는지 ${languageName}로 자연스러운 한 문장을 써줘 — 실제로 고른 장소들을 반영한 설명이어야 해.
다른 말 없이 주어진 스키마로만 답해.`;
}

type SelectionCandidate = {
  id: string;
  name: string;
  category: string;
  area: string;
  tags: string[];
  description: string;
  fameScore: number;
};

async function selectChainWithGemini(
  prompt: string,
  locale: string,
  candidates: SelectionCandidate[],
  count: number,
): Promise<{ placeIds: string[]; reason: string } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const validIds = candidates.map((candidate) => candidate.id);
  const body = {
    contents: [{ parts: [{ text: JSON.stringify({ request: prompt, candidates }) }] }],
    systemInstruction: { parts: [{ text: buildSelectionSystemPrompt(locale, count) }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          placeIds: { type: "ARRAY", items: { type: "STRING", enum: validIds } },
          reason: { type: "STRING" },
        },
        required: ["placeIds", "reason"],
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

    const parsed = JSON.parse(text) as { placeIds?: unknown; reason?: unknown };
    const placeIds = Array.isArray(parsed.placeIds) ? parsed.placeIds : [];
    const validIdSet = new Set(validIds);
    // Never trust the model's output blindly, even with a schema enum constraining it —
    // require exactly `count` distinct, real candidate ids before using this at all.
    const isValid =
      placeIds.length === count &&
      new Set(placeIds).size === count &&
      placeIds.every((id): id is string => typeof id === "string" && validIdSet.has(id));

    if (!isValid || typeof parsed.reason !== "string" || !parsed.reason) {
      return null;
    }

    return { placeIds, reason: parsed.reason };
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

// Standard romanizations for a non-Korean prompt naming its own district (e.g. "let's
// explore Jongno-gu") — without this, that deterministic check above only ever fires for
// Korean text, so a foreign-language prompt has to rely entirely on the LLM catching a
// district name, which is exactly the failure mode the Korean check exists to avoid.
// "중구" has no bare-word alias ("jung" alone is too generic/common to safely match).
const DISTRICT_ROMANIZATIONS: Record<string, string[]> = {
  강남구: ["gangnam-gu", "gangnam"],
  강동구: ["gangdong-gu", "gangdong"],
  강북구: ["gangbuk-gu", "gangbuk"],
  강서구: ["gangseo-gu", "gangseo"],
  관악구: ["gwanak-gu", "gwanak"],
  광진구: ["gwangjin-gu", "gwangjin"],
  구로구: ["guro-gu", "guro"],
  금천구: ["geumcheon-gu", "geumcheon"],
  노원구: ["nowon-gu", "nowon"],
  도봉구: ["dobong-gu", "dobong"],
  동대문구: ["dongdaemun-gu", "dongdaemun"],
  동작구: ["dongjak-gu", "dongjak"],
  마포구: ["mapo-gu", "mapo"],
  서대문구: ["seodaemun-gu", "seodaemun"],
  서초구: ["seocho-gu", "seocho"],
  성동구: ["seongdong-gu", "seongdong"],
  성북구: ["seongbuk-gu", "seongbuk"],
  송파구: ["songpa-gu", "songpa"],
  양천구: ["yangcheon-gu", "yangcheon"],
  영등포구: ["yeongdeungpo-gu", "yeongdeungpo"],
  용산구: ["yongsan-gu", "yongsan"],
  은평구: ["eunpyeong-gu", "eunpyeong"],
  종로구: ["jongno-gu", "jongno"],
  중구: ["jung-gu"],
  중랑구: ["jungnang-gu", "jungnang"],
};

function matchesRomanizedDistrict(prompt: string, district: string): boolean {
  const aliases = DISTRICT_ROMANIZATIONS[district];
  if (!aliases) {
    return false;
  }
  return aliases.some((alias) => new RegExp(`\\b${alias}\\b`, "i").test(prompt));
}

function detectAreaFromPrompt(prompt: string): string | null {
  const korean = DISTRICTS_BY_LENGTH_DESC.find((district) => prompt.includes(district));
  if (korean) {
    return korean;
  }
  return DISTRICTS_BY_LENGTH_DESC.find((district) => matchesRomanizedDistrict(prompt, district)) ?? null;
}

// Named landmarks and neighborhoods that aren't a SEOUL_DISTRICTS match — either because
// they span multiple districts (남산, 청계천, 북한산) or because they're a smaller-than-구
// neighborhood (홍대, 이태원, ...) — but are common enough in prompts to deserve their own
// anchor point. Without this, a prompt naming one of these has no district to lock onto
// and buildChain falls back to the single highest-scored place in all of Seoul, which can
// land anywhere. Checked only when no exact district matches, so e.g. "동대문구" still
// wins over "동대문". 한강 is NOT here even though it's the same kind of cross-district
// name — the river runs the entire width of Seoul, so one anchor point only ever surfaces
// whatever's near that one spot, never the river's real length. It gets its own curated
// place-list handling instead (isHangangPrompt / intent.hangangOnly) — see
// SEOUL_HANGANG_PLACE_IDS in recommend-engine.ts.
const LANDMARK_ANCHORS: { aliases: string[]; lat: number; lng: number }[] = [
  { aliases: ["홍대", "홍대입구", "hongdae"], lat: 37.5563, lng: 126.9238 },
  { aliases: ["이태원", "itaewon"], lat: 37.5347, lng: 126.9947 },
  { aliases: ["명동", "myeongdong"], lat: 37.5636, lng: 126.9834 },
  { aliases: ["강남역", "gangnam station"], lat: 37.4979, lng: 127.0276 },
  { aliases: ["압구정", "압구정로데오", "apgujeong"], lat: 37.5274, lng: 127.0286 },
  { aliases: ["가로수길", "garosu-gil", "garosugil"], lat: 37.5202, lng: 127.0229 },
  { aliases: ["성수동", "성수", "seongsu"], lat: 37.5446, lng: 127.0559 },
  { aliases: ["여의도", "yeouido"], lat: 37.5219, lng: 126.9245 },
  { aliases: ["잠실", "jamsil"], lat: 37.5133, lng: 127.1001 },
  { aliases: ["북촌", "북촌한옥마을", "bukchon"], lat: 37.5826, lng: 126.9831 },
  { aliases: ["삼청동", "samcheong-dong", "samcheongdong"], lat: 37.5826, lng: 126.9816 },
  { aliases: ["인사동", "insadong"], lat: 37.574, lng: 126.9857 },
  { aliases: ["서울숲", "seoul forest"], lat: 37.5443, lng: 127.0374 },
  { aliases: ["청계천", "cheonggyecheon"], lat: 37.5696, lng: 126.9784 },
  { aliases: ["남산", "남산타워", "n서울타워", "namsan"], lat: 37.5512, lng: 126.9882 },
  { aliases: ["북한산", "bukhansan"], lat: 37.6584, lng: 126.9772 },
  { aliases: ["동대문", "ddp", "동대문디자인플라자", "dongdaemun"], lat: 37.5665, lng: 127.0092 },
  { aliases: ["롯데월드", "lotte world"], lat: 37.5111, lng: 127.0981 },
];

function detectLandmarkAnchorFromPrompt(prompt: string): { lat: number; lng: number } | null {
  const lower = prompt.toLowerCase();
  const landmark = LANDMARK_ANCHORS.find((entry) =>
    entry.aliases.some((alias) => lower.includes(alias.toLowerCase())),
  );
  return landmark ? { lat: landmark.lat, lng: landmark.lng } : null;
}

const HANGANG_KEYWORDS = ["한강", "한강변", "한강공원", "hangang", "han river", "han-river"];

function isHangangPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return HANGANG_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

// A prompt asking generically for Seoul's landmarks (no specific place/district named)
// has nothing to anchor on, so without this it falls through to buildChain's
// top-scored-place fallback — which picks by `savedBy`, a field that doesn't actually
// track real-world fame (see SEOUL_LANDMARK_PLACE_IDS's comment). This routes it to that
// curated list instead, via intent.landmarkOnly.
const GENERIC_LANDMARK_KEYWORDS = ["랜드마크", "대표 명소", "대표명소", "유명한 곳", "유명 관광지", "landmark", "iconic"];

function isGenericLandmarkPrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return GENERIC_LANDMARK_KEYWORDS.some((keyword) => lower.includes(keyword.toLowerCase()));
}

function normalizeIntent(
  aiIntent: GeminiAiIntent | null,
  anchor: { lat: number; lng: number } | null,
  radiusKm: number | undefined,
  promptAreaMatch: string | null,
  promptLandmarkAnchor: { lat: number; lng: number } | null,
  genericLandmarkIntent: boolean,
  hangangIntent: boolean,
  preference: { preferredCategories: PlaceCategory[]; preferredTags: string[] },
): RecommendIntent {
  if (!aiIntent) {
    // No AI read on the prompt, but the direct district match still applies.
    return {
      ...fallbackIntent(),
      areaFilter: promptAreaMatch,
      anchor: promptAreaMatch ? null : (promptLandmarkAnchor ?? anchor),
      landmarkOnly: !promptAreaMatch && !promptLandmarkAnchor && !hangangIntent && genericLandmarkIntent,
      hangangOnly: !promptAreaMatch && hangangIntent,
      radiusKm,
      ...preference,
    };
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
  // A prompt naming its own district (e.g. "용산구에서") or landmark (e.g. "한강변") shouldn't
  // be overridden by the device's current location — buildChain uses areaFilter, or the
  // landmark anchor, as ground truth instead.
  const effectiveAnchor = areaFilter ? null : (promptLandmarkAnchor ?? anchor);
  const landmarkOnly = !areaFilter && !promptLandmarkAnchor && !hangangIntent && genericLandmarkIntent;
  const hangangOnly = !areaFilter && hangangIntent;

  return {
    categories,
    attributes,
    placeCount,
    areaFilter,
    anchor: effectiveAnchor,
    landmarkOnly,
    hangangOnly,
    radiusKm,
    ...preference,
  };
}

export async function POST(request: NextRequest) {
  let prompt = "";
  let locale = "en";
  let anchor: { lat: number; lng: number } | null = null;
  let radiusKm: number | undefined;
  let bookmarkedPlaceIds: string[] = [];

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
    if (Array.isArray(body?.bookmarkedPlaceIds)) {
      bookmarkedPlaceIds = body.bookmarkedPlaceIds.filter((id: unknown): id is string => typeof id === "string");
    }
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }

  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
  }

  const promptAreaMatch = detectAreaFromPrompt(prompt);
  const promptLandmarkAnchor = detectLandmarkAnchorFromPrompt(prompt);
  const genericLandmarkIntent = isGenericLandmarkPrompt(prompt);
  const hangangIntent = isHangangPrompt(prompt);
  const aiIntent = await getAiIntent(prompt, locale);
  const preference = derivePreference(bookmarkedPlaceIds);
  const intent = normalizeIntent(
    aiIntent,
    anchor,
    radiusKm,
    promptAreaMatch,
    promptLandmarkAnchor,
    genericLandmarkIntent,
    hangangIntent,
    preference,
  );

  // Only nudge toward indoor places when the user hasn't already told us what they want —
  // an explicit "실외" ask (e.g. "한강 산책") should win over the weather, not get overruled.
  let weatherNote: string | null = null;
  if (!intent.attributes.includes("실내") && !intent.attributes.includes("실외")) {
    const isRaining = await checkIsRaining(anchor ?? SEOUL_FALLBACK_COORD);
    if (isRaining) {
      intent.preferredTags = [...new Set([...(intent.preferredTags ?? []), "실내"])];
      weatherNote = WEATHER_INDOOR_NOTE[locale] ?? WEATHER_INDOOR_NOTE.en;
    }
  }

  const result = buildChain(intent);
  const maxShownNote =
    result.placeIds.length < result.requestedCount
      ? (PLACE_MAX_SHOWN_NOTE[locale] ?? PLACE_MAX_SHOWN_NOTE.en)(
          localizeDistrictName(intent.areaFilter ?? null, locale),
        )
      : null;

  // Second opinion: buildChain's own pick (above) is a locally-scored, partly-random
  // choice among the top few candidates per category slot — good signal, no sense of
  // whether the stops actually cohere as a day's course. When the pool has real headroom
  // (at least as many candidates as requested — a thin pool means there's no meaningful
  // choice to improve on), ask Gemini to pick a more thematically coherent subset of the
  // SAME already-filtered pool instead, and to explain that specific combination. Any
  // failure/timeout/invalid output here just leaves the buildChain pick in place.
  let finalPlaceIds = result.placeIds;
  let selectionReason: string | null = null;

  if (result.placeIds.length === result.requestedCount) {
    const { scored } = getScoredPool(intent);
    const seenCoords = new Set<string>();
    const shortlist = scored.filter(({ place }) => {
      const key = `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
      if (seenCoords.has(key)) return false;
      seenCoords.add(key);
      return true;
    });

    if (shortlist.length >= result.requestedCount) {
      const byId = new Map(shortlist.map(({ place }) => [place.id, place]));
      const candidates: SelectionCandidate[] = shortlist.slice(0, SELECTION_SHORTLIST_SIZE).map(({ place }) => ({
        id: place.id,
        name: place.name,
        category: place.category,
        area: place.area,
        tags: place.tags,
        description: place.description.slice(0, 120),
        fameScore: place.fameScore ?? 0,
      }));

      const selection = await selectChainWithGemini(prompt, locale, candidates, result.requestedCount);
      if (selection) {
        const selectedPlaces = selection.placeIds
          .map((id) => byId.get(id))
          .filter((place): place is MobilePlace => Boolean(place));
        if (selectedPlaces.length === result.requestedCount) {
          finalPlaceIds = optimizeRoute(selectedPlaces).map((place) => place.id);
          selectionReason = selection.reason;
        }
      }
    }
  }

  return NextResponse.json({
    placeIds: finalPlaceIds,
    anchor: result.anchor,
    areaFilter: intent.areaFilter ?? null,
    reason: [selectionReason ?? aiIntent?.reason, weatherNote, maxShownNote].filter(Boolean).join(" ") || null,
    usedAI: Boolean(aiIntent),
    usedGeminiSelection: Boolean(selectionReason),
  });
}
