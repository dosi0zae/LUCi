// Rebuilds the sightseeing / culture layer the way the dining layer was built: collect a wide set of
// candidates, then sort them with evidence instead of trusting one list. One district at a time.
//
//   1. candidates — every tourist spot (AT4) and cultural venue (CT1) in the district from the Kakao
//      Local API over a recursive map grid (one query returns at most 45).
//   2. rules      — a first, free sort by Kakao's category and the name: what KIND of thing is it
//      (venue, street, route, park …) and what must never be a stop (cinemas, hotels, malls …).
//   3. merge      — joins the Kakao list with the place names found in blog posts
//      (discover-sights.mjs), folds duplicates, parts of a place and neighbourhood names.
//   4. naver      — blog counts per candidate (Naver API HUB, shares the daily quota).
//   5. score      — mentions, paid-post share, tier (strong / weak / none) and a percentile score.
//   6. verify     — Gemini judges strong/weak places from a closed vocabulary (include/exclude + reason,
//      app type, mood tags, energy, best time, duration, indoor/outdoor, a one-line story).
//   (later: export.)
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

// Same boxes as build-food-pool.mjs (generous on purpose; the address text decides).
const DISTRICTS = {
  종로구: { west: 126.945, south: 37.56, east: 127.03, north: 37.64 },
  중구: { west: 126.955, south: 37.54, east: 127.045, north: 37.585 },
  용산구: { west: 126.935, south: 37.505, east: 127.025, north: 37.56 },
  성동구: { west: 127.003, south: 37.527, east: 127.082, north: 37.58 },
  광진구: { west: 127.05, south: 37.52, east: 127.14, north: 37.58 },
  동대문구: { west: 127.02, south: 37.55, east: 127.09, north: 37.61 },
  중랑구: { west: 127.05, south: 37.56, east: 127.13, north: 37.63 },
  성북구: { west: 126.96, south: 37.57, east: 127.08, north: 37.63 },
  강북구: { west: 126.96, south: 37.6, east: 127.06, north: 37.7 },
  도봉구: { west: 127.0, south: 37.62, east: 127.09, north: 37.71 },
  노원구: { west: 127.03, south: 37.6, east: 127.11, north: 37.7 },
  은평구: { west: 126.87, south: 37.57, east: 126.98, north: 37.67 },
  서대문구: { west: 126.9, south: 37.54, east: 126.98, north: 37.61 },
  마포구: { west: 126.85, south: 37.52, east: 126.97, north: 37.6 },
  양천구: { west: 126.82, south: 37.49, east: 126.9, north: 37.56 },
  강서구: { west: 126.75, south: 37.52, east: 126.89, north: 37.6 },
  구로구: { west: 126.8, south: 37.46, east: 126.91, north: 37.53 },
  금천구: { west: 126.86, south: 37.42, east: 126.93, north: 37.49 },
  영등포구: { west: 126.87, south: 37.47, east: 127.0, north: 37.56 },
  동작구: { west: 126.9, south: 37.46, east: 127.0, north: 37.52 },
  관악구: { west: 126.89, south: 37.43, east: 126.99, north: 37.5 },
  서초구: { west: 126.94, south: 37.42, east: 127.08, north: 37.53 },
  강남구: { west: 127.0, south: 37.45, east: 127.12, north: 37.56 },
  송파구: { west: 127.06, south: 37.44, east: 127.21, north: 37.57 },
  강동구: { west: 127.09, south: 37.5, east: 127.19, north: 37.58 },
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
// --tag -old: the same stages over a different candidate list (scripts/export-sights.mjs --prepare-old writes
// sights-<구>-old-merged.json: old-data places that still need judging); their files carry the tag.
const TAG = arg("tag", "");
const ALL_TIERS = args.includes("--all");
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
  resolved: path.join(CACHE_DIR, `sights-${DISTRICT}-resolved.json`),
  extra: path.join(CACHE_DIR, `sights-${DISTRICT}-extra.json`),
  merged: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-merged.json`),
  mergedReview: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-merged-review.txt`),
  naver: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-naver.json`),
  scored: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-scored.json`),
  scoredReview: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-scored-review.txt`),
  verify: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-verify.json`),
  verifyReview: path.join(CACHE_DIR, `sights-${DISTRICT}${TAG}-verify-review.txt`),
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

