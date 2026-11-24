import { after, NextRequest, NextResponse } from "next/server";
import { logToSheet } from "@/features/mobile/log-sheet";
import {
  ATTRIBUTE_TAXONOMY,
  buildChain,
  derivePreference,
  fallbackIntent,
  getScoredPool,
  isHangangPlace,
  localizeDistrictName,
  optimizeRoute,
  optimizeRoutePreservingPins,
  isSameSpot,
  SEOUL_DISTRICTS,
  type RecommendIntent,
} from "@/features/mobile/recommend-engine";
import { getPlacesByIds, getTotalMinutes, haversineKm, isDiningCategory, localizePlace, type MobilePlace, type PlaceCategory } from "@/features/mobile/mobile-data";
import { SUPPORTED_LOCALES, type Locale } from "@/features/mobile/i18n/translations";
import { applyReview, pickAlternatives, reviewCourseWithGemini } from "@/features/mobile/course-critic";
import { describeCourseWithGemini } from "@/features/mobile/describe-course";
import { getLoadedDiningPlaces } from "@/features/mobile/dining-store";
import {
  buildDiningCourse,
  DINING_UNAVAILABLE_NOTE,
  DINING_WOVEN_NOTE,
  NO_DINING_PATTERN,
  STRONG_FOOD_PATTERN,
  weaveDefaultDining,
} from "@/features/mobile/dining-course";
import { refineCourseCore } from "@/features/mobile/refine-course";
import { resolvePlaceAnchor, stationFromPrompt } from "@/app/api/recommend/place-anchor";

export const runtime = "nodejs";
// A course takes several model calls in turn (the request read, the pick, the review, the new introduction); the default
// limit of a serverless function is short.
export const maxDuration = 30;

const GEMINI_MODEL = "gemini-flash-lite-latest";
// The request read (what the sentence means) is the step that decides how well a person is understood, and it is one short call,
// so it runs on a stronger model than the rest: about 2.5 won a call against about 1.1 (measured, thinking kept to "low").
// 3.8 Flash's price is promotional through 2026-12-31 and doubles on 2027-01-01 (0.75 -> 1.50 input, 3.75 -> 7.50 output per 1M
// tokens): decide before then whether to keep it. GEMINI_INTENT_MODEL overrides it (set it to GEMINI_MODEL's value to go back).
const INTENT_MODEL = process.env.GEMINI_INTENT_MODEL ?? "gemini-3.8-flash";
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
- focus: 요청의 중심. 맛집·카페·술집·먹거리를 도는 코스가 중심이면 dining, 관광·문화 코스에 식사나 카페도 함께 넣으려는 요청이면 mixed, 그 외에는 sights.
- variety: 요청이 한 가지를 더 많이/집중해서 원하면 focused ("궁궐만 쭉", "카페 위주로", "미술관 세 곳", "전부 야외로"처럼 같은 종류의 반복 자체가 원하는 것). 그렇지 않고 여러 가지를 섞은 하루를 원하거나 별말이 없으면 mixed. 단어 하나가 아니라 문장 전체의 뜻으로 판단해.
- pace: 하루의 속도. "여유롭게", "천천히", "힐링"처럼 느긋하면 relaxed, "알차게", "빡빡하게", "최대한 많이"면 packed, 그 외 balanced.
- startTime: 시작 시간대를 말했거나 뜻하면 morning/afternoon/evening/night ("저녁 먹고 야경", "퇴근하고"는 evening, "아침 일찍"은 morning), 아무 말 없으면 null.
- placeCount: 추천할 장소 개수, 보통 3~5 사이 정수. 특별한 언급 없으면 4. relaxed면 3~4로 줄이고 packed면 5~6으로 늘려.
- area: 문장에 서울의 구(區) 이름이 글자 그대로 쓰여 있을 때만(어느 언어로 쓰였든, 예: "용산구", "Yongsan", "종로") 아래 목록 중 정확히 일치하는 값 하나로 답해. 구 이름이 없으면 반드시 null. 역·동네·건물·관광지 이름(성수역, 성수동, 강남역, 인사동)을 보고 어느 구인지 추측해서 채우지 마.
- place: 문장이 중심으로 삼는 구체적인 장소·역·동네·건물의 이름(예: "성수역", "홍대입구역", "연남동", "서울숲", "경복궁")이 있으면 문장에 쓰인 그대로 답해. 구 이름만 있거나("마포구") 특정 장소가 없으면 null.
  목록: ${SEOUL_DISTRICTS.join(", ")}
