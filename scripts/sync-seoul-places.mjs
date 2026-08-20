// One-off/refreshable sync: pulls real Seoul POIs from TourAPI (attractions, culture
// facilities, festivals) and the national heritage open API, normalizes them into the
// app's MobilePlace shape, and writes src/features/mobile/seoul-places.json.
//
// Run with: node scripts/sync-seoul-places.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  const raw = readFileSync(envPath, "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
// .env.local stores the portal's already-URL-encoded key; decode it back to raw so
// URLSearchParams (which encodes once) doesn't double-encode it.
const TOURAPI_SERVICE_KEY = env.TOURAPI_SERVICE_KEY ? decodeURIComponent(env.TOURAPI_SERVICE_KEY) : undefined;
const TOURAPI_ENDPOINT = env.TOURAPI_ENDPOINT ?? "https://apis.data.go.kr/B551011/KorService2";
const HERITAGE_ENDPOINT = env.HERITAGE_API_ENDPOINT ?? "http://www.khs.go.kr/cha";
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-flash-lite-latest";

if (!TOURAPI_SERVICE_KEY) {
  console.error("TOURAPI_SERVICE_KEY missing from .env.local");
  process.exit(1);
}

const SEOUL_AREA_CODE = "1";
const TARGETS = {
  attraction: { contentTypeId: "12", take: 70, category: "관광지" },
  culture: { contentTypeId: "14", take: 70, category: "문화시설" },
  festival: { contentTypeId: "15", take: 40, category: "축제행사" },
};
const HERITAGE_KDCDS = [
  { code: "11", take: 60 }, // 국보
  { code: "13", take: 60 }, // 사적
];

async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// TourAPI throttles per-second request rate hard enough that our own concurrency
// trips it (errMsg LIMITED_NUMBER_OF_SERVICE_REQUESTS_PER_SECOND_EXCEEDS_ERROR) —
// back off and retry a few times instead of silently losing the item's detail data.
async function fetchJson(url, attempt = 1) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const data = await response.json();
  const errMsg = data?.OpenAPI_ServiceResponse?.cmmMsgHeader?.errMsg;
  if (errMsg && attempt <= 5) {
    await sleep(400 * attempt);
    return fetchJson(url, attempt + 1);
  }
  return data;
}

async function fetchXmlText(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  return response.text();
}

function xmlTag(xml, tag) {
  const block = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  if (!block) return "";
  // Heritage API wraps some values in a CDATA section with arbitrary surrounding
  // whitespace/newlines, so pull the CDATA content out explicitly rather than
  // assuming it sits directly after the opening tag.
  const cdata = block[1].match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  return (cdata ? cdata[1] : block[1]).trim();
}

function xmlBlocks(xml, tag) {
  const blocks = [];
  const re = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, "g");
  let match;
  while ((match = re.exec(xml))) {
    blocks.push(match[1]);
  }
  return blocks;
}

