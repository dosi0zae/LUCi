// Prototype pipeline for the "식당·카페·바" layer, one district at a time (first test: 성동구).
//
//   1. candidates — every real restaurant / café / bar in the district from the Kakao Local
//      API (category search over a recursive map grid, because one query returns at most 45).
//   2. naver      — how much each place is written about: Naver blog-search total for
//      "<동> <이름>" (official API, free quota). Needs NAVER_CLIENT_ID / NAVER_CLIENT_SECRET.
//   3. google     — star rating + review count for the most-mentioned places only, from the
//      Google Places API (New). Needs GOOGLE_PLACES_API_KEY (billing enabled). Ratings are
//      NOT stored in git: Google's terms don't allow keeping its content in our own dataset,
//      so everything this script writes goes to scripts/.cache/ (gitignored) for evaluation.
//   4. score      — our own score and the pass/fail verdict (see SCORING below).
//
// Stages that lack their key are skipped with a message; each stage resumes from the cache.
//
//   node scripts/build-food-pool.mjs --district 성동구            # all stages that have keys
//   node scripts/build-food-pool.mjs --stage candidates
//   node scripts/build-food-pool.mjs --stage naver
//   node scripts/build-food-pool.mjs --stage google --google-top 60
//   node scripts/build-food-pool.mjs --stage score

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");

// ---- config -----------------------------------------------------------------------

// Bounding boxes (lng/lat) generous enough to cover the district; results are then filtered
// by the address text. Add a district here to run the pipeline for it.
const DISTRICTS = {
  성동구: { west: 127.003, south: 37.527, east: 127.082, north: 37.58 },
  // Boxes are generous on purpose (neighbouring districts overlap); the address text decides.
  종로구: { west: 126.945, south: 37.56, east: 127.03, north: 37.64 },
  중구: { west: 126.955, south: 37.54, east: 127.045, north: 37.585 },
  용산구: { west: 126.935, south: 37.505, east: 127.025, north: 37.56 },
  마포구: { west: 126.85, south: 37.52, east: 126.97, north: 37.6 },
  송파구: { west: 127.06, south: 37.44, east: 127.21, north: 37.57 },
  영등포구: { west: 126.87, south: 37.47, east: 127.0, north: 37.56 },
  강남구: { west: 127.0, south: 37.45, east: 127.12, north: 37.56 },
  서초구: { west: 126.94, south: 37.42, east: 127.08, north: 37.53 },
  광진구: { west: 127.05, south: 37.52, east: 127.14, north: 37.58 },
  동대문구: { west: 127.02, south: 37.55, east: 127.09, north: 37.61 },
};

// SCORING — final = 100 × (0.55 × ratingScore + 0.45 × mentionPercentile)
//   ratingScore    = Bayesian-adjusted Google rating mapped from [3.6, 4.8] to [0, 1]
//                    (a 5.0 from 3 reviews is pulled toward the prior instead of topping the list)
//   mentionPercentile = rank of log(1 + blog posts) among the same kind in this district
// A place passes when rating >= MIN_RATING, reviews >= MIN_REVIEWS and final >= MIN_SCORE.
const PRIOR_RATING = 4.1;
const PRIOR_WEIGHT = 80;
const MIN_RATING = 4.0;
const MIN_REVIEWS = 100;
const MIN_SCORE = 60;
// No Google data yet: the top share of a kind by our signal score is marked "top".
const MENTION_ONLY_TOP = 0.8;

// Big chains are not what a culture/sightseeing course should recommend; they stay in the
// candidate list (flagged) but are never scored.
const CHAIN_PATTERN =
  /스타벅스|이디야|투썸|메가\s?(MGC)?커피|컴포즈|빽다방|할리스|파스쿠찌|폴\s?바셋|엔제리너스|탐앤탐스|커피빈|더벤티|매머드|맥도날드|버거킹|롯데리아|KFC|맘스터치|서브웨이|파리바게뜨|뚜레쥬르|던킨|배스킨|김밥천국|본죽|한솥|bhc|BHC|교촌|굽네|BBQ|도미노|피자헛|파파존스|이삭토스트|스시로|아웃백|빕스|VIPS|애슐리|투다리|역전할머니|명륜진사갈비|고깃집\s?무한/;

// ---- env / args -------------------------------------------------------------------

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
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}
const DISTRICT = arg("district", "성동구");
const STAGE = arg("stage", "all");
const GOOGLE_TOP = Number(arg("google-top", "60"));
const box = DISTRICTS[DISTRICT];
if (!box) {
  console.error(`Unknown district "${DISTRICT}". Known: ${Object.keys(DISTRICTS).join(", ")}`);
  process.exit(1);
}

// District name → short code used in app ids and file names (src/features/mobile/dining-data/).
const DINING_DATA_DIR = path.join(ROOT, "src", "features", "mobile", "dining-data");
const DISTRICT_CODE = JSON.parse(readFileSync(path.join(DINING_DATA_DIR, "districts.json"), "utf8"))[DISTRICT];
if (!DISTRICT_CODE) {
  console.error(`No code for "${DISTRICT}" in dining-data/districts.json`);
  process.exit(1);
}

mkdirSync(CACHE_DIR, { recursive: true });
const files = {
  candidates: path.join(CACHE_DIR, `food-${DISTRICT}-candidates.json`),
  naver: path.join(CACHE_DIR, `food-${DISTRICT}-naver.json`),
  trend: path.join(CACHE_DIR, `food-${DISTRICT}-trend.json`),
  brands: path.join(CACHE_DIR, `food-${DISTRICT}-brands.json`),
  tags: path.join(CACHE_DIR, `food-${DISTRICT}-tags.json`),
  verify: path.join(CACHE_DIR, `food-${DISTRICT}-verify.json`),
  google: path.join(CACHE_DIR, `food-${DISTRICT}-google.json`),
  report: path.join(CACHE_DIR, `food-${DISTRICT}-report.json`),
};
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- stage 1: candidates (Kakao Local) ---------------------------------------------

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

// One query returns at most 45 results (3 pages × 15). A cell whose total exceeds that is
// split in four until each piece fits (or is already tiny).
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

function classify(doc) {
  const category = doc.category_name ?? "";
  if (category.includes("술집")) return "bar";
  if (category.includes("카페") || category.includes("제과") || category.includes("디저트")) return "cafe";
  return "food";
}

function dongOf(address) {
  const match = address.match(new RegExp(`${DISTRICT}\\s+(\\S+)`));
  return match ? match[1].replace(/\d+가$/, "").replace(/\d+동$/, "동") : "";
}