- meetingPoints: 서로 다른 곳에서 출발하는 사람들이 만나는 요청("A역, B역, C역에서 출발해서 만날 곳", "강남이랑 홍대 사이")이면 각 출발지의 이름(역·동네)을 문장에 쓰인 그대로 담은 배열. 출발지가 하나이거나 없으면 빈 배열.
- maxMinutes: 전체 코스 시간의 상한을 분으로. "4시간 이내"는 240, "두 시간 안에"는 120, "반나절"은 240. 말이 없으면 null.
- indoorOnly: 실내 장소만 원하면 true("실내 코스", "비 피해서", "밖에 나가기 싫어"). 아니면 false. outdoorOnly: 야외·실외 장소만 원하면 true("야외로만", "산책 위주"). 아니면 false. 둘 다 true일 수는 없어.
- reason: 왜 이렇게 추천하는지 ${languageName}로 쓴 한 문장.`;
}

type GeminiAiIntent = {
  focus?: string;
  variety?: string;
  pace?: string;
  startTime?: string | null;
  categories?: string[];
  attributes?: string[];
  placeCount?: number;
  area?: string | null;
  place?: string | null;
  meetingPoints?: string[];
  maxMinutes?: number | null;
  indoorOnly?: boolean;
  outdoorOnly?: boolean;
  reason?: string;
};

// The same sentence asked again (the refresh button, a wider or narrower radius, the same example tapped twice) reads the same, so the
// answer of the intent step is kept for a while in this server instance and reused instead of asking the model again (about 2-4
// seconds saved). Only a real answer is kept, and a copy is handed out because the caller changes what it gets.
const INTENT_CACHE_MS = 15 * 60 * 1000;
const INTENT_CACHE_MAX = 300;
const intentCache = new Map<string, { at: number; intent: GeminiAiIntent }>();

async function getAiIntentCached(prompt: string, locale: string): Promise<GeminiAiIntent | null> {
  const key = `${locale}\n${prompt}`;
  const hit = intentCache.get(key);
  if (hit && Date.now() - hit.at < INTENT_CACHE_MS) {
    return structuredClone(hit.intent);
  }
  const intent = await getAiIntent(prompt, locale);
  if (intent) {
    if (intentCache.size >= INTENT_CACHE_MAX) {
      const oldest = intentCache.keys().next().value;
      if (oldest !== undefined) {
        intentCache.delete(oldest);
      }
    }
    intentCache.set(key, { at: Date.now(), intent: structuredClone(intent) });
  }
  return intent;
}

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
      thinkingConfig: { thinkingLevel: "low" },
      responseSchema: {
        type: "OBJECT",
        properties: {
          focus: { type: "STRING", enum: ["sights", "dining", "mixed"] },
          variety: { type: "STRING", enum: ["focused", "mixed"] },
          pace: { type: "STRING", enum: ["relaxed", "balanced", "packed"] },
          startTime: { type: "STRING", enum: ["morning", "afternoon", "evening", "night"], nullable: true },
          categories: { type: "ARRAY", items: { type: "STRING", enum: [...CATEGORIES] } },
          attributes: { type: "ARRAY", items: { type: "STRING", enum: [...ATTRIBUTE_TAXONOMY] } },
          placeCount: { type: "INTEGER" },
          area: { type: "STRING", enum: [...SEOUL_DISTRICTS], nullable: true },
          place: { type: "STRING", nullable: true },
          meetingPoints: { type: "ARRAY", items: { type: "STRING" } },
          maxMinutes: { type: "INTEGER", nullable: true },
          indoorOnly: { type: "BOOLEAN" },
          outdoorOnly: { type: "BOOLEAN" },
          reason: { type: "STRING" },
        },
        required: ["focus", "categories", "attributes", "placeCount", "area"],
      },
    },
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${INTENT_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
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
const SELECTION_SHORTLIST_SIZE = 28;
// How far apart the stops of one course may be (the two farthest stops), by how the day is paced.
const MAX_COURSE_SPAN_KM = 4.5;
const MAX_COURSE_SPAN_KM_AREA = 8;
// Plus some lesser-known places from further down the ranking, so the pick is not only ever the
// best-known sights (a course needs one "find" in it).
const SELECTION_DISCOVERY_SIZE = 12;
const DISCOVERY_MAX_FAME = 55;

type CourseRhythm = {
  variety?: "focused" | "mixed";
  pace?: "relaxed" | "balanced" | "packed";
  startTime?: "morning" | "afternoon" | "evening" | "night";
};

function buildSelectionSystemPrompt(locale: string, count: number): string {
  const languageName = REASON_LANGUAGE_NAME[locale] ?? REASON_LANGUAGE_NAME.en;
  return `너는 서울 당일 여행 코스를 짜는 큐레이터야. 사용자의 원래 요청과, 이미 조건에 맞게 걸러진 후보 장소 목록을 줄게.
각 후보에는 id, 이름, 카테고리, 지역, 태그/분위기(moods), 예상 체류분(minutes), 에너지(energy 1 편안함~3 많이 걸음), 어울리는 시간대(bestTime), 운영시간(hours), 한 줄 이야기(story), 설명, 인지도(fameScore 0~100)가 있고, 없는 값은 생략돼 있어.
이 후보들 중에서 정확히 ${count}개를 골라. "하나하나 좋은 곳"이 아니라 "하루가 흐르는 코스"여야 해:
- 시작은 코스의 얼굴이 되는 곳, 가운데는 분위기가 바뀌거나 쉬어가는 곳, 마지막은 하루를 마무리하기 좋은 곳(여유롭거나 저녁/야경이 어울리는 곳)으로 이어지게 해.
- 요청과 함께 rhythm(variety, pace, startTime)을 줄게. 요청을 이미 읽어서 정한 값이니 따라.
  variety가 mixed(또는 없음)면: 같은 카테고리·같은 지역·같은 분위기가 세 곳 넘게 몰리지 않게 하고 실내와 실외가 번갈아 나오면 좋아.
  variety가 focused면: 사용자가 한 가지를 더 원하는 것이니 다양성은 신경 쓰지 말고, 그 주제를 깊이 있게 이어서 비슷한 곳을 모아도 돼. 대신 겹치는 곳(같은 건물 등)은 피해.
  pace가 relaxed면 에너지가 낮고 가까운 곳 위주로 여유 있게, packed면 알차게 이어서 짜. startTime이 있으면 그 시간대에 어울리는 곳으로 시작하고 거기서부터 하루가 이어지게 해.