function stripHtml(value) {
  return value
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractDistrict(address) {
  const match = address.match(/([가-힣]+구)/);
  return match ? match[1] : "서울";
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function seededSavedBy(id) {
  return 30 + (hashString(id) % 1400);
}

// --- TourAPI (attractions / culture facilities / festivals) ---

async function fetchTourList(contentTypeId, take, extraParams = {}) {
  const isFestival = contentTypeId === "15";
  const params = new URLSearchParams({
    serviceKey: TOURAPI_SERVICE_KEY,
    MobileOS: "ETC",
    MobileApp: "TripChain",
    _type: "json",
    areaCode: SEOUL_AREA_CODE,
    ...(isFestival ? {} : { contentTypeId }),
    numOfRows: String(take),
    pageNo: "1",
    ...extraParams,
  });

  const listUrl = isFestival
    ? `${TOURAPI_ENDPOINT}/searchFestival2?${params}`
    : `${TOURAPI_ENDPOINT}/areaBasedList2?${params}`;

  const data = await fetchJson(listUrl);
  const items = data?.response?.body?.items?.item ?? [];
  return Array.isArray(items) ? items : [items];
}

async function fetchTourDetail(contentId, contentTypeId) {
  // detailCommon2 rejects the documented *YN flag params outright (INVALID_REQUEST_PARAMETER_ERROR) —
  // it returns overview and all common fields by default with just contentId.
  const commonParams = new URLSearchParams({
    serviceKey: TOURAPI_SERVICE_KEY,
    MobileOS: "ETC",
    MobileApp: "TripChain",
    _type: "json",
    contentId,
  });
  const introParams = new URLSearchParams({
    serviceKey: TOURAPI_SERVICE_KEY,
    MobileOS: "ETC",
    MobileApp: "TripChain",
    _type: "json",
    contentId,
    contentTypeId,
  });

  const [commonData, introData] = await Promise.all([
    fetchJson(`${TOURAPI_ENDPOINT}/detailCommon2?${commonParams}`).catch(() => null),
    fetchJson(`${TOURAPI_ENDPOINT}/detailIntro2?${introParams}`).catch(() => null),
  ]);

  const common = commonData?.response?.body?.items?.item;
  const commonItem = Array.isArray(common) ? common[0] : common;
  const intro = introData?.response?.body?.items?.item;
  const introItem = Array.isArray(intro) ? intro[0] : intro;

  return { commonItem, introItem };
}

function feeFromIntro(introItem, contentTypeId) {
  if (!introItem) return "정보 없음";
  const raw =
    contentTypeId === "14"
      ? introItem.usefee
      : contentTypeId === "15"
        ? introItem.usetimefestival
        : introItem.usefee;
  if (!raw) return "정보 없음";
  const text = stripHtml(String(raw));
  if (!text) return "정보 없음";
  return /무료/.test(text) ? "무료" : text.slice(0, 40);
}

function hoursFromIntro(introItem, contentTypeId, item) {
  if (contentTypeId === "15") {
    const start = item.eventstartdate;
    const end = item.eventenddate;
    if (start && end) {
      const fmt = (value) => `${value.slice(0, 4)}.${value.slice(4, 6)}.${value.slice(6, 8)}`;
      return `${fmt(start)} - ${fmt(end)}`;
    }
    return "정보 없음";
  }

  const raw = contentTypeId === "14" ? introItem?.usetimeculture : introItem?.usetime;
  if (!raw) return "정보 없음";
  const text = stripHtml(String(raw));
  return text || "정보 없음";
}

// TourAPI's eventStartDate param only bounds the start of the search window, not
// whether a festival's own run has already ended — without this, syncing on any day
// after a festival's last day keeps re-pulling an event nobody can still attend.
function isPastEventEndDate(value) {
  if (!value || value.length < 8) return false;
  const end = new Date(Number(value.slice(0, 4)), Number(value.slice(4, 6)) - 1, Number(value.slice(6, 8)));
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return end < todayMidnight;
}

async function buildTourPlaces(kind, { contentTypeId, take, category }) {
  const extraParams = kind === "festival" ? { eventStartDate: "20250101" } : {};
  const list = await fetchTourList(contentTypeId, take, extraParams);
  const withCoords = list
    .filter((item) => item.mapx && item.mapy && item.title)
    .filter((item) => kind !== "festival" || !isPastEventEndDate(item.eventenddate));

  const detailed = await pool(withCoords, 3, async (item) => {
    const { commonItem, introItem } = await fetchTourDetail(item.contentid, contentTypeId);
    const overview = commonItem?.overview ? stripHtml(commonItem.overview) : "";
    const address = [item.addr1, item.addr2].filter(Boolean).join(" ").trim();

    return {
      id: `tour-${item.contentid}`,
      name: item.title,
      category,
      area: extractDistrict(address || "서울"),
      address: address || "주소 정보 없음",
      description: overview.slice(0, 320) || `서울 ${category} — 상세 설명은 준비 중입니다.`,
      duration: category === "축제행사" ? "90분" : category === "문화시설" ? "60분" : "50분",
      fee: feeFromIntro(introItem, contentTypeId),
      tags: [category === "문화시설" ? "실내" : "실외", ...(category === "축제행사" ? ["체험형"] : [])],
      hours: hoursFromIntro(introItem, contentTypeId, item),
      savedBy: seededSavedBy(`tour-${item.contentid}`),
      lat: Number.parseFloat(item.mapy),
      lng: Number.parseFloat(item.mapx),
      image: item.firstimage || undefined,
    };
  });

  return detailed;
}

// --- Heritage (문화재청/국가유산청) ---

async function fetchHeritageList(kdcd, take) {
  const params = new URLSearchParams({
    ccbaCtcd: "11",
    ccbaKdcd: kdcd,
    pageUnit: String(take),
    pageIndex: "1",
  });
  const xml = await fetchXmlText(`${HERITAGE_ENDPOINT}/SearchKindOpenapiList.do?${params}`);
  return xmlBlocks(xml, "item").map((block) => ({
    ccmaName: xmlTag(block, "ccmaName"),
    ccbaMnm1: xmlTag(block, "ccbaMnm1"),
    ccbaCtcd: xmlTag(block, "ccbaCtcd"),
    ccbaKdcd: xmlTag(block, "ccbaKdcd"),
    ccbaAsno: xmlTag(block, "ccbaAsno"),
    ccsiName: xmlTag(block, "ccsiName"),
    longitude: xmlTag(block, "longitude"),
    latitude: xmlTag(block, "latitude"),
  }));
}

async function fetchHeritageDetail(entry) {
  const params = new URLSearchParams({
    ccbaKdcd: entry.ccbaKdcd,
    ccbaAsno: entry.ccbaAsno,
    ccbaCtcd: entry.ccbaCtcd,
  });
  const xml = await fetchXmlText(`${HERITAGE_ENDPOINT}/SearchKindOpenapiDt.do?${params}`);
  return {
    address: stripHtml(xmlTag(xml, "ccbaLcad")),
    content: stripHtml(xmlTag(xml, "content")),
    era: xmlTag(xml, "ccceName"),
    imageUrl: xmlTag(xml, "imageUrl"),
  };
}

async function buildHeritagePlaces() {
  const lists = await Promise.all(HERITAGE_KDCDS.map(({ code, take }) => fetchHeritageList(code, take)));
  const entries = lists.flat().filter((entry) => entry.latitude && entry.longitude && entry.ccbaMnm1);

  const detailed = await pool(entries, 8, async (entry) => {
    const detail = await fetchHeritageDetail(entry).catch(() => null);
    const address = detail?.address || `서울 ${entry.ccsiName}`;
    const description = detail?.content?.slice(0, 320) || `${entry.ccmaName} 지정 문화유산입니다.`;
    const id = `heritage-${entry.ccbaKdcd}-${entry.ccbaAsno}`;

    return {
      id,
      name: entry.ccbaMnm1,
      category: "문화재",
      area: entry.ccsiName || "서울",
      address,
      description,
      duration: "40분",
      fee: "무료",
      tags: ["실외", "역사탐방", entry.ccmaName].filter(Boolean),
      hours: "상시 개방",
      savedBy: seededSavedBy(id),
      lat: Number.parseFloat(entry.latitude),
      lng: Number.parseFloat(entry.longitude),
      image: detail?.imageUrl || undefined,
    };
  });

  return detailed;
}

// --- Gemini translation (en/ja/zh) ---
//
// TourAPI's parallel-language services (EngService2 etc.) and the heritage API don't
// reliably cover the same content IDs we curated here, so instead of stitching together
// three more external integrations we ask Gemini to translate our already-fetched
// Korean fields directly. Batched (not one call per place) to keep this fast/cheap.

const TRANSLATE_BATCH_SIZE = 8;
const TRANSLATE_LANGS = ["en", "ja", "zh"];

const TRANSLATE_SYSTEM_PROMPT = `You are a professional translator localizing Seoul tourism data for a travel app.
Translate each place's Korean fields into English (en), Japanese (ja), and Simplified Chinese (zh).
Keep proper nouns recognizable (e.g. transliterate or use the commonly known foreign name for palaces, museums, festivals).
Translate the "tags" array item by item, keeping the same number of tags in the same order.
Keep "fee" and "hours" short, matching the original's brevity (e.g. "Free", "Open 24 hours").
Respond only via the provided JSON schema, in the same order as the input list, with matching "id" values.`;

function translateRequestSchema() {
  const localizedFields = {
    type: "OBJECT",
    properties: {
      name: { type: "STRING" },
      description: { type: "STRING" },
      area: { type: "STRING" },
      tags: { type: "ARRAY", items: { type: "STRING" } },
      fee: { type: "STRING" },
      hours: { type: "STRING" },
      duration: { type: "STRING" },
    },
    required: ["name", "description", "area", "tags", "fee", "hours", "duration"],
  };

  return {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING" },
            en: localizedFields,
            ja: localizedFields,
            zh: localizedFields,
          },
          required: ["id", "en", "ja", "zh"],
        },
      },
    },
    required: ["items"],
  };
}