async function runCandidates() {
  if (!KAKAO_KEY) {
    console.log("[candidates] KAKAO_REST_API_KEY missing — skipped.");
    return;
  }
  console.log(`[candidates] ${DISTRICT}: scanning Kakao Local (restaurants + cafés) …`);
  const raw = new Map();
  const step = 0.012;
  for (const code of ["FD6", "CE7"]) {
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

  const inDistrict = [...raw.values()].filter((doc) => (doc.address_name ?? "").includes(`서울 ${DISTRICT}`));
  const candidates = inDistrict
    .map((doc) => ({
      id: doc.id,
      name: doc.place_name,
      kind: classify(doc),
      category: (doc.category_name ?? "").split(" > ").slice(1).join(" > "),
      address: doc.road_address_name || doc.address_name,
      dong: dongOf(doc.address_name ?? ""),
      lat: Number(doc.y),
      lng: Number(doc.x),
      phone: doc.phone || "",
      url: doc.place_url,
      isChain: CHAIN_PATTERN.test(doc.place_name),
    }))
    // Kids' cafés, pet shops etc. aren't what a visitor wants.
    .filter((place) => !/키즈카페|애견|고양이/.test(place.name + place.category));

  writeJson(files.candidates, candidates);
  const byKind = Object.fromEntries(
    ["food", "cafe", "bar"].map((kind) => [kind, candidates.filter((place) => place.kind === kind).length]),
  );
  const byDong = {};
  for (const place of candidates) byDong[place.dong || "?"] = (byDong[place.dong || "?"] ?? 0) + 1;
  console.log(
    `[candidates] ${candidates.length} places in ${DISTRICT} (outside the district dropped: ${raw.size - inDistrict.length}); ` +
      `chains: ${candidates.filter((place) => place.isChain).length}`,
  );
  console.log("  by kind:", JSON.stringify(byKind));
  console.log(
    "  by dong:",
    JSON.stringify(Object.fromEntries(Object.entries(byDong).sort((a, b) => b[1] - a[1]))),
  );
}

const squash = (text) => text.replace(/<[^>]+>/g, "").replace(/\s+/g, "");
const DAY_MS = 86_400_000;

const plain = (text) =>
  text.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const SNIPPETS = 12;
const snippetOf = (item) => ({ t: plain(item.title).slice(0, 80), d: plain(item.description ?? "").slice(0, 180) });

// "로우커피스탠드 3호점" / "고찌소 옥수점" → the brand part, used to match posts and to count branches.
const BRANCH_SUFFIX = /\s*(\d+호점|[가-힣0-9]+점)$/;
const brandName = (name) => {
  const brand = name.replace(BRANCH_SUFFIX, "").trim();
  return brand.replace(/\s+/g, "").length >= 2 ? brand : name;
};
const brandKey = (name) => squash(brandName(name)).toLowerCase();
// Words that put a post in a given dong; a post naming the brand AND the dong is about that branch.
const DONG_WORDS = {
  하왕십리동: ["왕십리"],
  상왕십리동: ["왕십리"],
  도선동: ["도선", "왕십리"],
  // popular names people actually write instead of the legal dong
  관훈동: ["인사동", "관훈"],
  가회동: ["북촌", "가회"],
  계동: ["북촌", "계동"],
  재동: ["북촌", "재동"],
  누하동: ["서촌", "누하"],
  누상동: ["서촌", "누상"],
  통의동: ["서촌", "통의"],
  체부동: ["서촌", "체부"],
  옥인동: ["서촌", "옥인"],
  익선동: ["익선"],
  이태원동: ["이태원"],
  한남동: ["한남"],
  후암동: ["후암"],
  용산동: ["용산"],
  남영동: ["남영", "삼각지"],
  한강로동: ["삼각지", "용리단길", "한강로"],
  장충동: ["장충"],
  신당동: ["신당"],
  서교동: ["홍대", "서교"],
  동교동: ["연남", "동교"],
  상수동: ["상수", "홍대"],
  방이동: ["방이", "올림픽공원"],
  석촌동: ["석촌", "송리단길"],
  송파동: ["송리단길", "송파"],
  신천동: ["잠실", "신천"],
  논현동: ["논현", "학동"],
  역삼동: ["역삼", "강남역"],
  신사동: ["가로수길", "신사"],
  청담동: ["청담"],
  삼성동: ["삼성", "코엑스"],
  압구정동: ["압구정", "로데오"],
  서초동: ["서초", "교대"],
  반포동: ["반포", "고속터미널"],
  방배동: ["방배", "사이길"],
  화양동: ["건대", "화양"],
  자양동: ["건대", "자양"],
  군자동: ["군자", "어린이대공원"],
  회기동: ["회기", "경희대"],
  이문동: ["이문", "외대"],
  제기동: ["제기", "경동시장"],
  장안동: ["장안"],
  여의도동: ["여의도"],
};
const dongWords = (dong) => {
  const stem = dong.replace(/동$/, "");
  return DONG_WORDS[dong] ?? [stem.length >= 2 ? stem : dong];
};
const ymd = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll("-", "");

// Estimated real mentions: the loose total scaled by the share of top posts that name the place.
function estimateMentions(entry) {
  if (!entry) return 0;
  return entry.titleHits >= 10 ? Math.round((entry.total * entry.titleHits) / 100) : entry.titleHits;
}

// ---- stage 2: mentions (Naver API HUB: blog + café + news search) -------------------

const HUB = "https://naverapihub.apigw.ntruss.com";
// Paid-post markers; the share of these among posts naming the place is deducted from the score.
const AD_PATTERN = /광고|협찬|체험단|제공받|원고료|소정의|지원받|서포터즈|파트너스/;

function hubHeaders() {
  return { "X-NCP-APIGW-API-KEY-ID": env.NAVER_CLIENT_ID, "X-NCP-APIGW-API-KEY": env.NAVER_CLIENT_SECRET };
}

let hubCalls = 0;

// The search API allows 25,000 calls a day. The count is kept on disk (per day, Korea time) so
// it survives restarts, and a stage stops — saving what it has — once 99% is used.
const DAILY_LIMIT = 25_000;
const STOP_AT = Math.floor(DAILY_LIMIT * 0.99);
const usageFile = path.join(CACHE_DIR, "hub-usage.json");
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
function searchCallsToday() {
  const usage = readJson(usageFile, {});
  return usage.date === kstToday() ? usage.calls : 0;
}
function countSearchCall() {
  writeJson(usageFile, { date: kstToday(), calls: searchCallsToday() + 1 });
}

// Returns the parsed body, or { error: status } (429 is retried after a pause).
async function hubSearch(endpoint, query, display) {
  const url = `${HUB}/search/v1/${endpoint}?query=${encodeURIComponent(query)}&display=${display}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (searchCallsToday() >= STOP_AT) return { error: `daily limit 99% reached (${searchCallsToday()}/${DAILY_LIMIT})` };
    hubCalls += 1;
    countSearchCall();
    const response = await fetch(url, { headers: hubHeaders() });
    if (response.status === 429) {
      await sleep(1500 * attempt);
      continue;
    }
    if (!response.ok) return { error: response.status };
    return response.json();
  }
  return { error: 429 };
}

// What the blog results say about one place. Naver matches loosely (the dong alone satisfies most
// posts), so `total` over-counts plain-word names; titleHits counts top-100 posts that really
// name the place, and the ad / recency numbers are taken from those posts only.
function summarizeBlog(data, place) {
  const key = squash(brandName(place.name));
  const words = dongWords(place.dong);
  const hits = (data.items ?? []).filter((item) => squash(item.title).includes(key));
  const dates = hits.map((item) => item.postdate).sort();
  const yearAgo = ymd(Date.now() - 365 * DAY_MS);
  return {
    total: data.total ?? 0,
    titleHits: hits.length,
    // posts naming the brand and this branch's dong — what tells two branches apart
    dongHits: hits.filter((item) => words.some((word) => squash(item.title).includes(word))).length,
    adHits: hits.filter((item) => AD_PATTERN.test(`${item.title} ${item.description}`)).length,
    newest: dates.at(-1) ?? null,
    recent: hits.filter((item) => item.postdate >= yearAgo).length,
    snips: hits.slice(0, SNIPPETS).map(snippetOf),
  };
}

function summarizeTitles(data, name) {
  const key = squash(name);
  const hits = (data.items ?? []).filter((item) => squash(item.title).includes(key));
  return { total: data.total ?? 0, titleHits: hits.length, snips: hits.slice(0, SNIPPETS).map(snippetOf) };
}

// Café and news lookups only for places with this many blog posts naming them (in 성동구 every
// place that made the app list had 10+, so nothing is lost and about 10 % of the calls are saved).
const CAFE_NEWS_MIN_HITS = 10;

async function runNaver() {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    console.log("[naver] NAVER_CLIENT_ID / NAVER_CLIENT_SECRET missing — skipped.");
    return;
  }
  const candidates = readJson(files.candidates, []);
  if (candidates.length === 0) {
    console.log("[naver] no candidates yet — run the candidates stage first.");
    return;
  }
  const cache = readJson(files.naver, {});
  const maxCalls = Number(arg("naver-max", "12000"));
  const pool = candidates.filter((place) => !place.isChain);
  let newsEnabled = true;
  let stop = false;

  const pass = async (label, todo, work) => {
    console.log(`[naver] ${label}: ${todo.length} places`);
    let done = 0;
    for (const place of todo) {
      if (stop || hubCalls >= maxCalls) {
        stop = true;
        break;
      }
      await work(place);
      done += 1;
      if (done % 100 === 0) {
        writeJson(files.naver, cache);
        console.log(`  ${done}/${todo.length} (calls this run ${hubCalls})`);
      }
      await sleep(110);
    }
    writeJson(files.naver, cache);
  };

  // pass 1 — blog for every non-chain candidate
  await pass(
    "blog",
    pool.filter((place) => {
      const blog = cache[place.id]?.blog;
      return blog?.dongHits === undefined || (blog.titleHits >= 5 && blog.snips === undefined);
    }),
    async (place) => {
      const data = await hubSearch("blog", `${place.dong} ${place.name}`, 100);
      if (data.error) {
        console.log(`  Naver blog ${data.error} — stopping`);
        stop = true;
        return;
      }
      // café / news counts only carry over when the name they were searched with is unchanged
      const keep = brandName(place.name) === place.name ? cache[place.id] : {};
      cache[place.id] = { ...keep, blog: summarizeBlog(data, place) };
    },
  );

  // pass 2 — café posts and news, only for places with some real blog presence
  const worthy = (place) => (cache[place.id]?.blog?.titleHits ?? 0) >= CAFE_NEWS_MIN_HITS;
  await pass(
    "café + news",
    pool.filter((place) => worthy(place) && (cache[place.id].cafe?.snips === undefined || (newsEnabled && cache[place.id].news === undefined))),
    async (place) => {
      const entry = cache[place.id];
      if (entry.cafe?.snips === undefined) {
        const cafe = await hubSearch("cafearticle", `${place.dong} ${place.name}`, 100);
        if (cafe.error) {
          console.log(`  Naver café ${cafe.error} — stopping`);
          stop = true;
          return;
        }
        entry.cafe = summarizeTitles(cafe, brandName(place.name));
      }
      if (!newsEnabled || entry.news !== undefined) return;
      const news = await hubSearch("news", `${place.name} ${place.dong}`, 30);
      if (news.error) {
        console.log(`  Naver news ${news.error} — news skipped (enable the news API for this application, then rerun)`);
        newsEnabled = false;
        return;
      }
      entry.news = summarizeTitles(news, brandName(place.name));
    },
  );
  console.log(`[naver] ${stop ? "STOPPED" : "done"} — ${hubCalls} API calls this run, ${Object.keys(cache).length} places cached`);
  // Exit code 2 = cut short (daily limit or an API error): a queue must not go on to the next stage.
  if (stop) {
    process.exitCode = 2;
  }
}

// ---- stage 2a: brand size (Kakao keyword search over all of Seoul) ---------------------

const SEOUL_RECT = "126.76,37.41,127.19,37.71";

async function kakaoKeyword(query, page) {
  const params = new URLSearchParams({ query, rect: SEOUL_RECT, page: String(page), size: "15" });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${KAKAO_KEY}` },
    });
    if (response.status === 429) {
      await sleep(1000 * attempt);
      continue;
    }
    if (!response.ok) return null;
    return response.json();
  }
  return null;
}

