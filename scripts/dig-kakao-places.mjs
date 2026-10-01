// One-off/refreshable: digs up real Seoul attractions via the Kakao Local API (keyword
// search) that TourAPI's sync never pulled — the Han River's actual park branches
// (반포/뚝섬/여의도/잠실/이촌/망원/...), and well-known neighborhoods like 이태원/북촌/홍대
// that TourAPI's "관광지" category pull (capped at 70, Seoul-wide) didn't surface. Kakao
// gives name/address/coordinates/category but no description, fee, or hours — those are
// synthesized via Gemini (description + en/ja/zh translations) the same way
// sync-seoul-places.mjs does for TourAPI data. Every place this script adds gets
// `source: "kakao"` so it stays distinguishable from the TourAPI/heritage-sourced rows
// (whose ids are already prefixed tour-/heritage-, but the field makes it explicit and
// queryable without parsing ids).
//
// Needs KAKAO_REST_API_KEY in .env.local — a different key type than
// NEXT_PUBLIC_KAKAO_MAP_APP_KEY (see .env.example). Run with:
//   node scripts/dig-kakao-places.mjs

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
const KAKAO_REST_API_KEY = env.KAKAO_REST_API_KEY;
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-flash-lite-latest";

if (!KAKAO_REST_API_KEY) {
  console.error("KAKAO_REST_API_KEY missing from .env.local");
  process.exit(1);
}

// Real Han River park branches plus well-known neighborhoods/streets that this app's
// LANDMARK_ANCHORS table (src/app/api/recommend/route.ts) currently has to fake with a
// single hand-picked coordinate because no actual dataset entry exists for them.
const KEYWORDS = [
  "한강공원",
  "노들섬",
  "이태원",
  "북촌한옥마을",
  "홍대",
  "명동",
  "압구정로데오",
  "가로수길",
  "성수동",
  "여의도",
  "잠실",
  "삼청동",
  "인사동",
  "서울숲",
  "청계천",
  "남산",
  "북한산",
  "동대문",
  "익선동",
  "경리단길",
  "을지로",
];

// Kakao's category_group_code taxonomy is much broader than ours (includes 음식점/카페/
// 병원/...) — restrict to the two that map onto a real "체인 stop": 관광명소 and
// 문화시설. Everything else (restaurants, parking, subway stations, ...) gets skipped.
// Several genuinely tourism-relevant results (e.g. every 한강공원 branch) come back with
// an EMPTY category_group_code — group code just isn't populated for them — but a
// category_name starting with "여행" (its top-level bucket for travel/park/scenic-spot
// entries), so those are accepted too and defaulted to 관광지.
const CATEGORY_MAP = { AT4: "관광지", CT1: "문화시설" };