// Hard: never a stop, whatever the blogs say. Soft: usually not a stop, but a place many posts name
// (a famous temple, a cathedral, a university museum) is kept — see `strong` in kindOf.
const EXCLUDE_CATEGORY =
  /영화관|숙박|호텔|모텔|펜션|쇼핑|백화점|대형마트|아울렛|주차장|학교|학원|병원|약국|은행|금융|사무|공공기관|행정|보건|주민센터|복지|결혼|웨딩|스튜디오|포토|사진관|인쇄|노래방|PC방|오락|당구|찜질|스파|마사지|미용|사우나|골프|헬스|요가|필라테스|부동산|주거|아파트|오피스텔|충전소|공간대여|전문대행/;
const SOFT_EXCLUDE_CATEGORY = /도서관|문화원|교회|성당|사찰|종교|스포츠|체육|대학/;
const EXCLUDE_NAME =
  /CGV|메가박스|롯데시네마|호텔|모텔|레지던스|게스트하우스|주차장|아울렛|백화점|스튜디오|포토부스|인생네컷|학원|센터\s?\d*호?점|지점|\d+호점|아파트|오피스텔|보건소|구청$|충전소|체육관|평생학습관|입구$/;
const NIGHTLIFE = /클럽|나이트|유흥|라운지\s?바|힙합|EDM/;
const STREET = /거리$|골목$|마을$|시장$|상가$|로$|타운$|[가-힣]+길$/;
const ROUTE = /둘레길|올레길|산책로|탐방로|코스$|트레일|순환로|나들길|자락길|걷기|올림픽대로/;
const PARK = /공원|수목원|정원|숲$|생태|호수|하천|한강/;
// A named stretch of road, an honorary-road marker or a rental-office address is not a destination.
const ROAD_MARKER = /서울명예도로|명예도로|도로명|\d+(번)?(길|로)\s?\d*$/;

