// Rebuilds the sightseeing / culture layer the way the dining layer was built: collect a wide set of
// candidates, then sort them with evidence instead of trusting one list. One district at a time.
//
//   1. candidates — every tourist spot (AT4) and cultural venue (CT1) in the district from the Kakao
//      Local API over a recursive map grid (one query returns at most 45).
//   2. rules      — a first, free sort by Kakao's category and the name: what KIND of thing is it
//      (venue, street, route, park …) and what must never be a stop (cinemas, hotels, malls …).
//   (later stages, same shape as build-food-pool.mjs: naver mentions → score → Gemini verify →
//    export. They are added once the candidate lists have been looked at.)
//
//   node scripts/build-sights-pool.mjs --district 마포구
//
// Everything is written to scripts/.cache/ (gitignored) until an export stage exists.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");

// Same boxes as build-food-pool.mjs (generous on purpose; the address text decides). Only the districts
// tried so far are listed; copy the rest from there when a district is run.
const DISTRICTS = {
  마포구: { west: 126.85, south: 37.52, east: 126.97, north: 37.6 },
  종로구: { west: 126.945, south: 37.56, east: 127.03, north: 37.64 },
  중구: { west: 126.955, south: 37.54, east: 127.045, north: 37.585 },
  용산구: { west: 126.935, south: 37.505, east: 127.025, north: 37.56 },
};

