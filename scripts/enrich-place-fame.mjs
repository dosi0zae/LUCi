// One-off/refreshable enrichment: asks Gemini to rate how well-known each place in
// seoul-places.json is to an average Seoul visitor (0-100), and writes the result back
// as a new `fameScore` field. Exists because `savedBy` is NOT a real popularity signal —
// it's a deterministic hash of the place id (see sync-seoul-places.mjs's seededSavedBy),
// so it's close to random with respect to actual fame. scorePlace() in
// src/features/mobile/recommend-engine.ts blends fameScore in alongside savedBy, fixing
// prompts with no category/attribute/area to anchor on (e.g. "서울 랜드마크 체인") landing
// on obscure places just because they happened to hash to a high savedBy number.
//
// Run with: node scripts/enrich-place-fame.mjs
// Re-run whenever seoul-places.json is refreshed via sync-seoul-places.mjs.

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
const GEMINI_API_KEY = env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-flash-lite-latest";

if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEY missing from .env.local");
  process.exit(1);
}

const BATCH_SIZE = 25;
const CONCURRENCY = 3;

const SYSTEM_PROMPT = `너는 서울 관광 전문가야. 아래 각 장소가 "서울을 방문하는 일반 관광객" 기준으로
얼마나 잘 알려진/대표적인 곳인지 0~100점으로 매겨.

기준:
- 90~100: 경복궁, 남산, 명동처럼 서울 하면 바로 떠오르는 전국/세계적으로 유명한 랜드마크
- 60~89: 서울 시민이나 여행 준비를 조금만 해도 알 만한, 꽤 알려진 명소
- 30~59: 그 동네 주민이나 특정 분야(역사/미술 등) 애호가 정도만 아는 곳
- 0~29: 일반 관광객은 거의 들어본 적 없는 소규모/지역 시설

이름, 카테고리, 설명을 보고 판단해. 다른 말 없이 주어진 스키마로만 답해, 입력과 같은 순서로
같은 id를 포함해서.`;

function responseSchema() {
  return {
    type: "OBJECT",
    properties: {
      items: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            id: { type: "STRING" },
            fameScore: { type: "NUMBER" },
          },
          required: ["id", "fameScore"],
        },
      },
    },
    required: ["items"],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function scoreBatch(batch, attempt = 1) {
  const input = batch.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    area: place.area,
    tags: place.tags,
    description: place.description.slice(0, 200),
  }));

  const body = {
    contents: [{ parts: [{ text: JSON.stringify(input) }] }],
    systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: responseSchema(),
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
    return scoreBatch(batch, attempt + 1);
  }

  if (!response.ok) {
    throw new Error(`Gemini fame-score failed: HTTP ${response.status}`);
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Gemini fame-score: no text in response");
  }

  const parsed = JSON.parse(text);
  return Array.isArray(parsed.items) ? parsed.items : [];
}

async function main() {
  const dataPath = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
  const places = JSON.parse(readFileSync(dataPath, "utf8"));

  const batches = [];
  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    batches.push(places.slice(i, i + BATCH_SIZE));
  }

  console.log(`Scoring ${places.length} places via Gemini in ${batches.length} batches...`);

  const byId = new Map(places.map((place) => [place.id, place]));
  let done = 0;
  let failedBatches = 0;

  await pool(batches, CONCURRENCY, async (batch) => {
    let results;
    try {
      results = await scoreBatch(batch);
    } catch (error) {
      console.warn(`  batch failed (${batch.length} places):`, error.message);
      failedBatches += 1;
      done += batch.length;
      return;
    }

    for (const item of results) {
      const place = byId.get(item.id);
      if (!place || typeof item.fameScore !== "number") continue;
      place.fameScore = Math.max(0, Math.min(100, Math.round(item.fameScore)));
    }

    done += batch.length;
    console.log(`  scored ${done}/${places.length}`);
  });

  const missing = places.filter((place) => typeof place.fameScore !== "number");
  if (missing.length > 0) {
    console.warn(`${missing.length} places got no fameScore (failed batches) — leaving unset, scorePlace() falls back to savedBy for these.`);
  }

  writeFileSync(dataPath, JSON.stringify(places, null, 2), "utf8");
  console.log(`Wrote fameScore for ${places.length - missing.length}/${places.length} places to ${path.relative(ROOT, dataPath)}`);

  if (failedBatches > 0) {
    console.warn(`${failedBatches} batch(es) failed — re-run this script to retry those places.`);
  }

  const top = [...places]
    .filter((place) => typeof place.fameScore === "number")
    .sort((a, b) => b.fameScore - a.fameScore)
    .slice(0, 10);
  console.log("Top 10 by fameScore:", top.map((place) => `${place.name} (${place.fameScore})`));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