// strong: a place that several blog posts independently name (see discover-sights.mjs).
function kindOf(doc, strong = false) {
  const name = doc.place_name ?? "";
  const category = doc.category_name ?? "";
  if (EXCLUDE_CATEGORY.test(category) || EXCLUDE_NAME.test(name)) return "exclude";
  if (!strong && SOFT_EXCLUDE_CATEGORY.test(category)) return "exclude";
  if (NIGHTLIFE.test(name) || NIGHTLIFE.test(category)) return "nightlife";
  if (ROAD_MARKER.test(name)) return "route";
  if (ROUTE.test(name) || category.includes("도보여행")) return "route";
  // Kakao files fan-club "forests" (a plot planted in a star's name) under 관광,명소 > 숲. A real forest
  // park is filed as 공원; blogs make the call for the few that are both (strong).
  if (category.endsWith("> 숲") && !strong) return "exclude";
  if (PARK.test(name) || category.includes("공원") || category.endsWith("> 산") || category.endsWith("> 섬")) return "park";
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


// ---- stage 3: merge (Kakao categories + names found in blog posts) ---------------------
//
// Two lists describe the same district from different sides: Kakao's category scan knows every
// registered museum, hall and street but not which are visited; the blog discovery
// (discover-sights.mjs) knows what people write about but misses the quiet ones. They are joined
// on the Kakao place id, then tidied:
//   - the same place under two names ("오브젝트" / "오브젝트 서교점", "메타세쿼이아길" / "메타세콰이어길")
//     is one entry (same name once chain suffixes and spelling variants are dropped, or one name
//     inside the other, within 150 m);
//   - a place named after another place and standing next to it ("서울월드컵경기장 야외공연장",
//     "선유도공원 시간의정원") becomes a `part` of that place: kept as a highlight, never a stop;
//   - neighbourhood and station names ("연남동", "홍대입구역") that the blogs use as places are
//     `area`, not a stop.

const squashName = (value) => String(value).replace(/[\s·・\-_()（）\[\]"'.,]/g, "");
// Spelling variants and chain suffixes that make one place look like two.
const baseName = (value) =>
  squashName(value)
    .replace(/세콰이어/g, "세쿼이아")
    .replace(/(본점|[가-힣]{1,4}점)$/, "")
    .replace(/^서울(시)?/, "");

function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// A neighbourhood ("연남동", "을지로3가"), a station ("홍대입구역"), a junction ("신촌로터리").
const AREA_NAME = /^[가-힣0-9]{2,8}(동|역|[0-9]가)$|사거리$|삼거리$|로터리$|교차로$|역사거리$/;
const TRANSIT_CATEGORY = /지하철|전철|철도|버스|교통시설/;

function runMerge() {
  if (!existsSync(files.candidates)) {
    console.error("Run the candidates and rules stages first.");
    process.exit(1);
  }
  const kakao = JSON.parse(readFileSync(files.candidates, "utf8"));
  // resolved: names found in this district's own blog search; extra: names found elsewhere whose address is here
  // (scripts/resolve-unmatched-sights.mjs).
  const resolved = [
    ...(existsSync(files.resolved) ? JSON.parse(readFileSync(files.resolved, "utf8")) : []),
    ...(existsSync(files.extra) ? JSON.parse(readFileSync(files.extra, "utf8")) : []),
  ];

  const byId = new Map();
  for (const place of kakao) {
    byId.set(place.id, { ...place, sources: ["kakao"], posts: 0, samples: [] });
  }
  let blogOnly = 0;
  for (const entry of resolved) {
    if (!entry.kakao) continue; // no registered place in the district
    const doc = entry.kakao;
    const strong = entry.posts >= 3;
    const existing = byId.get(doc.id);
    if (existing) {
      existing.sources.push("blog");
      existing.posts = entry.posts;
      existing.samples = entry.samples ?? [];
      // Blogs can rescue a soft-excluded or fan-forest place; they never rescue a hard exclusion.
      if (existing.kind === "exclude") {
        const retry = kindOf({ place_name: doc.name, category_name: doc.category }, strong);
        if (retry !== "exclude") existing.kind = retry;
      }
      continue;
    }
    blogOnly += 1;
    const kind =
      TRANSIT_CATEGORY.test(doc.category ?? "") || AREA_NAME.test(doc.name)
        ? "area"
        : kindOf({ place_name: doc.name, category_name: doc.category }, strong);
    byId.set(doc.id, {
      id: doc.id,
      name: doc.name,
      kind,
      category: doc.category ?? "",
      address: doc.address,
      lat: doc.lat,
      lng: doc.lng,
      url: doc.url,
      sources: ["blog"],
      posts: entry.posts,
      samples: entry.samples ?? [],
    });
  }

  const all = [...byId.values()];
  // Stations and neighbourhoods that came in through Kakao's own categories too.
  for (const place of all) {
    if (place.kind !== "exclude" && (TRANSIT_CATEGORY.test(place.category) || AREA_NAME.test(place.name))) place.kind = "area";
  }

  // Same place twice: keep the entry with more blog posts (then the shorter, plainer name).
  const live = all.filter((place) => !["exclude", "area"].includes(place.kind));
  const dropped = new Set();
  for (let i = 0; i < live.length; i++) {
    for (let j = i + 1; j < live.length; j++) {
      const a = live[i];
      const b = live[j];
      if (dropped.has(a.id) || dropped.has(b.id)) continue;
      const ka = baseName(a.name);
      const kb = baseName(b.name);
      const same = ka === kb || (Math.min(ka.length, kb.length) >= 3 && (ka.includes(kb) || kb.includes(ka)));
      if (!same || distanceM(a, b) > 150) continue;
      const keep = a.posts !== b.posts ? (a.posts > b.posts ? a : b) : a.name.length <= b.name.length ? a : b;
      const lose = keep === a ? b : a;
      keep.posts = Math.max(keep.posts, lose.posts);
      keep.sources = [...new Set([...keep.sources, ...lose.sources])];
      if ((keep.samples ?? []).length === 0) keep.samples = lose.samples;
      keep.alias = [...(keep.alias ?? []), lose.name];
      dropped.add(lose.id);
    }
  }
  const unique = live.filter((place) => !dropped.has(place.id));

  // A part: named "<other place> …" and within 800 m of it.
  for (const place of unique) {
    const parent = unique
      .filter((other) => other.id !== place.id && other.kind !== "part")
      .filter((other) => squashName(other.name).length >= 3 && squashName(place.name).startsWith(squashName(other.name)))
      .filter((other) => squashName(place.name).length > squashName(other.name).length)
      .filter((other) => distanceM(place, other) <= 800)
      .sort((a, b) => squashName(b.name).length - squashName(a.name).length)[0];
    if (parent) {
      place.kind = "part";
      place.parent = parent.id;
      (parent.parts ??= []).push(place.name);
    }
  }

  const merged = [
    ...unique,
    ...all.filter((place) => place.kind === "area"),
    ...all.filter((place) => place.kind === "exclude"),
  ];
  writeJson(files.merged, merged);

  const nameOf = new Map(merged.map((place) => [place.id, place.name]));
  const byKind = {};
  for (const place of merged) (byKind[place.kind] ??= []).push(place);
  const lines = [
    `${DISTRICT}: ${merged.length} entries (${kakao.length} from Kakao categories, ${blogOnly} only from blogs, ${dropped.size} duplicates folded)`,
  ];
  for (const kind of ["venue", "park", "street", "route", "nightlife", "part", "area", "exclude"]) {
    const list = (byKind[kind] ?? []).sort((a, b) => b.posts - a.posts);
    lines.push(`\n## ${kind} (${list.length})`);
    for (const place of list) {
      const tag = place.sources.length === 2 ? `blog ${place.posts}` : place.sources[0] === "blog" ? `blog-only ${place.posts}` : "kakao";
      lines.push(
        `${place.name}  |  ${place.category}  |  ${tag}${place.alias ? `  | = ${place.alias.join(", ")}` : ""}${place.parent ? `  | part of ${nameOf.get(place.parent)}` : ""}`,
      );
    }
  }
  writeFileSync(files.mergedReview, lines.join("\n"), "utf8");
  console.log(
    `[merge] ${merged.length} entries:`,
    JSON.stringify(Object.fromEntries(Object.entries(byKind).map(([kind, list]) => [kind, list.length]))),
    `| ${dropped.size} folded, ${blogOnly} blog-only`,
  );
}


// ---- stage 4: naver (how much do people write about each candidate?) -------------------
//
// One blog search per candidate through the Naver API HUB, the same quota (25,000 a day, kept in
// hub-usage.json) and the same reading as the dining pipeline: `total` is Naver's loose match count,
// `titleHits` the top-100 posts whose title really names the place, with the paid-post share and
// recency taken from those posts only. Exclusions, neighbourhood names and parts of another place
// are skipped (nothing is searched for them).

const HUB = "https://naverapihub.apigw.ntruss.com";
const AD_PATTERN = /광고|협찬|체험단|제공받|원고료|소정의|지원받|서포터즈|파트너스/;
const DAY_MS = 86_400_000;
const USAGE_FILE = path.join(CACHE_DIR, "hub-usage.json");
const DAILY_LIMIT = 25_000;
const STOP_AT = Math.floor(DAILY_LIMIT * 0.99);
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const searchCallsToday = () => {
  const usage = readJson(USAGE_FILE, {});
  return usage.date === kstToday() ? usage.calls : 0;
};
const plainText = (value) => String(value ?? "").replace(/<[^>]*>/g, "").replace(/&quot;|&amp;|&lt;|&gt;|&#39;/g, "");
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");

async function hubBlogSearch(query) {
  const url = `${HUB}/search/v1/blog?query=${encodeURIComponent(query)}&display=100`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (searchCallsToday() >= STOP_AT) return { error: `daily limit 99% reached (${searchCallsToday()}/${DAILY_LIMIT})` };
    writeJson(USAGE_FILE, { date: kstToday(), calls: searchCallsToday() + 1 });
    const response = await fetch(url, {
      headers: { "X-NCP-APIGW-API-KEY-ID": env.NAVER_CLIENT_ID, "X-NCP-APIGW-API-KEY": env.NAVER_CLIENT_SECRET },
    });
    if (response.status === 429) {
      await sleep(1500 * attempt);
      continue;
    }
    if (!response.ok) return { error: response.status };
    return response.json();
  }
  return { error: 429 };
}

const SEARCHED_KINDS = ["venue", "park", "street", "route", "nightlife"];

async function runNaver() {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    console.log("[naver] NAVER_CLIENT_ID / NAVER_CLIENT_SECRET missing — skipped.");
    return;
  }
  if (!existsSync(files.merged)) {
    console.error("Run the merge stage first.");
    process.exit(1);
  }
  const merged = readJson(files.merged, []);
  const cache = readJson(files.naver, {});
  const todo = merged.filter((place) => SEARCHED_KINDS.includes(place.kind) && cache[place.id] === undefined);
  const stem = DISTRICT.replace(/구$/, "");
  const yearAgo = ymd(Date.now() - 365 * DAY_MS);
  let calls = 0;
  for (const place of todo) {
    const data = await hubBlogSearch(`${stem} ${place.name}`);
    if (data.error) {
      writeJson(files.naver, cache);
      console.log(`[naver] STOPPED (${data.error}) after ${calls} calls; ${Object.keys(cache).length} places saved. Run again to continue.`);
      process.exitCode = 2;
      return;
    }
    calls += 1;
    const key = squashName(baseName(place.name));
    const hits = (data.items ?? []).filter((item) => squashName(plainText(item.title)).includes(key));
    const dates = hits.map((item) => item.postdate).sort();
    cache[place.id] = {
      total: data.total ?? 0,
      titleHits: hits.length,
      // posts whose title names both the place and the district: what tells "성산" (a Mapo hill) from
      // 성산일출봉 and "전시장" (an exhibition hall) from every other one.
      stemHits: hits.filter((item) => plainText(item.title).includes(stem)).length,
      adHits: hits.filter((item) => AD_PATTERN.test(`${plainText(item.title)} ${plainText(item.description)}`)).length,
      newest: dates.at(-1) ?? null,
      recent: hits.filter((item) => item.postdate >= yearAgo).length,
    };
    if (calls % 50 === 0) writeJson(files.naver, cache);
    await sleep(90);
  }
  writeJson(files.naver, cache);
  console.log(`[naver] ${DISTRICT}: ${Object.keys(cache).length} places with blog counts (${calls} calls this run, ${searchCallsToday()} today)`);
}

// ---- stage 5: score (a first evidence ranking; Gemini then judges the ones that pass) ------
//
// mentions  — estimated real posts about the place: the loose total scaled by the share of the top
//             100 posts that name it (like the dining pipeline); a place several discovery posts name
//             counts at least that many.
// tier      — strong: many posts or named by the "가볼만한 곳" posts; weak: some posts; none: nothing
//             written about it, which is what a hall or gallery nobody visits looks like. `none`
//             never goes on to the Gemini check.

function estimateMentions(entry) {
  if (!entry) return 0;
  return entry.titleHits >= 10 ? Math.round((entry.total * entry.titleHits) / 100) : entry.titleHits;
}

function runScore() {
  if (!existsSync(files.merged) || !existsSync(files.naver)) {
    console.error("Run the merge and naver stages first.");
    process.exit(1);
  }
  const merged = readJson(files.merged, []);
  const naver = readJson(files.naver, {});
  const rows = merged.map((place) => {
    const blog = naver[place.id];
    // A very short name is a common word: Naver's counts say nothing about this one place, so only
    // posts that also name the district count (and the loose total is not scaled up).
    const generic = squashName(baseName(place.name)).length <= 3;
    const estimate = generic ? (blog?.stemHits ?? 0) : estimateMentions(blog);
    const mentions = Math.max(estimate, place.posts ?? 0);
    const adRate = blog && blog.titleHits >= 5 ? blog.adHits / blog.titleHits : 0;
    let tier = "none";
    if (SEARCHED_KINDS.includes(place.kind)) {
      if (mentions >= 30 || (place.posts ?? 0) >= 3) tier = "strong";
      else if (mentions >= 8) tier = "weak";
    }
    return { ...place, mentions, adRate: Number(adRate.toFixed(2)), titleHits: blog?.titleHits ?? null, total: blog?.total ?? null, recent: blog?.recent ?? null, newest: blog?.newest ?? null, tier };
  });

  // Percentile of log mentions inside the same kind, so a street is not ranked against a hall.
  for (const kind of SEARCHED_KINDS) {
    const group = rows.filter((row) => row.kind === kind).sort((a, b) => a.mentions - b.mentions);
    group.forEach((row, index) => {
      const pct = group.length > 1 ? index / (group.length - 1) : 1;
      row.score = Math.round(100 * pct * (1 - 0.5 * row.adRate));
    });
  }
  writeJson(files.scored, rows);

  const count = (tier) => rows.filter((row) => row.tier === tier).length;
  const live = rows.filter((row) => SEARCHED_KINDS.includes(row.kind));
  const lines = [`${DISTRICT}: ${live.length} searched — strong ${count("strong")}, weak ${count("weak")}, none ${live.length - count("strong") - count("weak")}`];
  for (const tier of ["strong", "weak"]) {
    lines.push(`\n## ${tier}`);
    for (const row of rows.filter((r) => r.tier === tier).sort((a, b) => b.mentions - a.mentions)) {
      lines.push(`${row.name}  |  ${row.kind}  |  ${row.category}  |  mentions ${row.mentions} (titles ${row.titleHits}, ad ${row.adRate}, discovery ${row.posts})`);
    }
  }
  writeFileSync(files.scoredReview, lines.join("\n"), "utf8");
  console.log(`[score] ${DISTRICT}: strong ${count("strong")}, weak ${count("weak")}, none ${live.length - count("strong") - count("weak")}`);
}


// ---- stage 6: verify (Gemini judges the places with evidence, from a closed vocabulary) ---------
//
// Only places that passed the Naver stage (tier strong / weak) are sent. Gemini answers from fixed
// choices: include or exclude (with a reason code), the app's place type, the app's mood tags, how
// tiring it is, when it is at its best, how long a visit takes and whether it is indoors or out. It never
// writes free text except one short line on why the place is worth a stop (`story`).

const VERIFY_PROMPT = [
  "너는 서울 하루 여행 코스를 짜는 편집자야. 각 항목은 서울의 한 구에서 후보로 뽑힌 장소 하나다(이름, 종류, 카카오 분류, 주소, 블로그 언급 수, 이 장소가 언급된 글 제목).",
  "여행자가 하루 코스에서 '한 곳으로 들러서 시간을 보낼' 만한 곳이면 include, 아니면 exclude 로 답한다.",
  "include: 궁·유적·사적, 박물관·미술관·전시관(누구나 입장하는 곳), 공원·정원·산·하천·한강공원, 전통시장, 전망대, 이름난 거리·골목(걷는 목적지), 대표 공연장·문화예술센터, 축제·행사가 열리는 상설 장소.",
  "exclude 사유(reason): private_business(개인 공방·원데이클래스·대관·사무실·가게), tiny_venue(작은 소극장·라이브하우스·갤러리·전시 공간 중 일반 여행자가 들를 이유가 약한 곳), not_a_destination(도로·다리·건물·아파트·기관·학교·종교시설 일반), generic_name(이름이 일반 단어라 어느 장소인지 불분명), closed_or_unknown(문을 닫았거나 알려진 바 없음).",
  "종류가 nightlife 인 곳(클럽 등)은 밤에만 가는 곳이다: include 로 하되 nightOnly=true, bestTime=[night].",
  "종류가 route 인 곳(둘레길·산책로 등)은 코스 안의 걷는 구간이다: 걸을 만하면 include.",
  "type 은 앱의 분류: 문화재(궁·유적·사적·한옥), 관광지(공원·시장·전망대·거리·명소), 문화시설(박물관·미술관·공연장·전시관), 축제행사(축제가 주인 곳).",
  "모르는 장소는 추측하지 말고 exclude + closed_or_unknown. story 는 이 장소가 왜 들를 만한지 한 줄(40자 이내, 사실만).",
].join("\n");

const VERIFY_MOODS = ["무료", "도보코스", "혼자", "친구모임", "가족동반", "커플", "역사탐방", "전통문화", "체험형", "예술", "자연", "이색", "포토존", "야경", "조용함", "활기참", "로맨틱", "휴식"];
const VERIFY_BATCH = 20;

const SPEND_FILE = path.join(CACHE_DIR, "gemini-spend.json");
const SPEND_BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "12");
const SPEND_MARGIN = 0.2;
let spentUsd = readJson(SPEND_FILE, { usd: 0 }).usd;
let geminiStopped = false;
const geminiUsage = { calls: 0, prompt: 0, output: 0, thoughts: 0 };
function overBudget() {
  if (spentUsd + SPEND_MARGIN < SPEND_BUDGET) return false;
  if (!geminiStopped) console.log(`  Gemini spend guard: $${spentUsd.toFixed(2)} of $${SPEND_BUDGET} used, stopping. Raise GEMINI_BUDGET_USD to continue.`);
  geminiStopped = true;
  process.exitCode = 2;
  return true;
}
function countUsage(data) {
  const usage = data?.usageMetadata ?? {};
  geminiUsage.calls += 1;
  geminiUsage.prompt += usage.promptTokenCount ?? 0;
  geminiUsage.output += usage.candidatesTokenCount ?? 0;
  geminiUsage.thoughts += usage.thoughtsTokenCount ?? 0;
  spentUsd += ((usage.promptTokenCount ?? 0) * 0.3 + ((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)) * 2.5) / 1e6;
  writeJson(SPEND_FILE, { usd: Number(spentUsd.toFixed(4)) });
}
process.on("exit", () => {
  if (geminiUsage.calls > 0) {
    const cost = (geminiUsage.prompt * 0.3 + (geminiUsage.output + geminiUsage.thoughts) * 2.5) / 1e6;
    console.log(`[gemini] ${geminiUsage.calls} calls, in ${geminiUsage.prompt}, out ${geminiUsage.output}, thinking ${geminiUsage.thoughts} tokens = about $${cost.toFixed(3)}`);
  }
});

async function geminiVerify(batch) {
  if (geminiStopped || overBudget()) return null;
  const body = batch
    .map(
      (place) =>
        `[${place.id}] ${place.name} (종류 ${place.kind}, 카카오 ${place.category}, ${place.address}, 블로그 언급 ${place.mentions})\n` +
        (place.samples ?? []).slice(0, 3).map((title) => `- ${title}`).join("\n"),
    )
    .join("\n\n");
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: VERIFY_PROMPT }] },
          contents: [{ parts: [{ text: body }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING", enum: batch.map((place) => place.id) },
                  verdict: { type: "STRING", enum: ["include", "exclude"] },
                  reason: { type: "STRING", enum: ["none", "private_business", "tiny_venue", "not_a_destination", "generic_name", "closed_or_unknown"] },
                  type: { type: "STRING", enum: ["문화재", "관광지", "문화시설", "축제행사"] },
                  setting: { type: "STRING", enum: ["실내", "실외", "혼합"] },
                  moods: { type: "ARRAY", items: { type: "STRING", enum: VERIFY_MOODS } },
                  // enum values must be strings in Gemini's schema; turned back into 1 / 2 / 3 below
                  energy: { type: "STRING", enum: ["1", "2", "3"] },
                  bestTime: { type: "ARRAY", items: { type: "STRING", enum: ["morning", "afternoon", "evening", "night"] } },
                  durationMin: { type: "INTEGER" },
                  nightOnly: { type: "BOOLEAN" },
                  story: { type: "STRING" },
                },
                required: ["id", "verdict", "reason", "type", "setting", "moods", "energy", "bestTime", "durationMin", "nightOnly", "story"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (response.status === 402) {
      console.log("  Gemini prepaid credits depleted (402).");
      geminiStopped = true;
      process.exitCode = 2;
      return null;
    }
    if (response.status === 429 || response.status >= 500) {
      const text = await response.text().catch(() => "");
      if (response.status === 429 && /per day|spending cap/i.test(text)) {
        console.log(`  Gemini 429: ${text.slice(0, 120)}`);
        geminiStopped = true;
        process.exitCode = 2;
        return null;
      }
      console.log(`  Gemini ${response.status} (attempt ${attempt}/${MAX_ATTEMPTS}); waiting.`);
      await sleep(5000 * attempt);
      continue;
    }
    if (!response.ok) {
      console.log(`  Gemini ${response.status}: ${(await response.text().catch(() => "")).slice(0, 160)}`);
      return null;
    }
    try {
      const data = await response.json();
      countUsage(data);
      return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch (error) {
      console.log(`  Gemini reply could not be read: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
  return null;
}

async function runVerify() {
  if (!env.GEMINI_API_KEY) {
    console.log("[verify] GEMINI_API_KEY missing — skipped.");
    return;
  }
  if (!existsSync(files.scored)) {
    console.error("Run the score stage first.");
    process.exit(1);
  }
  const scored = readJson(files.scored, []);
  const cache = readJson(files.verify, {});
  // --all: judge every searched place whatever its blog evidence (old-data places, which are curated lists, not blog finds)
  const todo = scored.filter((place) => (ALL_TIERS ? SEARCHED_KINDS.includes(place.kind) : ["strong", "weak"].includes(place.tier)) && cache[place.id] === undefined);
  console.log(`[verify] ${DISTRICT}: ${todo.length} places to judge (${Object.keys(cache).length} done before)`);
  for (let start = 0; start < todo.length; start += VERIFY_BATCH) {
    const batch = todo.slice(start, start + VERIFY_BATCH);
    const result = await geminiVerify(batch);
    if (!result) {
      writeJson(files.verify, cache);
      console.log(`[verify] stopped at ${start}/${todo.length}; progress saved.`);
      return;
    }
    for (const row of result) cache[row.id] = { ...row, energy: Number(row.energy) };
    writeJson(files.verify, cache);
  }
  writeJson(files.verify, cache);

  const rows = scored
    .filter((place) => cache[place.id])
    .map((place) => ({ ...place, ...cache[place.id], kind: place.kind, id: place.id }));
  const included = rows.filter((row) => row.verdict === "include").sort((a, b) => b.mentions - a.mentions);
  const excluded = rows.filter((row) => row.verdict === "exclude");
  const lines = [`${DISTRICT}: ${rows.length} judged — include ${included.length}, exclude ${excluded.length}`];
  lines.push("\n## include");
  for (const row of included) {
    lines.push(`${row.name} | ${row.type} | ${row.setting} | ${row.moods.join(",")} | ${row.durationMin}분 | ${row.nightOnly ? "밤 전용 | " : ""}mentions ${row.mentions} | ${row.story}`);
  }
  lines.push("\n## exclude");
  const byReason = {};
  for (const row of excluded) (byReason[row.reason] ??= []).push(row.name);
  for (const [reason, names] of Object.entries(byReason)) lines.push(`${reason} (${names.length}): ${names.join(" / ")}`);
  writeFileSync(files.verifyReview, lines.join("\n"), "utf8");
  console.log(`[verify] ${DISTRICT}: include ${included.length}, exclude ${excluded.length} — ${files.verifyReview}`);
}

const stage = arg("stage", "all");
if (stage === "all" || stage === "candidates") {
  if (stage === "all" && existsSync(files.raw)) console.log("[candidates] raw list already collected");
  else await runCandidates();
}
if (stage === "all" || stage === "rules") runRules();
if (stage === "all" || stage === "merge") runMerge();
if (stage === "all" || stage === "naver") await runNaver();
if (stage === "all" || stage === "score") runScore();
if (stage === "all" || stage === "verify") await runVerify();