- 요청의 분위기·상황(누구와, 어떤 기분, 시간대)을 최우선으로 반영해. 성격이 겉도는 조합(조용한 전통 공간과 시끌벅적한 핫플레이스)은 피해.
- 인지도가 낮아도 요청과 잘 맞는 곳이 있으면 한 곳쯤은 "숨은 발견"으로 넣어. 단 요청에 어긋나면 넣지 마.
- 운영시간이나 bestTime이 있으면 시간대가 안 맞는 곳(예: 야경 장소를 오전 첫 코스)은 피해.
- 하루 코스는 한 동네 안에서 이어져야 해. 각 후보의 km는 코스 중심에서 떨어진 거리야. 고른 장소끼리 서로 3km 넘게 떨어지지 않게 하고, 가까운 곳끼리 한 방향으로 흘러가게 해(갔던 방향으로 되돌아오거나 강·길 건너를 오가지 않게).
- 같은 종류의 장소(예: 한강공원 여러 곳, 같은 거리의 비슷한 가게)를 여러 개 고르지 마. 요청의 주제(예: 노을, 야경)를 보여주는 곳은 한 곳이면 충분하고, 나머지는 그 주변의 다른 성격의 곳(전시, 골목, 휴식)으로 채워서 그 주제로 향하는 하루가 되게 해. 해질녘·노을이 주제면 그 장소는 코스의 뒤쪽에 둬.
반드시 주어진 id 목록에 있는 값만 쓰고, 중복 없이 정확히 ${count}개를 골라야 해.
title: 코스 이름. ${languageName}로 12자~20자 안팎, 장소 이름을 나열하지 말고 이 코스만의 분위기나 흐름을 한 구절로. 고른 장소의 특징에서 새로 지어내고, 다른 코스와 겹칠 법한 흔한 문구는 피해. 따옴표나 마침표는 쓰지 마.${locale === "ko" ? "" : ` 제목에 한글을 한 글자도 섞지 마: 지명이나 장소 이름을 쓰게 되면 ${languageName}로 옮겨 써.`}
reason: 왜 이 조합인지 ${languageName}로 자연스러운 한 문장, 실제로 고른 장소들을 반영해서. "사용자"나 "요청하신"이라는 말은 쓰지 않는다. 휠체어·유모차 접근성, 반려동물 동반, 가격·예산, 영업시간은 우리 데이터에 없으니 이 조건을 충족한다고 reason과 title에 쓰지 마.
다른 말 없이 주어진 스키마로만 답해.`;
}

type SelectionCandidate = {
  id: string;
  // Distance from the middle of the course's area, so the model can keep the stops in one neighbourhood.
  km?: number;
  name: string;
  category: string;
  area: string;
  tags: string[];
  moods?: string[];
  minutes?: number;
  energy?: number;
  bestTime?: string[];
  hours?: string;
  story?: string;
  description: string;
  fameScore: number;
};

// Only fields a place actually has are sent, so a sparse record costs nothing and a richly
// enriched one (see scripts/enrich-places.mjs) gives the selection everything to reason with.
function toSelectionCandidate(place: MobilePlace, anchor: { lat: number; lng: number } | null): SelectionCandidate {
  const minutes = place.durationMin ?? Number.parseInt(place.duration, 10);
  const candidate: SelectionCandidate = {
    id: place.id,
    name: place.name,
    category: place.category,
    area: place.area,
    tags: place.tags,
    description: place.description.slice(0, place.story ? 80 : 120),
    fameScore: place.fameScore ?? 0,
  };
  if (anchor) candidate.km = Math.round(haversineKm(anchor, place) * 10) / 10;
  // The river parks carry no time-of-day data; they are an evening place (see dayRank).
  if (isHangangPlace(place) && !place.bestTime?.length) candidate.bestTime = ["afternoon", "evening"];
  if (place.moods?.length) candidate.moods = place.moods;
  if (Number.isFinite(minutes) && place.durationMin) candidate.minutes = minutes;
  if (place.energy) candidate.energy = place.energy;
  if (place.bestTime?.length) candidate.bestTime = place.bestTime;
  if (place.hours && place.hours !== "정보 없음") candidate.hours = place.hours;
  if (place.story) candidate.story = place.story;
  return candidate;
}

async function selectChainWithGemini(
  prompt: string,
  locale: string,
  candidates: SelectionCandidate[],
  count: number,
  rhythm: CourseRhythm,
): Promise<{ placeIds: string[]; reason: string; title: string | null } | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const validIds = candidates.map((candidate) => candidate.id);
  const body = {
    contents: [{ parts: [{ text: JSON.stringify({ request: prompt, rhythm, candidates }) }] }],
    systemInstruction: { parts: [{ text: buildSelectionSystemPrompt(locale, count) }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          placeIds: { type: "ARRAY", items: { type: "STRING", enum: validIds } },
          title: { type: "STRING" },
          reason: { type: "STRING" },
        },
        required: ["placeIds", "title", "reason"],
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

    const parsed = JSON.parse(text) as { placeIds?: unknown; reason?: unknown; title?: unknown };
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

    const title = typeof parsed.title === "string" ? parsed.title.trim().replace(/^["'“”]+|["'“”.]+$/g, "") : "";
    // A title with Hangul left in it (a place name half-translated: "麻포漫游日") is dropped; the course then shows the request instead.
    const mixedScript = locale !== "ko" && /[가-힣]/.test(title);
    return { placeIds, reason: parsed.reason, title: title && title.length <= 40 && !mixedScript ? title : null };
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

// The model has to answer with a district or null, and for a place name it used to pick one (성수동 -> 송파구, 강남역 ->
// 종로구). Its answer now counts only when the sentence itself names that district: the full name, its short form
// ("용산", "종로": two letters or more) or its romanization.
function promptNamesDistrict(prompt: string, district: string): boolean {
  if (prompt.includes(district) || matchesRomanizedDistrict(prompt, district)) {
    return true;
  }
  const stem = district.replace(/구$/, "");
  return stem.length >= 2 && prompt.includes(stem);
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

// Conditions the sentence states outright are read from the words themselves first (the same way a district name is): the
// model has missed plain ones before, and a "4시간 이내" must not depend on it.
function maxMinutesFromPrompt(prompt: string): number | null {
  const hours = /(\d+(?:\.\d+)?)\s*시간\s*(반)?\s*(?:이내|안에|안|내|정도|까지|미만)/.exec(prompt);
  if (hours) {
    return Math.round((Number(hours[1]) + (hours[2] ? 0.5 : 0)) * 60);
  }
  const minutes = /(\d{2,3})\s*분\s*(?:이내|안에|안|내|정도|까지|미만)/.exec(prompt);
  return minutes ? Number(minutes[1]) : null;
}

const OUTDOOR_WORDS = /(야외|실외|outdoor)/i;
const INDOOR_WORDS = /(실내|indoor)/i;

// The words of the sentence decide when they are plain ("실내 코스"); the model's read only fills in what the words do not say
// ("비 피해서"), and when the two disagree the words win (the model once marked a rainy-day indoor request as outdoor-only).
function indoorChoice(prompt: string, aiIntent: GeminiAiIntent | null): { indoorOnly: boolean; outdoorOnly: boolean } {
  const wordsIndoor = INDOOR_WORDS.test(prompt) && !OUTDOOR_WORDS.test(prompt);
  const wordsOutdoor = OUTDOOR_WORDS.test(prompt) && !INDOOR_WORDS.test(prompt);
  const aiIndoor = Boolean(aiIntent?.indoorOnly) && !aiIntent?.outdoorOnly;
  const aiOutdoor = Boolean(aiIntent?.outdoorOnly) && !aiIntent?.indoorOnly;
  return {
    indoorOnly: wordsIndoor || (aiIndoor && !wordsOutdoor),
    outdoorOnly: wordsOutdoor || (aiOutdoor && !wordsIndoor),
  };
}

// People starting from different places ("양재, 광운대역, 디지털미디어시티역에서 출발해서 만날 곳"): every starting point is
// looked up on the map and the course is built around the middle of them, not around whichever one the sentence names first.
async function resolveMeetingPoint(
  aiIntent: GeminiAiIntent | null,
  prompt: string,
): Promise<{ center: { lat: number; lng: number }; names: string[] } | null> {
  const fromAi = Array.isArray(aiIntent?.meetingPoints) ? aiIntent.meetingPoints.filter((name): name is string => typeof name === "string") : [];
  const stations = prompt.match(/[가-힣0-9]{2,12}역(?![가-힣])/g) ?? [];
  const names = [...new Set(fromAi.length >= 2 ? fromAi : /(만나|중간|사이|모이|출발)/.test(prompt) ? stations : [])].slice(0, 5);
  if (names.length < 2) {
    return null;
  }
  const lookups = await Promise.all(names.map(async (name) => ({ name, point: await resolvePlaceAnchor(name) })));
  const found = lookups.filter((entry): entry is { name: string; point: NonNullable<typeof entry.point> } => Boolean(entry.point));
  if (found.length < 2) {
    return null;
  }
  const center = {
    lat: found.reduce((sum, entry) => sum + entry.point.lat, 0) / found.length,
    lng: found.reduce((sum, entry) => sum + entry.point.lng, 0) / found.length,
  };
  // The names shown are the ones the sentence used ("양재", "광운대역"), not the map's full title ("양재역 신분당선").
  return { center, names: found.map((entry) => entry.name) };
}

const MEETING_NOTE: Record<string, (names: string, area: string) => string> = {
  ko: (names, area) => `${names}의 중간쯤인 ${area} 일대로 잡았어요.`,
  en: (names, area) => `Set around ${area}, roughly halfway between ${names}.`,
  ja: (names, area) => `${names}の中間あたりの${area}周辺にしました。`,
  zh: (names, area) => `选在${names}大致中间的${area}一带。`,
};

const TIME_FIT_NOTE: Record<string, (hours: string, count: number) => string> = {
  ko: (hours, count) => `${hours} 안에 마치도록 ${count}곳으로 담았어요.`,
  en: (hours, count) => `Kept to ${count} stops so it fits in ${hours}.`,
  ja: (hours, count) => `${hours}以内に収まるよう${count}か所にしました。`,
  zh: (hours, count) => `为了在${hours}内结束,安排了${count}个地点。`,
};

// Said when a condition could not be kept, so the course never silently ignores what was asked.
const TIME_MISS_NOTE: Record<string, (hours: string, count: number) => string> = {
  ko: (hours, count) => `${hours} 안에 맞추기는 어려워서 가장 짧은 ${count}곳으로 담았어요.`,
  en: (hours, count) => `Fitting ${hours} wasn't possible here, so this is the shortest option with ${count} stops.`,
  ja: (hours, count) => `${hours}以内は難しいため、最も短い${count}か所にしました。`,
  zh: (hours, count) => `难以在${hours}内完成,所以安排了最短的${count}个地点。`,
};