async function translateBatch(batch, attempt = 1) {
  const input = batch.map((place) => ({
    id: place.id,
    name: place.name,
    description: place.description,
    area: place.area,
    tags: place.tags,
    fee: place.fee,
    hours: place.hours,
    duration: place.duration,
  }));

  const body = {
    contents: [{ parts: [{ text: JSON.stringify(input) }] }],
    systemInstruction: { parts: [{ text: TRANSLATE_SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: translateRequestSchema(),
    },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  if (response.status === 429 && attempt <= 4) {
    await sleep(1000 * attempt);
    return translateBatch(batch, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Gemini translate failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini translate: no text in response");
  }

  const parsed = JSON.parse(text);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function translatePlaces(placesList) {
  if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY missing from .env.local — skipping place translation (en/ja/zh).");
    return placesList;
  }

  const batches = [];
  for (let i = 0; i < placesList.length; i += TRANSLATE_BATCH_SIZE) {
    batches.push(placesList.slice(i, i + TRANSLATE_BATCH_SIZE));
  }

  console.log(`Translating ${placesList.length} places via Gemini in ${batches.length} batches...`);

  const byId = new Map(placesList.map((place) => [place.id, place]));
  let done = 0;

  await pool(batches, 3, async (batch) => {
    let results;
    try {
      results = await translateBatch(batch);
    } catch (error) {
      console.warn(`  batch failed (${batch.length} places), leaving untranslated:`, error.message);
      done += batch.length;
      return;
    }

    for (const item of results) {
      const place = byId.get(item.id);
      if (!place) continue;
      const translations = {};
      for (const lang of TRANSLATE_LANGS) {
        if (item[lang]) translations[lang] = item[lang];
      }
      place.translations = translations;
    }

    done += batch.length;
    console.log(`  translated ${done}/${placesList.length}`);
  });

  return placesList;
}

async function main() {
  console.log("Fetching TourAPI attractions / culture facilities / festivals...");
  // Sequential, not Promise.all: TourAPI's per-second rate limit is tight enough that
  // three categories' worth of concurrent detail calls trip it even with retries.
  const attractions = await buildTourPlaces("attraction", TARGETS.attraction);
  const culture = await buildTourPlaces("culture", TARGETS.culture);
  const festivals = await buildTourPlaces("festival", TARGETS.festival);

  console.log("Fetching heritage sites...");
  const heritage = await buildHeritagePlaces();

  const all = [...heritage, ...attractions, ...culture, ...festivals];
  const seen = new Set();
  const deduped = all.filter((place) => {
    if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return false;
    if (seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });

  await translatePlaces(deduped);

  const outPath = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
  writeFileSync(outPath, JSON.stringify(deduped, null, 2), "utf8");

  console.log(`Wrote ${deduped.length} places to ${path.relative(ROOT, outPath)}`);
  console.log(
    Object.entries(
      deduped.reduce((acc, place) => {
        acc[place.category] = (acc[place.category] ?? 0) + 1;
        return acc;
      }, {}),
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
