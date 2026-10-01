// One-off/refreshable: backfills `image` for any place in seoul-places.json that doesn't
// have one (mostly the 165 Kakao-sourced places from dig-kakao-places.mjs, which has no
// image field at all — plus a handful of heritage entries whose detail call returned no
// imageUrl). Without a real `image`, getPlaceImageUrl() (mobile-data.ts) falls back to
// https://picsum.photos/seed/{id}/... — a random, completely unrelated stock photo — which
// is what looked like "이상한 사진" to the user. Uses the Kakao Image Search API
// (dapi.kakao.com/v2/search/image), the SAME KAKAO_REST_API_KEY already set up for
// dig-kakao-places.mjs, no new credential needed.
//
// Run with: node scripts/fetch-place-images.mjs

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

if (!KAKAO_REST_API_KEY) {
  console.error("KAKAO_REST_API_KEY missing from .env.local");
  process.exit(1);
}

const MIN_DIMENSION = 300;

// Kakao's image search ranks by text relevance, not visual relevance — a "news" hit for
// e.g. "이랜드크루즈" can be a photo of two executives signing a contract, correctly
// matching the NAME but showing nothing of the actual place. "blog"/"cafe" posts are
// usually someone's visit writeup, far more likely to contain an actual photo of the
// place itself, so they're preferred; "news" is only used as a last resort.
const COLLECTION_RANK = { blog: 0, cafe: 1, news: 2 };

function sortByCollectionPreference(documents) {
  return [...documents]
    .filter((doc) => doc.width >= MIN_DIMENSION && doc.height >= MIN_DIMENSION)
    .sort((a, b) => (COLLECTION_RANK[a.collection] ?? 3) - (COLLECTION_RANK[b.collection] ?? 3));
}

// Many hosts (confirmed: Naver's postfiles/blogfiles/ldb-phinf.pstatic.net, even some Daum
// Cafe attachment paths on t1.daumcdn.net) reject the request outright when it's hotlinked
// from another origin — a plain domain blocklist missed cases like the Daum one, so this
// actually fetches each candidate and only accepts one that comes back as a real image.
async function isImageLoadable(url) {
  try {
    const response = await fetch(url, {
      headers: { Referer: "https://trip-chain.local/" },
      signal: AbortSignal.timeout(5000),
    });
    return response.ok && (response.headers.get("content-type") ?? "").startsWith("image/");
  } catch {
    return false;
  }
}

async function pickBestImage(documents) {
  for (const doc of sortByCollectionPreference(documents)) {
    if (await isImageLoadable(doc.image_url)) {
      return doc;
    }
  }
  return undefined;
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

async function searchImage(query, attempt = 1) {
  const params = new URLSearchParams({ query, size: "6", sort: "accuracy" });
  const response = await fetch(`https://dapi.kakao.com/v2/search/image?${params}`, {
    headers: { Authorization: `KakaoAK ${KAKAO_REST_API_KEY}` },
  });
  if (response.status === 429 && attempt <= 3) {
    await sleep(500 * attempt);
    return searchImage(query, attempt + 1);
  }
  if (!response.ok) {
    throw new Error(`Kakao image search failed for "${query}": HTTP ${response.status}`);
  }
  const data = await response.json();
  return data.documents ?? [];
}

async function main() {
  const dataPath = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
  const places = JSON.parse(readFileSync(dataPath, "utf8"));
  const targets = places.filter((place) => !place.image);

  console.log(`${targets.length} places have no image — searching Kakao Image Search for each.`);

  let found = 0;
  let missed = 0;

  await pool(targets, 4, async (place) => {
    try {
      const documents = await searchImage(`${place.name} ${place.area}`);
      const best = await pickBestImage(documents);
      if (best) {
        place.image = best.image_url;
        found++;
      } else {
        missed++;
      }
    } catch (error) {
      console.warn(`  failed for "${place.name}":`, error.message);
      missed++;
    }
    await sleep(120);
  });

  writeFileSync(dataPath, JSON.stringify(places, null, 2), "utf8");
  console.log(`Found images for ${found}/${targets.length} places (${missed} left without — they still fall back to the random picsum photo).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