const MEETING_MISS_NOTE: Record<string, string> = {
  ko: "출발지를 지도에서 모두 찾지 못해 중간 지점으로 잡지는 못했어요.",
  en: "Couldn't find every starting point on the map, so this isn't set around their middle.",
  ja: "出発地をすべて地図で見つけられず、中間地点には設定できませんでした。",
  zh: "未能在地图上找到所有出发地,因此没有以中间位置为中心。",
};

// What a request can ask for that this app cannot honour. Said in a short note under the introduction (and logged as `unmet`), so
// the course never looks as if it had kept the condition.
const NOTICE_TEXT: Record<string, Record<string, string>> = {
  outside: {
    ko: "서울 안의 코스만 만들 수 있어서, 서울에서 비슷한 분위기로 골랐어요.",
    en: "Courses are only available inside Seoul, so this one is picked in Seoul instead.",
    ja: "コースはソウル市内のみ対応のため、ソウルで選びました。",
    zh: "目前只能规划首尔市内的路线,所以改为在首尔挑选。",
  },
  unclear: {
    ko: "요청을 잘 이해하지 못해서 서울 대표 코스로 골랐어요. 가고 싶은 곳이나 분위기를 말해 주시면 더 잘 맞출게요.",
    en: "I couldn't quite understand that, so this is a popular Seoul course. Tell me a place or a mood and I'll fit it better.",
    ja: "うまく理解できなかったため、ソウルの定番コースにしました。行きたい場所や雰囲気を教えてください。",
    zh: "没有完全理解您的要求,所以选了首尔的热门路线。告诉我想去的地方或氛围,我会更贴合。",
  },
  hours: {
    ko: "영업시간 정보가 많이 비어 있어서, 그 시간에 문을 여는지는 확인하지 못했어요. 가기 전에 영업시간을 확인해 주세요.",
    en: "Opening hours are missing for many places, so I couldn't check which are open then. Please check the hours before you go.",
    ja: "営業時間の情報が不足しており、その時間に開いているかは確認できませんでした。行く前に営業時間をご確認ください。",
    zh: "很多地点缺少营业时间信息,无法确认那个时间是否营业。出发前请先确认营业时间。",
  },
  access: {
    ko: "휠체어·유모차 이용 정보는 아직 없어서 반영하지 못했어요. 가기 전에 확인해 주세요.",
    en: "There is no wheelchair or stroller access information yet, so it isn't reflected. Please check before you go.",
    ja: "車椅子・ベビーカーの情報はまだないため反映できていません。行く前にご確認ください。",
    zh: "目前没有轮椅/婴儿车通行信息,所以未能体现。出发前请先确认。",
  },
  pet: {
    ko: "반려동물 동반 가능 여부는 아직 몰라서 반영하지 못했어요. 가기 전에 확인해 주세요.",
    en: "I don't know yet which places allow pets, so it isn't reflected. Please check before you go.",
    ja: "ペット同伴の可否はまだ分からず反映できていません。行く前にご確認ください。",
    zh: "目前还不知道哪些地点可以带宠物,所以未能体现。出发前请先确认。",
  },
  budget: {
    ko: "가격 정보가 부족해서 예산은 반영하지 못했어요.",
    en: "Price information is limited, so your budget isn't reflected.",
    ja: "価格情報が不足しているため、予算は反映できていません。",
    zh: "价格信息不足,所以未能体现预算。",
  },
};