function mapCategory(doc) {
  if (CATEGORY_MAP[doc.category_group_code]) return CATEGORY_MAP[doc.category_group_code];
  if (doc.category_name?.startsWith("여행")) return "관광지";
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function searchKeyword(keyword) {
  const params = new URLSearchParams({ query: keyword, size: "15", page: "1" });
  const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
  });
  if (!response.ok) {
    throw new Error(`Kakao search failed for "${keyword}": HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.documents ?? [];
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

// Loose enough to catch "경복궁" vs "경복궁(서울)"-style variants already in the dataset,
// without a full fuzzy-match library for what's ultimately a one-off cleanup pass.
function normalizeName(name) {
  return name.replace(/[\s()·]/g, "").toLowerCase();
}

// --- Gemini: description + translations for places Kakao gives no prose for ---

const DESCRIBE_BATCH_SIZE = 10;

const DESCRIBE_SYSTEM_PROMPT = `너는 서울 여행 가이드야. 아래 장소들은 이름/카테고리/주소만 주어져 있고 설명이 없어.
각 장소에 대해, 일반적으로 널리 알려진 사실만 바탕으로 방문객에게 도움이 될 한국어 설명을
2~3문장(약 120자)으로 써줘. 구체적인 운영시간·요금·전화번호처럼 모르는 세부 정보는 절대
지어내지 말고, 그 장소의 성격/분위기/뭘 할 수 있는 곳인지 위주로만 설명해.
그 다음 그 한국어 설명과 이름을 English(en)/日本語(ja)/简体中文(zh)로 번역해.
입력과 같은 순서로, 같은 id를 포함해서 주어진 스키마로만 답해.`;

function describeRequestSchema() {
  const localizedFields = {
    type: "OBJECT",
    properties: { name: { type: "STRING" }, description: { type: "STRING" } },
    required: ["name", "description"],
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
            description: { type: "STRING" },
            en: localizedFields,
            ja: localizedFields,
            zh: localizedFields,
          },
          required: ["id", "description", "en", "ja", "zh"],
        },
      },
    },
    required: ["items"],
  };
}

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

async function describeBatch(batch, attempt = 1) {
  const input = batch.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    address: place.address,
  }));

  const body = {
    contents: [{ parts: [{ text: JSON.stringify(input) }] }],
    systemInstruction: { parts: [{ text: DESCRIBE_SYSTEM_PROMPT }] },
    generationConfig: { responseMimeType: "application/json", responseSchema: describeRequestSchema() },
  };

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );

  if (response.status === 429 && attempt <= 4) {
    await sleep(1000 * attempt);
    return describeBatch(batch, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`Gemini describe failed: HTTP ${response.status}`);
  }
  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini describe: no text in response");
  }
  const parsed = JSON.parse(text);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function describePlaces(newPlaces) {
  if (!GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY missing — new places will have no description/translations.");
    return;
  }

  const batches = [];
  for (let i = 0; i < newPlaces.length; i += DESCRIBE_BATCH_SIZE) {
    batches.push(newPlaces.slice(i, i + DESCRIBE_BATCH_SIZE));
  }

  console.log(`Describing ${newPlaces.length} new places via Gemini in ${batches.length} batches...`);
  const byId = new Map(newPlaces.map((place) => [place.id, place]));
  let done = 0;

  await pool(batches, 3, async (batch) => {
    let results;
    try {
      results = await describeBatch(batch);
    } catch (error) {
      console.warn(`  batch failed (${batch.length} places):`, error.message);
      done += batch.length;
      return;
    }
    for (const item of results) {
      const place = byId.get(item.id);
      if (!place) continue;
      place.description = item.description || `서울 ${place.area}에 있는 ${place.category}입니다.`;
      const translations = {};
      for (const lang of ["en", "ja", "zh"]) {
        if (item[lang]) translations[lang] = item[lang];
      }
      place.translations = translations;
    }
    done += batch.length;
    console.log(`  described ${done}/${newPlaces.length}`);
  });
}

async function main() {
  const dataPath = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
  const places = JSON.parse(readFileSync(dataPath, "utf8"));
  const existingNames = new Set(places.map((place) => normalizeName(place.name)));

  const seen = new Map();
  for (const keyword of KEYWORDS) {
    const docs = await searchKeyword(keyword);
    for (const doc of docs) {
      if (!mapCategory(doc)) continue;
      if (!doc.address_name.startsWith("서울")) continue;
      if (!seen.has(doc.id)) seen.set(doc.id, doc);
    }
    await sleep(150);
  }
  console.log(`Collected ${seen.size} candidate places from Kakao across ${KEYWORDS.length} keywords.`);

  const newCandidates = [...seen.values()].filter((doc) => !existingNames.has(normalizeName(doc.place_name)));
  console.log(`${newCandidates.length} are genuinely new (not already in the dataset by name).`);

  if (newCandidates.length === 0) {
    console.log("Nothing to add.");
    return;
  }

  const newPlaces = newCandidates.map((doc) => {
    const category = mapCategory(doc);
    const id = `kakao-${doc.id}`;
    return {
      id,
      name: doc.place_name,
      category,
      area: extractDistrict(doc.address_name),
      address: doc.road_address_name || doc.address_name,
      description: "",
      duration: category === "문화시설" ? "60분" : "50분",
      fee: "정보 없음",
      tags: [category === "문화시설" ? "실내" : "실외"],
      hours: "정보 없음",
      savedBy: seededSavedBy(id),
      lat: Number.parseFloat(doc.y),
      lng: Number.parseFloat(doc.x),
      source: "kakao",
    };
  });

  await describePlaces(newPlaces);

  const merged = [...places, ...newPlaces];
  writeFileSync(dataPath, JSON.stringify(merged, null, 2), "utf8");
  console.log(`Wrote ${merged.length} places (was ${places.length}, +${newPlaces.length}) to ${path.relative(ROOT, dataPath)}`);
  console.log("New places by area:");
  console.log(
    Object.entries(
      newPlaces.reduce((acc, place) => {
        acc[place.area] = (acc[place.area] ?? 0) + 1;
        return acc;
      }, {}),
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