// How many places in Seoul carry this brand name (max 45 — one search's reach). Tells a
// one-off apart from a small local group and from a franchise.
async function runBrands() {
  if (!KAKAO_KEY) {
    console.log("[brands] KAKAO_REST_API_KEY missing — skipped.");
    return;
  }
  const candidates = readJson(files.candidates, []);
  const cache = readJson(files.brands, {});
  const todo = new Map();
  for (const place of candidates) {
    if (place.isChain) continue;
    const key = brandKey(place.name);
    if (cache[key] === undefined && !todo.has(key)) todo.set(key, brandName(place.name));
  }
  console.log(`[brands] ${todo.size} brands to count (${Object.keys(cache).length} cached)`);
  let done = 0;
  for (const [key, query] of todo) {
    const ids = new Set();
    for (let page = 1; page <= 3; page++) {
      const data = await kakaoKeyword(query, page);
      if (!data) break;
      for (const doc of data.documents) {
        if (["FD6", "CE7"].includes(doc.category_group_code) && squash(doc.place_name).toLowerCase().includes(key)) ids.add(doc.id);
      }
      if (data.meta.is_end) break;
    }
    cache[key] = ids.size;
    done += 1;
    if (done % 200 === 0) {
      writeJson(files.brands, cache);
      console.log(`  ${done}/${todo.size}`);
    }
    await sleep(60);
  }
  writeJson(files.brands, cache);
  console.log(`[brands] ${Object.keys(cache).length} brands counted`);
}