// Another city or a famous place outside Seoul (the data covers Seoul only).
const OUTSIDE_SEOUL = /(부산|해운대|광안리|감천|대구|인천|대전|울산|제주|한라산|성산일출봉|협재|경주|불국사|전주|강릉|속초|설악산|양양|여수|통영|남해|거제|수원|화성행궁|춘천|남이섬|가평|에버랜드|용인|파주|대부도|안동|포항|목포|순천|busan|jeju|incheon|daegu|gyeongju|jeonju|gangneung|sokcho|suwon|釜山|済州|济州|仁川|慶州|庆州)/i;
const HOURS_CONDITION = /(새벽|심야|한밤중|자정|24\s*시|늦은 밤|after midnight|late[- ]night|midnight|深夜|真夜中|凌晨)/i;
const ACCESS_CONDITION = /(휠체어|유모차|거동|무장애|계단 없|wheelchair|stroller|accessib|step-free|barrier-free|車椅子|ベビーカー|轮椅|婴儿车)/i;
const PET_CONDITION = /(강아지|반려견|반려동물|애견|댕댕|고양이|\bdogs?\b|\bpets?\b|puppy|ペット|犬連れ|宠物|带狗)/i;
const BUDGET_CONDITION = /(예산|가성비|저렴|싸게|무료로만|\d+\s*만\s*원|\d{4,6}\s*원|\bbudget\b|\bcheap\b|予算|预算)/i;
// No word in any script of two letters or more (only consonants like "ㅁㄴㅇㄹ", or one stray letter).
const READABLE_WORD = /[가-힣A-Za-z\u3040-\u30ff\u4e00-\u9fff]{2,}/;

function requestNotices(prompt: string, locale: string, namesSeoulArea: boolean): { tags: string[]; texts: string[] } {
  const tags: string[] = [];
  if (!READABLE_WORD.test(prompt)) {
    tags.push("unclear");
  }
  if (OUTSIDE_SEOUL.test(prompt) && !namesSeoulArea && !/서울|seoul|ソウル|首尔/i.test(prompt)) {
    tags.push("outside");
  }
  if (HOURS_CONDITION.test(prompt)) tags.push("hours");
  if (ACCESS_CONDITION.test(prompt)) tags.push("access");
  if (PET_CONDITION.test(prompt)) tags.push("pet");
  if (BUDGET_CONDITION.test(prompt)) tags.push("budget");
  return { tags, texts: tags.map((tag) => NOTICE_TEXT[tag][locale] ?? NOTICE_TEXT[tag].en) };
}

// Without a limit in the sentence, a course is kept to about six hours of visits and walking (a whole day when the sentence asks
// for one, or when it names how many stops it wants); five long stops with a meal could otherwise run past eight hours.
const DEFAULT_MAX_MINUTES = 360;
const FULL_DAY_MAX_MINUTES = 540;
const FULL_DAY_WORDS = /(하루|종일|full[- ]day|all[- ]day|whole day|一日|丸一日|一整天|全天)/i;
const STOP_COUNT_WORDS = /(\d+\s*(곳|군데|개|places|stops|spots|か所|个地点))/i;

// One row in the log sheet per recommendation (see log-sheet.ts): what was typed, what the app read from it, what it gave.
function logRecommendation(input: {
  prompt: string;
  locale: string;
  aiIntent: GeminiAiIntent | null;
  intent: RecommendIntent;
  focus: string;
  maxMinutes: number | null;
  meetingNames: string[] | null;
  placeIds: string[];
  unmet: string[];
}) {
  after(() =>
    logToSheet({
      kind: "recommend",
      locale: input.locale,
      prompt: input.prompt,
      model: input.aiIntent ? INTENT_MODEL : "",
      usedAI: Boolean(input.aiIntent),
      intent: {
        focus: input.focus,
        area: input.intent.areaFilter ?? null,
        count: input.intent.placeCount,
        startTime: input.intent.startTime ?? null,
        pace: input.intent.pace ?? null,
        indoorOnly: input.intent.indoorOnly ?? false,
        outdoorOnly: input.intent.outdoorOnly ?? false,
        maxMinutes: input.maxMinutes,
        meeting: input.meetingNames,
        attributes: input.intent.attributes,
      },
      placeIds: input.placeIds,
      unmet: input.unmet,
    }),
  );
}