function loadEnvLocal() {
  const envPath = path.join(ROOT, ".env.local");
  const env = {};
  if (!existsSync(envPath)) return env;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

const env = loadEnvLocal();
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const DISTRICT = arg("district", "마포구");
const box = DISTRICTS[DISTRICT];
if (!box) {
  console.error(`Unknown district "${DISTRICT}". Known: ${Object.keys(DISTRICTS).join(", ")}`);
  process.exit(1);
}

mkdirSync(CACHE_DIR, { recursive: true });
const files = {
  raw: path.join(CACHE_DIR, `sights-${DISTRICT}-raw.json`),
  candidates: path.join(CACHE_DIR, `sights-${DISTRICT}-candidates.json`),
  review: path.join(CACHE_DIR, `sights-${DISTRICT}-review.txt`),
};
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- stage 1: candidates (Kakao Local) ----------------------------------------------

const KAKAO_KEY = env.KAKAO_REST_API_KEY;
let kakaoCalls = 0;

async function kakaoCategory(code, rect, page) {
  const params = new URLSearchParams({
    category_group_code: code,
    rect: `${rect.west},${rect.south},${rect.east},${rect.north}`,
    page: String(page),
    size: "15",
  });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/category.json?${params}`, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    });
    kakaoCalls += 1;
    if (response.ok) {
      await sleep(60);
      return response.json();
    }
    if (response.status === 429 || response.status >= 500) {
      await sleep(500 * attempt);
      continue;
    }
    throw new Error(`Kakao ${response.status}: ${(await response.text()).slice(0, 120)}`);
  }
  throw new Error("Kakao request kept failing");
}

async function collectCell(code, rect, out, depth = 0) {
  const first = await kakaoCategory(code, rect, 1);
  const total = first.meta?.total_count ?? 0;
  const tooSmallToSplit = rect.east - rect.west < 0.0012 || depth > 8;
  if (total > 45 && !tooSmallToSplit) {
    const midLng = (rect.west + rect.east) / 2;
    const midLat = (rect.south + rect.north) / 2;
    for (const quad of [
      { west: rect.west, south: rect.south, east: midLng, north: midLat },
      { west: midLng, south: rect.south, east: rect.east, north: midLat },
      { west: rect.west, south: midLat, east: midLng, north: rect.north },
      { west: midLng, south: midLat, east: rect.east, north: rect.north },
    ]) {
      await collectCell(code, quad, out, depth + 1);
    }
    return;
  }
  for (const doc of first.documents ?? []) out.set(doc.id, doc);
  const pages = Math.min(3, Math.ceil(Math.min(total, 45) / 15));
  for (let page = 2; page <= pages; page++) {
    const next = await kakaoCategory(code, rect, page);
    for (const doc of next.documents ?? []) out.set(doc.id, doc);
  }
}

async function runCandidates() {
  if (!KAKAO_KEY) {
    console.error("KAKAO_REST_API_KEY missing in .env.local");
    process.exit(1);
  }
  console.log(`[candidates] ${DISTRICT}: scanning Kakao Local (tourist spots + cultural venues) …`);
  const raw = new Map();
  const step = 0.012;
  for (const code of ["AT4", "CT1"]) {
    for (let lng = box.west; lng < box.east; lng += step) {
      for (let lat = box.south; lat < box.north; lat += step) {
        await collectCell(
          code,
          { west: lng, south: lat, east: Math.min(lng + step, box.east), north: Math.min(lat + step, box.north) },
          raw,
        );
      }
    }
    console.log(`  ${code} done — ${raw.size} unique so far (${kakaoCalls} calls)`);
  }
  writeJson(files.raw, [...raw.values()]);
  console.log(`[candidates] ${raw.size} raw places saved`);
}

// ---- stage 2: rules (free first sort) -----------------------------------------------
//
// What a place IS decides how it may be used, so this runs before any scoring:
//   venue   — somewhere you go in and spend time (museum, palace, gallery, viewpoint, market …)
//   park    — a park or garden (go, walk, sit)
//   street  — a street / neighbourhood known as a destination (is visited as an area, not a door)
//   route   — a named walking route / trail (a course, not a stop)
//   nightlife — clubs and the like: kept, flagged, only for people who ask for the night
//   exclude — never a stop: cinemas, hotels, malls, parking, schools, offices, shops, studios …
//   exhibit — an object or a collection inside another place (belongs to its museum, not on its own)

const EXCLUDE_CATEGORY =
  /영화관|숙박|호텔|모텔|펜션|쇼핑|백화점|대형마트|아울렛|주차장|학교|학원|대학|병원|약국|은행|사무|공공기관|도서관|주민센터|문화원|복지|교회|성당|사찰|종교|결혼|웨딩|스튜디오|포토|인쇄|노래방|PC방|오락|당구|찜질|스파|마사지|미용|사우나|골프|스포츠|헬스|요가|필라테스|체육/;
const EXCLUDE_NAME =
  /CGV|메가박스|롯데시네마|호텔|모텔|레지던스|게스트하우스|주차장|아울렛|백화점|스튜디오|포토부스|인생네컷|학원|교회|성당|센터\s?\d*호?점|지점|\d+호점/;
const NIGHTLIFE = /클럽|나이트|유흥|라운지\s?바|힙합|EDM/;
const STREET = /거리$|골목$|마을$|시장$|상가$|로$|타운$|[가-힣]+길$/;
const ROUTE = /둘레길|올레길|산책로|탐방로|코스$|트레일|순환로|나들길|자락길|걷기|올림픽대로/;
const PARK = /공원|수목원|정원|숲$|생태|호수|하천|한강/;

function kindOf(doc) {
  const name = doc.place_name ?? "";
  const category = doc.category_name ?? "";
  if (EXCLUDE_CATEGORY.test(category) || EXCLUDE_NAME.test(name)) return "exclude";
  if (NIGHTLIFE.test(name) || NIGHTLIFE.test(category)) return "nightlife";
  if (ROUTE.test(name) || category.includes("도보여행")) return "route";
  if (PARK.test(name) || category.includes("공원")) return "park";
  if (category.includes("테마거리") || category.includes("거리") || STREET.test(name)) return "street";
  return "venue";
}

function runRules() {
  if (!existsSync(files.raw)) {
    console.error("Run the candidates stage first.");
    process.exit(1);
  }
  const raw = JSON.parse(readFileSync(files.raw, "utf8"));
  const inDistrict = raw.filter((doc) => (doc.address_name ?? "").includes(`서울 ${DISTRICT}`));
  const candidates = inDistrict.map((doc) => ({
    id: doc.id,
    name: doc.place_name,
    kind: kindOf(doc),
    category: (doc.category_name ?? "").split(" > ").slice(1).join(" > "),
    address: doc.road_address_name || doc.address_name,
    lat: Number(doc.y),
    lng: Number(doc.x),
    url: doc.place_url,
  }));
  writeJson(files.candidates, candidates);

  const byKind = {};
  for (const place of candidates) (byKind[place.kind] ??= []).push(place);
  const lines = [`${DISTRICT}: ${candidates.length} places in the district (outside dropped: ${raw.length - inDistrict.length})`];
  for (const kind of ["venue", "park", "street", "route", "nightlife", "exclude"]) {
    const list = byKind[kind] ?? [];
    lines.push(`\n## ${kind} (${list.length})`);
    for (const place of list) lines.push(`${place.name}  |  ${place.category}`);
  }
  writeFileSync(files.review, lines.join("\n"), "utf8");
  console.log(
    `[rules] ${candidates.length} places:`,
    JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([kind, list]) => [kind, list.length]))),
  );
  console.log(`[rules] review list: ${files.review}`);
}

const stage = arg("stage", "all");
if (stage === "all" || stage === "candidates") {
  if (stage === "all" && existsSync(files.raw)) console.log("[candidates] raw list already collected");
  else await runCandidates();
}
if (stage === "all" || stage === "rules") runRules();