// ---- stage 2b: search trend (Naver Datalab via API HUB) -------------------------------

// Each request compares 4 places with one fixed anchor query, so ratios are comparable across
// requests (Datalab scales every request so its own maximum is 100).
const TREND_ANCHOR = "성수동 맛집";
const TREND_BATCH = 4;
const monthStart = (date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));

async function runTrend() {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    console.log("[trend] NAVER_CLIENT_ID / NAVER_CLIENT_SECRET missing — skipped.");
    return;
  }
  const candidates = readJson(files.candidates, []);
  const mentions = readJson(files.naver, {});
  // Keyed by brand (all branches share one search term); entries from the older per-place format are dropped.
  const cache = Object.fromEntries(Object.entries(readJson(files.trend, {})).filter(([, entry]) => entry.kw));
  const maxPlaces = Number(arg("trend-max", "1500"));
  // Everyday-word names (see isAmbiguous) are skipped: their search volume says nothing about the place.
  const seen = new Set();
  const todo = candidates
    .filter((place) => !place.isChain && (mentions[place.id]?.blog?.titleHits ?? 0) >= 20 && !isAmbiguous(place.name))
    .sort((a, b) => estimateMentions(mentions[b.id].blog) - estimateMentions(mentions[a.id].blog))
    .filter((place) => {
      const key = brandKey(place.name);
      if (seen.has(key) || cache[key] !== undefined) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maxPlaces);
  console.log(`[trend] ${todo.length} places (${Math.ceil(todo.length / TREND_BATCH)} requests)`);

  const thisMonth = monthStart(new Date());
  const startDate = new Date(Date.UTC(thisMonth.getUTCFullYear(), thisMonth.getUTCMonth() - 18, 1));
  const lastFull = new Date(thisMonth.getTime() - DAY_MS); // last day of the previous month
  const iso = (date) => date.toISOString().slice(0, 10);
  const mean = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

  for (let i = 0; i < todo.length; i += TREND_BATCH) {
    const batch = todo.slice(i, i + TREND_BATCH);
    const body = {
      startDate: iso(startDate),
      endDate: iso(lastFull),
      timeUnit: "month",
      keywordGroups: [
        { groupName: "anchor", keywords: [TREND_ANCHOR] },
        ...batch.map((place) => ({ groupName: brandKey(place.name), keywords: [brandName(place.name)] })),
      ],
    };
    const response = await fetch(`${HUB}/search-trend/v1/search`, {
      method: "POST",
      headers: { ...hubHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.log(`  Trend ${response.status}: ${(await response.text()).slice(0, 100)} — stopping`);
      break;
    }
    const data = await response.json();
    const series = Object.fromEntries(data.results.map((result) => [result.title, result.data.map((row) => row.ratio)]));
    const anchorRecent = mean(series.anchor.slice(-3));
    for (const place of batch) {
      const values = series[brandKey(place.name)] ?? [];
      const recent = mean(values.slice(-3));
      const before = mean(values.slice(-15, -3));
      // level: this place's search volume against the anchor; ratio: recent vs the 12 months before.
      cache[brandKey(place.name)] = {
        kw: brandName(place.name),
        level: anchorRecent > 0 ? Number((recent / anchorRecent).toFixed(4)) : 0,
        ratio: before > 0 ? Number((recent / before).toFixed(3)) : null,
        recent: Number(recent.toFixed(4)),
      };
    }
    if ((i / TREND_BATCH) % 25 === 24) {
      writeJson(files.trend, cache);
      console.log(`  ${Math.min(i + TREND_BATCH, todo.length)}/${todo.length}`);
    }
    await sleep(150);
  }
  writeJson(files.trend, cache);
  console.log(`[trend] ${Object.keys(cache).length} places have a trend`);
}

// The places the app gets: this district's `top` places plus spots whose searches are surging
// (a new hot spot has few posts, and a branchy one such as 한정선 would otherwise sit in `chain`).
function curatedRows() {
  return readJson(files.report, []).filter(
    (row) =>
      row.verdict === "top" ||
      (row.hot === "surge" && !row.ambiguous && row.nameCheck !== "word" && row.verdict !== "review" && row.score !== null),
  );
}

// ---- stage 2d: name check (Gemini) ----------------------------------------------------------

// Title matching can't tell "브레이크타임" the café from "break time" the phrase. For places that
// would otherwise rank well, ask whether the posts are really about one venue of that name.
const VERIFY_PROMPT = [
  "너는 서울 식당·카페·술집 이름을 검수하는 편집자야.",
  "각 항목은 가게 이름과, 그 이름이 제목에 들어간 블로그·카페 글의 제목과 요약 발췌다.",
  `발췌가 서울 ${DISTRICT}의 특정 가게 한 곳(또는 그 가게의 지점들)을 다루면 venue,`,
  "이름이 일반 단어·표현으로 쓰였거나 다른 가게·지역·주제를 다루는 글이 대부분이면 word,",
  "판단하기 어려우면 unclear 로 답한다.",
].join("\n");

// Set once Gemini reports its daily free quota is used up.
let geminiQuotaOut = false;

// Token use of this run, printed on exit so the real cost can be worked out (Flash-Lite: $0.30 in / $2.50 out per 1M).
const geminiUsage = { calls: 0, prompt: 0, output: 0, thoughts: 0 };
// Spend guard: the running total (USD) is kept in gemini-spend.json and the pipeline stops BEFORE it passes
// the budget (GEMINI_BUDGET_USD, default 12), so an unexpected charge cannot happen unannounced.
const SPEND_FILE = path.join(CACHE_DIR, "gemini-spend.json");
const SPEND_BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "12");
const SPEND_MARGIN = 0.2; // stop a little early: the billing pipeline lags by about 10 minutes
let spentUsd = readJson(SPEND_FILE, { usd: 0 }).usd;
function overBudget() {
  if (spentUsd + SPEND_MARGIN < SPEND_BUDGET) return false;
  if (!geminiQuotaOut) {
    console.log(`  Gemini spend guard: $${spentUsd.toFixed(2)} of the $${SPEND_BUDGET} budget used — stopping before any extra charge. Raise GEMINI_BUDGET_USD to continue.`);
  }
  geminiQuotaOut = true;
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

async function geminiVerify(items) {
  if (geminiQuotaOut || overBudget()) return null;
  const body = items
    .map(({ place, entry }) => {
      const posts = (entry.blog?.snips ?? []).slice(0, 10).map((snip) => `- ${snip.t} | ${snip.d}`).join("\n");
      return `[${place.id}] ${place.name} (${place.kind}, ${place.category})\n${posts}`;
    })
    .join("\n\n");
  for (let attempt = 1; attempt <= 3; attempt++) {
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
                  id: { type: "STRING", enum: items.map(({ place }) => place.id) },
                  verdict: { type: "STRING", enum: ["venue", "word", "unclear"] },
                },
                required: ["id", "verdict"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (response.status === 402) {
      // Prepaid credits are used up: nothing succeeds until credits are bought, so stop like the daily quota does.
      console.log("  Gemini prepaid credits depleted (402) — buy credits in AI Studio, then run again.");
      geminiQuotaOut = true;
      process.exitCode = 2;
      return null;
    }
    if (response.status === 429 || response.status >= 500) {
      // A per-day quota cannot recover by waiting: stop the stage (exit code 2) instead of failing every batch.
      if (response.status === 429 && /per day/i.test(await response.text().catch(() => ""))) {
        geminiQuotaOut = true;
        process.exitCode = 2;
        return null;
      }
      await sleep(2000 * attempt);
      continue;
    }
    if (!response.ok) return null;
    try {
      const data = await response.json();
      countUsage(data);
      return JSON.parse(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch {
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
  const candidates = readJson(files.candidates, []);
  const mentions = readJson(files.naver, {});
  const cache = readJson(files.verify, {});
  const previous = Object.fromEntries(readJson(files.report, []).map((row) => [row.id, row.score]));
  const minScore = Number(arg("verify-min", "60"));
  // Only places that would rank well matter; with no earlier report, every place with real presence.
  const todo = candidates
    .filter((place) => {
      const entry = mentions[place.id];
      return (
        !place.isChain &&
        !isAmbiguous(place.name) &&
        entry?.blog?.snips?.length >= 3 &&
        cache[place.id] === undefined &&
        (previous[place.id] === undefined || previous[place.id] >= minScore)
      );
    })
    .map((place) => ({ place, entry: mentions[place.id] }));
  console.log(`[verify] ${todo.length} places (${Math.ceil(todo.length / 6)} Gemini calls)`);
  for (let i = 0; i < todo.length; i += 6) {
    const batch = todo.slice(i, i + 6);
    const result = await geminiVerify(batch).catch(() => null);
    if (!result) {
      if (geminiQuotaOut) {
        console.log("  Gemini daily quota used up — stopping; run again tomorrow.");
        break;
      }
      console.log(`  batch ${i / 6 + 1} failed — will retry on the next run`);
      continue;
    }
    for (const { place } of batch) cache[place.id] = result.find((row) => row.id === place.id)?.verdict ?? "unclear";
    if ((i / 6) % 20 === 19) writeJson(files.verify, cache);
    await sleep(300);
  }
  writeJson(files.verify, cache);
  const counts = Object.values(cache).reduce((acc, v) => ({ ...acc, [v]: (acc[v] ?? 0) + 1 }), {});
  console.log(`[verify] ${JSON.stringify(counts)}`);
}

// ---- stage 2c: tags (Gemini, closed vocabulary) -------------------------------------------

// Tag id → Korean label. The app will store ids only and translate labels per language.
// `kinds` limits where a tag may be used; `max` is how many a place can get from the group.
const TAG_GROUPS = {
  meal: {
    max: 2,
    kinds: ["food", "cafe", "bar"],
    tags: { brunch: "아침·브런치", lunch: "점심", dinner: "저녁", dessert: "간식·디저트", drinks: "술 한잔", latenight: "야식" },
  },
  cuisine: {
    max: 2,
    kinds: ["food"],
    tags: {
      korean: "한식", soup: "국밥·탕", grill: "고기·구이", noodle: "면", snack: "분식", japanese: "일식",
      western: "양식·파스타", chinese: "중식", asian: "아시안", seafood: "해산물", vegan: "비건·채식", course: "한정식·코스",
    },
  },
  cafeType: {
    max: 2,
    kinds: ["cafe"],
    tags: { coffee: "커피 전문", cake: "디저트·케이크", bakery: "베이글·빵", tea: "전통차·한옥카페", brunchcafe: "브런치 카페" },
  },
  barType: {
    max: 2,
    kinds: ["bar"],
    tags: { wine: "와인", cocktail: "칵테일", soju: "전통주·막걸리", beer: "맥주·펍", izakaya: "이자카야·포차" },
  },
  mood: {
    max: 2,
    kinds: ["food", "cafe", "bar"],
    tags: { quiet: "조용한", lively: "활기찬", aesthetic: "감성·인테리어", trendy: "힙한·트렌디", classic: "노포·오래된", hanok: "한옥·전통", view: "뷰 좋은" },
  },
  situation: {
    max: 2,
    kinds: ["food", "cafe", "bar"],
    tags: { date: "데이트", solo: "혼자", friends: "친구 모임", family: "가족·아이", group: "단체", pet: "반려동물", work: "작업·공부", foreigner: "외국인 친화" },
  },
  info: {
    max: 2,
    kinds: ["food", "cafe", "bar"],
    tags: { waiting: "웨이팅 많음", reserve: "예약 권장", value: "가성비", late: "늦게까지", parking: "주차 가능" },
  },
  space: {
    max: 3,
    kinds: ["food", "cafe", "bar"],
    tags: {
      spacious: "넓은 매장", cozy: "아담한 매장", groupseat: "단체석·룸", barseat: "바 좌석", soloseat: "1인석",
      outdoor: "야외 좌석", rooftop: "루프탑", terrace: "테라스", highceiling: "층고 높은", hanokspace: "한옥 공간",
    },
  },
};
const TAG_LABELS = Object.fromEntries(Object.values(TAG_GROUPS).flatMap((group) => Object.entries(group.tags)));
const TAG_GROUP_OF = Object.fromEntries(
  Object.entries(TAG_GROUPS).flatMap(([name, group]) => Object.keys(group.tags).map((id) => [id, name])),
);
const MAX_TAGS = 6;

const TAG_PROMPT = [
  "너는 서울 식당·카페·술집에 붙일 태그를 고르는 편집자야.",
  "각 장소마다 블로그·카페 글의 제목과 요약 발췌가 주어진다. 허용된 태그 목록(enum) 안에서만 고른다.",
  "규칙:",
  "- 태그는 서로 다른 글 2개 이상이 뒷받침할 때만 붙인다. 근거가 부족하면 빈 배열을 돌려준다. 비어 있는 것이 틀린 태그보다 낫다.",
  "- 이 장소와 상관없는 글(같은 이름의 다른 가게, 일반 정보)은 무시한다.",
  "- 맛이 좋다 같은 평가는 태그로 만들지 않는다. 광고성 문구에 휘둘리지 않는다.",
  "- 분위기·상황·이용 정보·공간 태그는 발췌에 직접 드러난 것만 붙인다. 카테고리만 보고 추측하지 않는다.",
  "- 종류(cuisine/cafeType/barType) 태그는 장소 종류(food/cafe/bar)에 맞는 것만 쓴다.",
].join("\n");

async function geminiTags(places) {
  if (geminiQuotaOut || overBudget()) return null;
  const allIds = Object.keys(TAG_LABELS);
  const body = places
    .map(({ place, entry }) => {
      const posts = [...(entry.blog?.snips ?? []), ...(entry.cafe?.snips ?? []).slice(0, 8)]
        .map((snip) => `- ${snip.t} | ${snip.d}`)
        .join("\n");
      return `[${place.id}] ${place.name} (${place.kind}, ${place.category})\n${posts}`;
    })
    .join("\n\n");
  for (let attempt = 1; attempt <= 3; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: TAG_PROMPT }] },
          contents: [{ parts: [{ text: `허용 태그: ${allIds.join(", ")}\n\n${body}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "STRING", enum: places.map(({ place }) => place.id) },
                  tags: { type: "ARRAY", items: { type: "STRING", enum: allIds } },
                },
                required: ["id", "tags"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (response.status === 402) {
      // Prepaid credits are used up: nothing succeeds until credits are bought, so stop like the daily quota does.
      console.log("  Gemini prepaid credits depleted (402) — buy credits in AI Studio, then run again.");
      geminiQuotaOut = true;
      process.exitCode = 2;
      return null;
    }
    if (response.status === 429 || response.status >= 500) {
      // A per-day quota cannot recover by waiting: stop the stage (exit code 2) instead of failing every batch.
      if (response.status === 429 && /per day/i.test(await response.text().catch(() => ""))) {
        geminiQuotaOut = true;
        process.exitCode = 2;
        return null;
      }
      await sleep(2000 * attempt);
      continue;
    }
    if (!response.ok) return null;
    const data = await response.json();
    countUsage(data);
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  return null;
}

// Keep only tags that fit the place's kind, respect each group's limit and the total limit.
function cleanTags(kind, tags) {
  const used = {};
  const kept = [];
  for (const id of [...new Set(tags)]) {
    const groupName = TAG_GROUP_OF[id];
    const group = groupName && TAG_GROUPS[groupName];
    if (!group || !group.kinds.includes(kind)) continue;
    used[groupName] = (used[groupName] ?? 0) + 1;
    if (used[groupName] > group.max) continue;
    kept.push(id);
  }
  return kept.slice(0, MAX_TAGS);
}

async function runTags() {
  if (!env.GEMINI_API_KEY) {
    console.log("[tags] GEMINI_API_KEY missing — skipped.");
    return;
  }
  const candidates = readJson(files.candidates, []);
  const mentions = readJson(files.naver, {});
  const cache = readJson(files.tags, {});
  const maxPlaces = Number(arg("tags-max", "5000"));
  const curated = args.includes("--curated") ? new Set(curatedRows().map((row) => row.id)) : null;
  // Only places with real evidence: at least 5 posts that name them.
  const todo = candidates
    .filter((place) => (!curated || curated.has(place.id)) && (curated || !place.isChain) && (mentions[place.id]?.blog?.titleHits ?? 0) >= 5 && mentions[place.id].blog.snips && cache[place.id] === undefined)
    .slice(0, maxPlaces)
    .map((place) => ({ place, entry: mentions[place.id] }));
  console.log(`[tags] ${todo.length} places (${Math.ceil(todo.length / 4)} Gemini calls)`);
  let done = 0;
  for (let i = 0; i < todo.length; i += 4) {
    const batch = todo.slice(i, i + 4);
    const result = await geminiTags(batch).catch(() => null);
    if (!result) {
      if (geminiQuotaOut) {
        console.log("  Gemini daily quota used up — stopping; run again tomorrow.");
        break;
      }
      console.log(`  batch ${i / 4 + 1} failed — will retry on the next run`);
      continue;
    }
    for (const { place } of batch) {
      const found = result.find((row) => row.id === place.id);
      cache[place.id] = { tags: cleanTags(place.kind, found?.tags ?? []) };
    }
    done += batch.length;
    if ((i / 4) % 25 === 24) {
      writeJson(files.tags, cache);
      console.log(`  ${done}/${todo.length}`);
    }
    await sleep(300);
  }
  writeJson(files.tags, cache);
  const tagged = Object.values(cache);
  console.log(
    `[tags] ${tagged.length} places tagged; ${tagged.filter((entry) => entry.tags.length === 0).length} left empty for lack of evidence`,
  );
}

// ---- stage 3: ratings (Google Places API, New) -------------------------------------

const normalize = (text) => text.toLowerCase().replace(/[\s\-·.()]/g, "");

function distanceM(aLat, aLng, bLat, bLng) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

async function runGoogle() {
  const key = env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.log("[google] GOOGLE_PLACES_API_KEY missing — skipped.");
    return;
  }
  const candidates = readJson(files.candidates, []);
  const mentions = readJson(files.naver, {});
  if (Object.keys(mentions).length === 0) {
    console.log("[google] no Naver mention counts yet — run the naver stage first (it picks who to look up).");
    return;
  }
  const cache = readJson(files.google, {});
  // Look up only the most-written-about places of each kind: that is where a rating decides
  // anything, and it keeps the paid calls few.
  const chosen = [];
  for (const kind of ["food", "cafe", "bar"]) {
    const ranked = candidates
      .filter((place) => place.kind === kind && !place.isChain && mentions[place.id] !== undefined)
      .sort((a, b) => mentions[b.id] - mentions[a.id])
      .slice(0, GOOGLE_TOP);
    chosen.push(...ranked);
  }
  const todo = chosen.filter((place) => cache[place.id] === undefined);
  console.log(`[google] ${todo.length} places to look up (${chosen.length - todo.length} cached)`);
  for (const place of todo) {
    const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "places.id,places.displayName,places.rating,places.userRatingCount,places.location",
      },
      body: JSON.stringify({
        textQuery: `${place.name} ${place.address}`,
        languageCode: "ko",
        maxResultCount: 3,
        locationBias: { circle: { center: { latitude: place.lat, longitude: place.lng }, radius: 200 } },
      }),
    });
    if (!response.ok) {
      console.log(`  Google ${response.status}: ${(await response.text()).slice(0, 140)} — stopping`);
      break;
    }
    const data = await response.json();
    // Accept only a result that is really the same place: close by, and the names overlap.
    const match = (data.places ?? []).find((result) => {
      const near = distanceM(place.lat, place.lng, result.location.latitude, result.location.longitude) <= 150;
      const a = normalize(place.name);
      const b = normalize(result.displayName?.text ?? "");
      return near && (a.includes(b) || b.includes(a) || a.slice(0, 3) === b.slice(0, 3));
    });
    cache[place.id] = match
      ? { rating: match.rating ?? null, reviews: match.userRatingCount ?? 0, googleName: match.displayName?.text }
      : { rating: null, reviews: 0, googleName: null };
    await sleep(150);
  }
  writeJson(files.google, cache);
  console.log(`[google] ${Object.keys(cache).length} places have a Google result (or a confirmed miss)`);
}

// ---- stage 4: score ----------------------------------------------------------------

// SIGNAL (no Google needed):
//   base    = 70 × (0.65 × blogPercentile + 0.35 × cafePercentile)       percentile within the kind
//             blog count is first reduced by the share of ad-marked posts
//   − 20 × adRate                                                         extra deduction for ad-heavy places
//   + up to 24 for searches: growth of the last 3 months vs the 12 before (14) and search volume (10)
//   + up to 6 for news coverage (when the news API is enabled)
//   (base is scaled to 70 so the three parts add up to 100 without being clipped)
//   − 10 when an AI name check is unclear; "word" (an everyday phrase, not a venue) goes to review
//   − 10 when the newest post naming the place is older than ~18 months (possibly closed)
// With Google data the final score is 0.55 × rating + 0.45 × signal (see top of file).

function percentileRanks(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return (value) => {
    if (sorted.length <= 1) return 0.5;
    let below = 0;
    while (below < sorted.length && sorted[below] < value) below += 1;
    return below / (sorted.length - 1);
  };
}

const clamp01 = (value) => Math.min(1, Math.max(0, value));
const STALE_DAYS = 540;
// A name that is also an everyday word (or just a category) can't be told apart from ordinary
// posts by title matching, so those places go to a human check instead of the ranking.
const GENERIC_NAME = /맛집|술집|식당$|밥집|카페$|커피$|한식|분식|고깃집|주점|호프|포차|^[가-힣]{1,2}집$/;
// Brand size in Seoul (see the brands stage): 1 = one-off, 2-5 = small local group (a hot spot that
// opened a few more, still ranked normally), 6+ = franchise (listed, tagged, never ranked "top").
const SMALL_GROUP_MAX = 5;
const isAmbiguous = (name) => {
  const squashed = name.replace(/\s+/g, "");
  return [...squashed].length <= 2 || GENERIC_NAME.test(squashed);
};

function runScore() {
  const candidates = readJson(files.candidates, []);
  const mentions = readJson(files.naver, {});
  const trends = readJson(files.trend, {});
  const brands = readJson(files.brands, {});
  const tagCache = readJson(files.tags, {});
  const nameChecks = readJson(files.verify, {});
  const google = readJson(files.google, {});
  if (!Object.values(mentions).some((entry) => entry.blog)) {
    console.log("[score] no mention counts yet — nothing to score (run the naver stage).");
    return;
  }
  const staleBefore = ymd(Date.now() - STALE_DAYS * DAY_MS);
  const levelRank = percentileRanks(Object.values(trends).map((trend) => trend.level));
  const rows = [];
  for (const kind of ["food", "cafe", "bar"]) {
    const pool = candidates.filter((place) => place.kind === kind && !place.isChain && mentions[place.id]?.blog);
    const adRateOf = (blog) => (blog.titleHits >= 5 ? blog.adHits / blog.titleHits : 0);
    const brandCount = (place) => brands[brandKey(place.name)] ?? 1;
    // Several branches share one name, so count only the posts that also name this branch's dong.
    const branchBlog = (place) => {
      const blog = mentions[place.id].blog;
      return { total: blog.total, titleHits: brandCount(place) >= 2 ? blog.dongHits : blog.titleHits };
    };
    const blogAdjusted = (place) => estimateMentions(branchBlog(place)) * (1 - adRateOf(mentions[place.id].blog));
    const cafeCount = (place) => estimateMentions(mentions[place.id].cafe);
    const blogRank = percentileRanks(pool.map((place) => Math.log10(1 + blogAdjusted(place))));
    const cafeRank = percentileRanks(pool.map((place) => Math.log10(1 + cafeCount(place))));

    const kindRows = pool.map((place) => {
      const { blog, cafe, news } = mentions[place.id];
      const trend = trends[brandKey(place.name)];
      const adRate = adRateOf(blog);
      const blogPct = blogRank(Math.log10(1 + blogAdjusted(place)));
      const cafePct = cafe ? cafeRank(Math.log10(1 + cafeCount(place))) : 0;
      // 70 for how much it is written about, up to 24 for searches, 6 for news: 100 only with all three.
      const base = 70 * (0.65 * blogPct + 0.35 * cafePct);
      const adPenalty = -20 * adRate;
      // A new hot spot has few posts so far, so what people search now counts for up to 24 points:
      // 14 for how fast searches grew (4x = full), 10 for how much it is searched at all.
      const trendBonus =
        trend && trend.recent >= 0.2
          ? 14 * clamp01(Math.log2(Math.max(trend.ratio ?? 1, 1)) / 2) + 10 * levelRank(trend.level)
          : 0;
      const hot = !trend || trend.recent < 0.2 ? null : trend.ratio >= 2 ? "surge" : trend.ratio >= 1.3 ? "rising" : trend.ratio < 0.7 ? "falling" : "steady";
      const newsBonus = news ? (news.titleHits >= 8 ? 6 : news.titleHits >= 3 ? 4 : news.titleHits >= 1 ? 2 : 0) : 0;
      const stale = blog.titleHits >= 3 && blog.newest !== null && blog.newest < staleBefore;
      const nameCheck = nameChecks[place.id] ?? null;
      const signal = Math.min(
        100,
        Math.max(0, base + adPenalty + trendBonus + newsBonus - (stale ? 10 : 0) - (nameCheck === "unclear" ? 10 : 0)),
      );

      const g = google[place.id];
      let adjusted = null;
      let score = Math.round(signal);
      if (g?.rating) {
        adjusted = (g.reviews * g.rating + PRIOR_WEIGHT * PRIOR_RATING) / (g.reviews + PRIOR_WEIGHT);
        score = Math.round(100 * (0.55 * clamp01((adjusted - 3.6) / 1.2) + 0.45 * (signal / 100)));
      }
      return {
        g,
        row: {
          id: place.id,
          name: place.name,
          kind,
          dong: place.dong,
          category: place.category,
          address: place.address,
          score,
          verdict: "",
          blogPosts: estimateMentions(branchBlog(place)),
          titleHits: blog.titleHits,
          dongHits: blog.dongHits,
          brandCount: brandCount(place),
          tier: brandCount(place) > SMALL_GROUP_MAX ? "chain" : brandCount(place) > 1 ? "small-group" : "single",
          adRate: Number(adRate.toFixed(2)),
          cafePosts: cafe ? estimateMentions(cafe) : null,
          newsHits: news?.titleHits ?? null,
          hot,
          nameCheck,
          tags: (tagCache[place.id]?.tags ?? []).map((id) => TAG_LABELS[id]).join(" "),
          tagIds: tagCache[place.id]?.tags ?? null,
          trendRatio: trend?.ratio ?? null,
          trendLevel: trend?.level ?? null,
          newestPost: blog.newest,
          stale,
          ambiguous: isAmbiguous(place.name),
          sameNameCount: 1,
          googleRating: g?.rating ?? null,
          googleReviews: g?.reviews ?? null,
          adjustedRating: adjusted ? Number(adjusted.toFixed(2)) : null,
          url: place.url,
        },
      };
    });

    const scoreRank = percentileRanks(kindRows.map(({ row }) => row.score));
    for (const { row, g } of kindRows) {
      row.verdict =
        g === undefined
          ? row.tier === "chain"
            ? "chain"
            : row.ambiguous || row.nameCheck === "word"
            ? "review"
            : scoreRank(row.score) >= MENTION_ONLY_TOP
              ? "top"
              : "low"
          : !g.rating
            ? "no-google-match"
            : g.rating >= MIN_RATING && g.reviews >= MIN_REVIEWS && row.score >= MIN_SCORE
              ? "pass"
              : "fail";
      rows.push(row);
    }
  }
  for (const place of candidates.filter((candidate) => candidate.isChain)) {
    rows.push({
      id: place.id, name: place.name, address: place.address, kind: place.kind, dong: place.dong,
      category: place.category, score: null, verdict: "chain", tier: "chain", brandCount: null,
      blogPosts: 0, url: place.url,
    });
  }
  rows.sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || b.blogPosts - a.blogPosts);
  // Same exact name more than once: kept as separate places, the count is shown for the reviewer.
  const sameName = new Map();
  for (const row of rows) {
    const key = row.name.replace(/\s+/g, "").toLowerCase();
    const group = sameName.get(key) ?? [];
    group.push(row);
    sameName.set(key, group);
  }
  for (const group of sameName.values()) {
    for (const row of group) row.sameNameCount = group.length;
  }
  writeJson(files.report, rows);
  const csvCols = [
    "name", "address", "kind", "dong", "category", "score", "verdict", "tags", "blogPosts", "titleHits", "adRate", "cafePosts",
    "newsHits", "hot", "nameCheck", "trendRatio", "trendLevel", "newestPost", "stale", "ambiguous", "tier", "brandCount", "dongHits", "sameNameCount", "googleRating", "googleReviews", "url",
  ];
  const csvCell = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  writeFileSync(
    files.report.replace(/\.json$/, ".csv"),
    "﻿" + [csvCols.join(","), ...rows.map((r) => csvCols.map((c) => csvCell(r[c])).join(","))].join("\n"),
  );
  const count = (verdict) => rows.filter((row) => row.verdict === verdict).length;
  console.log(
    `[score] ${rows.length} scored places; top ${count("top")}, review ${count("review")}, chain ${count("chain")}, low ${count("low")}, pass ${count("pass")}, fail ${count("fail")}, ` +
      `no Google match ${count("no-google-match")}; stale ${rows.filter((r) => r.stale).length}, ambiguous ${rows.filter((r) => r.ambiguous).length}`,
  );
  for (const row of rows.slice(0, 30)) {
    console.log(
      `  ${String(row.score ?? "-").padStart(3)} ${row.verdict.padEnd(6)} ${row.kind.padEnd(4)} ${row.dong.padEnd(5)} ` +
        `${row.name}  (blog ${row.blogPosts}, ad ${row.adRate}, cafe ${row.cafePosts ?? "-"}, trend ${row.trendRatio ?? "-"})`,
    );
  }
  console.log(`  full report: ${path.relative(ROOT, files.report)}`);
}

// ---- stage 5: export for the app ------------------------------------------------------------

const KIND_CATEGORY = { food: "식당", cafe: "카페", bar: "술집" };
const KIND_MINUTES = { food: 60, cafe: 45, bar: 90 };

// Writes src/features/mobile/dining-data/<code>.json: no ratings, no post text — only what we made
// ourselves (tags, our own popularity band) plus the Kakao place id/coordinates for a map link.
function runExport() {
  const candidates = Object.fromEntries(readJson(files.candidates, []).map((place) => [place.id, place]));
  const tagCache = readJson(files.tags, {});
  const rows = curatedRows();
  const out = rows.map((row) => {
    const place = candidates[row.id];
    const tagIds = tagCache[row.id]?.tags ?? [];
    const labels = tagIds.map((id) => TAG_LABELS[id]);
    const fallback = place.category.split(">").pop().trim();
    return {
      id: `dining-${DISTRICT_CODE}-${row.id}`,
      name: place.name,
      category: KIND_CATEGORY[row.kind],
      area: DISTRICT,
      address: place.address,
      description: (labels.length > 0 ? labels.slice(0, 4) : [fallback]).join(" · "),
      duration: `${KIND_MINUTES[row.kind]}분`,
      fee: "정보 없음",
      tags: labels.slice(0, 3),
      hours: "정보 없음",
      savedBy: Math.round((row.score ?? 0) * 10),
      lat: place.lat,
      lng: place.lng,
      source: "dining",
      dining: {
        tagIds,
        pop: (row.score ?? 0) >= 75 ? "high" : "mid",
        hot: row.hot ?? null,
        kakaoUrl: place.url,
      },
    };
  });
  // One app file per district; the app loads a district only when a course needs it.
  const target = path.join(DINING_DATA_DIR, `${DISTRICT_CODE}.json`);
  mkdirSync(DINING_DATA_DIR, { recursive: true });
  writeFileSync(target, JSON.stringify(out), "utf8");
  const count = (category) => out.filter((place) => place.category === category).length;
  console.log(
    `[export] ${DISTRICT}: ${out.length} places → ${path.relative(ROOT, target)} (식당 ${count("식당")}, 카페 ${count("카페")}, 술집 ${count("술집")}; ${out.filter((place) => place.dining.tagIds.length > 0).length} tagged)`,
  );
}

// ---- main --------------------------------------------------------------------------

const wants = (stage) => STAGE === "all" || STAGE === stage;
if (wants("candidates")) await runCandidates();
if (wants("naver")) await runNaver();
if (wants("brands")) await runBrands();
if (wants("trend")) await runTrend();
if (wants("verify")) await runVerify();
if (wants("tags")) await runTags();
if (wants("google")) await runGoogle();
if (wants("score")) runScore();
if (STAGE === "export") runExport();