function formatHours(minutes: number, locale: string): string {
  const hours = minutes / 60;
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return locale === "ko" ? `${text}시간` : locale === "ja" ? `${text}時間` : locale === "zh" ? `${text}小时` : `${text} h`;
}

// A limit on the whole course ("4시간 이내") is checked on the finished course, not only asked for: stops go one at a time,
// the least known first (the later one on a tie), until visits plus travel fit, but never below two stops.
function trimToMinutes(ids: string[], maxMinutes: number): string[] {
  const kept = [...ids];
  while (kept.length > 2) {
    const stops = getPlacesByIds(kept);
    if (stops.length !== kept.length || getTotalMinutes(stops) <= maxMinutes) {
      break;
    }
    let drop = 0;
    let lowest = Infinity;
    stops.forEach((place, index) => {
      const fame = place.fameScore ?? 50;
      if (fame <= lowest) {
        lowest = fame;
        drop = index;
      }
    });
    kept.splice(drop, 1);
  }
  return kept;
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

  const oneOf = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;

  return {
    variety: oneOf(aiIntent.variety, ["focused", "mixed"] as const),
    pace: oneOf(aiIntent.pace, ["relaxed", "balanced", "packed"] as const),
    startTime: oneOf(aiIntent.startTime, ["morning", "afternoon", "evening", "night"] as const),
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
  // How long each step took (logged once at the end, see below): the steps run one after another, so this shows where the wait is.
  const startedAt = Date.now();
  const stages: Record<string, number> = {};
  const timed = async <T,>(label: string, work: Promise<T>): Promise<T> => {
    const from = Date.now();
    try {
      return await work;
    } finally {
      stages[label] = (stages[label] ?? 0) + (Date.now() - from);
    }
  };

  let prompt = "";
  let locale = "en";
  let anchor: { lat: number; lng: number } | null = null;
  let radiusKm: number | undefined;
  let bookmarkedPlaceIds: string[] = [];
  // Asked again only because the radius was stepped: the same sentence, so it is not logged a second time.
  let radiusStep = false;

  try {
    const body = await request.json();
    radiusStep = body?.radiusStep === true;
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

  let promptAreaMatch = detectAreaFromPrompt(prompt);
  const genericLandmarkIntent = isGenericLandmarkPrompt(prompt);
  const hangangIntent = isHangangPrompt(prompt);
  // The weather lookup does not depend on the intent read, so it runs beside it (it used to wait for it, about 0.7 s).
  const rainCheck = checkIsRaining(anchor ?? SEOUL_FALLBACK_COORD);
  const aiIntent = await timed("intent", getAiIntentCached(prompt, locale));
  if (aiIntent && typeof aiIntent.area === "string" && !promptNamesDistrict(prompt, aiIntent.area)) {
    aiIntent.area = null;
  }

  // A place the sentence names (a station, a neighbourhood, a landmark) is what the course is built around: it is
  // looked up on the map, and wins over a district (it is the more exact of the two). Our own short list of famous
  // spots is only the fallback for when the lookup finds nothing.
  const meeting = hangangIntent ? null : await timed("meeting", resolveMeetingPoint(aiIntent, prompt));
  const namedPlace = meeting ? "" : (typeof aiIntent?.place === "string" ? aiIntent.place.trim() : "") || stationFromPrompt(prompt) || "";
  const resolvedPlace = namedPlace && !hangangIntent ? await timed("placeLookup", resolvePlaceAnchor(namedPlace)) : null;
  const promptLandmarkAnchor = meeting
    ? meeting.center
    : resolvedPlace
      ? { lat: resolvedPlace.lat, lng: resolvedPlace.lng }
      : detectLandmarkAnchorFromPrompt(prompt);
  if (resolvedPlace || meeting) {
    promptAreaMatch = null;
    if (aiIntent) {
      aiIntent.area = null;
    }
  }
  // (Only a Seoul district named in the sentence counts as naming Seoul: a map lookup of "해운대" must not.)
  const notices = requestNotices(prompt, locale, Boolean(promptAreaMatch));
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
  Object.assign(intent, indoorChoice(prompt, aiIntent));

  // A limit on the whole course ("4시간 이내"): fewer stops are asked for from the start (about 70 minutes each with the
  // walk between), and the finished course is cut to fit below, because a meal and a café are woven in after the pick.
  const maxMinutes = maxMinutesFromPrompt(prompt) ?? (typeof aiIntent?.maxMinutes === "number" && aiIntent.maxMinutes >= 60 && aiIntent.maxMinutes <= 1440 ? Math.round(aiIntent.maxMinutes) : null);
  if (maxMinutes) {
    intent.placeCount = Math.min(intent.placeCount, Math.max(2, Math.floor(maxMinutes / 70)));
  }

  // Only nudge toward indoor places when the user hasn't already told us what they want —
  // an explicit "실외" ask (e.g. "한강 산책") should win over the weather, not get overruled.
  let weatherNote: string | null = null;
  if (!intent.attributes.includes("실내") && !intent.attributes.includes("실외")) {
    const isRaining = await timed("weather", rainCheck);
    if (isRaining) {
      intent.preferredTags = [...new Set([...(intent.preferredTags ?? []), "실내"])];
      weatherNote = WEATHER_INDOOR_NOTE[locale] ?? WEATHER_INDOOR_NOTE.en;
    }
  }

  // An eating course ("성수동 맛집 카페 투어") is built from dining spots from the start. The AI
  // read decides; the phrase list is only the fallback when that read failed.
  const focus =
    aiIntent?.focus === "dining" || aiIntent?.focus === "mixed" || aiIntent?.focus === "sights"
      ? aiIntent.focus
      : STRONG_FOOD_PATTERN.test(prompt)
        ? "dining"
        : "sights";
  let diningUnavailableNote: string | null = null;
  if (focus === "dining") {
    const dining = await timed("diningCourse", buildDiningCourse({
      prompt,
      locale,
      placeCount: intent.placeCount,
      areaFilter: intent.areaFilter ?? null,
      anchor: intent.anchor ?? null,
      radiusKm,
    }));
    if (dining) {
      console.log(`[recommend] ${Date.now() - startedAt}ms total, steps: ${JSON.stringify(stages)}`);
      if (!radiusStep) {
        logRecommendation({ prompt, locale, aiIntent, intent, focus, maxMinutes, meetingNames: meeting?.names ?? null, placeIds: dining.placeIds, unmet: notices.tags });
      }
      return NextResponse.json({
        placeIds: dining.placeIds,
        anchor: dining.anchor,
        areaFilter: intent.areaFilter ?? null,
        reason: dining.reason ?? aiIntent?.reason ?? null,
        title: dining.title,
        usedAI: Boolean(aiIntent),
        usedGeminiSelection: dining.usedGemini,
        model: aiIntent ? INTENT_MODEL : null,
        unmet: notices.tags,
        notices: notices.texts,
      });
    }
    diningUnavailableNote = DINING_UNAVAILABLE_NOTE[locale] ?? DINING_UNAVAILABLE_NOTE.en;
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
  let courseTitle: string | null = null;

  if (result.placeIds.length === result.requestedCount) {
    // The same stretch of the river as the first pass (a second random pick would move the course).
    const { scored, anchor: poolAnchor } = getScoredPool({
      ...intent,
      // The same hub as the first pass: a second pick would put the AI's shortlist somewhere else in the city (and make
      // the anchor reported to the app a different place from the course).
      anchor: intent.anchor ?? (result.anchor ? { lat: result.anchor.lat, lng: result.anchor.lng } : null),
      hubAnchor: result.anchor,
    });
    // `scored` is best-first, so keeping the first of each cluster keeps the best one.
    const kept: MobilePlace[] = [];
    const shortlist = scored.filter(({ place }) => {
      if (kept.some((other) => isSameSpot(other, place))) return false;
      kept.push(place);
      return true;
    });

    if (shortlist.length >= result.requestedCount) {
      const byId = new Map(shortlist.map(({ place }) => [place.id, place]));
      const top = shortlist.slice(0, SELECTION_SHORTLIST_SIZE);
      const discoveries = shortlist
        .slice(SELECTION_SHORTLIST_SIZE)
        .filter(({ place }) => (place.fameScore ?? 50) <= DISCOVERY_MAX_FAME)
        .slice(0, SELECTION_DISCOVERY_SIZE);
      const candidates: SelectionCandidate[] = [...top, ...discoveries].map(({ place }) => toSelectionCandidate(place, poolAnchor));

      const selection = await timed("selection", selectChainWithGemini(prompt, locale, candidates, result.requestedCount, {
        variety: intent.variety,
        pace: intent.pace,
        startTime: intent.startTime,
      }));
      if (selection) {
        const selectedPlaces = selection.placeIds
          .map((id) => byId.get(id))
          .filter((place): place is MobilePlace => Boolean(place));
        // A course is a day in one neighbourhood: a pick that spreads wider than a walk-and-short-ride (the model
        // cannot see the map) is dropped and the engine's own pick stays.
        const span = Math.max(...selectedPlaces.flatMap((a) => selectedPlaces.map((b) => haversineKm(a, b))));
        const spanLimit = intent.areaFilter ? MAX_COURSE_SPAN_KM_AREA : intent.pace === "packed" ? 6 : intent.pace === "relaxed" ? 3.5 : MAX_COURSE_SPAN_KM;
        if (selectedPlaces.length === result.requestedCount && span <= Math.max(spanLimit, (intent.radiusKm ?? 0) * 2)) {
          finalPlaceIds = optimizeRoute(selectedPlaces).map((place) => place.id);
          selectionReason = selection.reason;
          courseTitle = selection.title;
        }
      }
    }
  }

  // A sights course that also asks for meals or cafés ("전시 보고 점심 먹고 카페 가는 코스"):
  // weave dining in with the same editor used for "카페 하나 더 추가해줘".
  // The editor's own note ("replaced X with Y to match the request") talks about stops the person never saw, so it is never used as
  // the introduction: a woven-in course gets a fresh introduction written from its final stops.
  let mixedWoven = false;
  if (focus === "mixed") {
    const refined = await timed("mixedEdit", refineCourseCore({ instruction: prompt.slice(0, 200), stopIds: finalPlaceIds, pinnedIds: [], locale, indoorOnly: intent.indoorOnly, outdoorOnly: intent.outdoorOnly }));
    if (refined.ok) {
      finalPlaceIds = optimizeRoutePreservingPins(getPlacesByIds(refined.ids), new Set(), false).map((place) => place.id);
      mixedWoven = true;
    }
  }

  // The default course is a day out, not only sights: add a nearby meal and café unless the
  // request is about something specific that rules them out.
  let wovenNote: string | null = null;
  if (focus === "sights" && !NO_DINING_PATTERN.test(prompt)) {
    const woven = await timed("weave", weaveDefaultDining(finalPlaceIds));
    if (woven) {
      // The meal and café went in by their own rules (near the stop they follow); put the sights back in the
      // shortest order around them, meals keeping their place in the day.
      finalPlaceIds = optimizeRoutePreservingPins(getPlacesByIds(woven), new Set(), false).map((place) => place.id);
      wovenNote = DINING_WOVEN_NOTE[locale] ?? DINING_WOVEN_NOTE.en;
    }
  }

  // The time limit: the course is cut to fit before the review looks at it (so the review and the introduction see the final stops),
  // and checked again after the review, because a swap can change the length.
  const unmet: string[] = [...notices.tags];
  let timeFitNote: string | null = null;
  let meetingNote: string | null = null;
  let reviewChanged = mixedWoven;
  const timeCap = maxMinutes ?? (STOP_COUNT_WORDS.test(prompt) ? null : FULL_DAY_WORDS.test(prompt) ? FULL_DAY_MAX_MINUTES : DEFAULT_MAX_MINUTES);
  const fitTime = () => {
    if (!timeCap || focus === "dining") {
      return;
    }
    const fitted = trimToMinutes(finalPlaceIds, timeCap);
    if (fitted.length < finalPlaceIds.length) {
      finalPlaceIds = fitted;
      reviewChanged = true;
      // The note about the woven-in meal and café is only true while one of them is still in the course.
      if (!getPlacesByIds(finalPlaceIds).some((place) => isDiningCategory(place.category))) {
        wovenNote = null;
      }
    }
  };
  fitTime();

  // The introduction is written again from the final stops when the course was changed after the pick step (woven-in meals, a cut
  // to fit the time, a review swap: the first one was written for other stops), and when the pick step gave none of its own (then
  // it would be the general line of the request read, which says nothing about this course).
  const shownLocale: Locale = (SUPPORTED_LOCALES as string[]).includes(locale) ? (locale as Locale) : "en";
  const writeIntroduction = (ids: string[]) =>
    timed(
      "describe",
      describeCourseWithGemini({
        stops: getPlacesByIds(ids).map((place) => {
          const shown = localizePlace(place, shownLocale);
          return { name: shown.name, category: place.category, area: shown.area };
        }),
        prompt,
        locale,
      }),
    );
  // When it is already certain that it has to be written, it starts now and runs beside the review (about a second saved); if the
  // review then changes the stops (rare), it is written again for them.
  const early =
    focus !== "dining" && (reviewChanged || !selectionReason)
      ? { key: finalPlaceIds.join(","), text: writeIntroduction(finalPlaceIds).catch(() => null) }
      : null;

  // The review: the finished course is looked at as a person planning a day would (does it double back, is one stop far
  // from the rest, are two stops the same kind of thing) and, when a stop is clearly out of place, swapped for a
  // nearby alternative; every swap is checked (see course-critic.ts).
  let reviewSwaps = 0;
  if (focus !== "dining" && finalPlaceIds.length >= 4) {
    const stops = getPlacesByIds(finalPlaceIds);
    if (stops.length === finalPlaceIds.length) {
      const pool = getScoredPool({
        ...intent,
        anchor: intent.anchor ?? (result.anchor ? { lat: result.anchor.lat, lng: result.anchor.lng } : null),
        hubAnchor: result.anchor,
      }).scored.map(({ place }) => place);
      const alternatives = pickAlternatives(stops, pool, getLoadedDiningPlaces());
      const review = await timed("review", reviewCourseWithGemini({ prompt, locale, stops, alternatives }));
      const fixed = review && (review.swaps.length > 0 || review.order.length > 0) ? applyReview(stops, alternatives, review) : null;
      console.log(`[recommend] review: ${review ? `${review.swaps.length} swap(s), order ${review.order.length ? "asked" : "kept"}: ${fixed ? "applied" : "nothing applied"}` : "no answer"}${review?.summary ? ` — ${review.summary}` : ""}`);
      if (fixed) {
        finalPlaceIds = fixed.map((place) => place.id);
        reviewChanged = true;
        reviewSwaps = Math.max(1, review?.swaps.length ?? 0);
      }
    }
  }
  fitTime();

  // Only a limit the sentence stated gets a note (and counts as unmet); the default cap just keeps the course a sensible length.
  if (maxMinutes && focus !== "dining") {
    if (getTotalMinutes(getPlacesByIds(finalPlaceIds)) <= maxMinutes) {
      timeFitNote = (TIME_FIT_NOTE[locale] ?? TIME_FIT_NOTE.en)(formatHours(maxMinutes, locale), finalPlaceIds.length);
    } else {
      unmet.push("time");
      timeFitNote = (TIME_MISS_NOTE[locale] ?? TIME_MISS_NOTE.en)(formatHours(maxMinutes, locale), finalPlaceIds.length);
    }
  }
  if (result.placeIds.length < result.requestedCount) {
    unmet.push("fewer");
  }
  if (!meeting && (aiIntent?.meetingPoints?.filter((name) => typeof name === "string").length ?? 0) >= 2) {
    unmet.push("meeting");
    meetingNote = MEETING_MISS_NOTE[locale] ?? MEETING_MISS_NOTE.en;
  }
  if (meeting) {
    const middle = [...getScoredPool({ ...intent, anchor: meeting.center, areaFilter: null }).scored]
      .map(({ place }) => place)
      .sort((a, b) => haversineKm(meeting.center, a) - haversineKm(meeting.center, b))[0];
    const area = localizeDistrictName(middle?.area ?? null, locale);
    if (area) {
      meetingNote = (MEETING_NOTE[locale] ?? MEETING_NOTE.en)(meeting.names.join(", "), area);
    }
  }

  let freshReason: string | null = null;
  if (focus !== "dining" && (reviewChanged || !selectionReason)) {
    freshReason = early && early.key === finalPlaceIds.join(",") ? await early.text : await writeIntroduction(finalPlaceIds);
  }
  const introduction = reviewChanged ? freshReason : (selectionReason ?? freshReason ?? aiIntent?.reason);

  console.log(`[recommend] ${Date.now() - startedAt}ms total, steps: ${JSON.stringify(stages)}`);
  if (!radiusStep) {
    logRecommendation({ prompt, locale, aiIntent, intent, focus, maxMinutes, meetingNames: meeting?.names ?? null, placeIds: finalPlaceIds, unmet });
  }
  return NextResponse.json({
    placeIds: finalPlaceIds,
    anchor: result.anchor,
    areaFilter: intent.areaFilter ?? null,
    reviewSwaps,
    reason:
      [introduction, meetingNote, timeFitNote, wovenNote, weatherNote, maxShownNote, diningUnavailableNote]
        .filter(Boolean)
        .join(" ") || null,
    title: courseTitle,
    usedAI: Boolean(aiIntent),
    usedGeminiSelection: Boolean(selectionReason),
    model: aiIntent ? INTENT_MODEL : null,
    unmet,
    notices: notices.texts,
  });
}
