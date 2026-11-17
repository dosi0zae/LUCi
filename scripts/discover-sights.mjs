// Finds the sightseeing places people actually write about in a district, to fill what Kakao's categories
// miss (the big parks, markets, streets) before the evidence stages sort everything out.
//
//   posts   — Naver blog search (API HUB) for "<구> 가볼만한 곳", "<구> 명소" … and for the busiest 동:
//             titles and short summaries only. Counts against the same daily search quota as the dining
//             pipeline (scripts/.cache/hub-usage.json) and stops at 99 %.
//   extract — Gemini reads the posts in batches and lists the named places each one is about (not
//             restaurants / cafés / hotels / cinemas / malls). Names are counted across posts: how many
//             different posts name a place is the first evidence of how much it is visited.
//   resolve — each frequent name is looked up with the Kakao Local keyword search and kept only if it has an
//             address in the district: that gives it an id, a category and coordinates.
//
//   node scripts/discover-sights.mjs --district 마포구                  # all three stages, resuming from cache
//   node scripts/discover-sights.mjs --district 마포구 --stage resolve
//   node scripts/discover-sights.mjs --selftest                         # extract + resolve on built-in samples,
//                                                                       # writes nothing (no Naver calls)
//
// Everything goes to scripts/.cache/ (gitignored). The Gemini spend guard is the dining pipeline's
// (gemini-spend.json, GEMINI_BUDGET_USD, default 12).

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");
mkdirSync(CACHE_DIR, { recursive: true });

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
const SELFTEST = args.includes("--selftest");
const DISTRICT = SELFTEST ? "마포구" : arg("district", "");
const STAGE = arg("stage", "all");
if (!DISTRICT) {
  console.error("usage: node scripts/discover-sights.mjs --district <구> [--stage posts|extract|resolve]");
  process.exit(1);
}

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const writeJson = (file, data) => writeFileSync(file, JSON.stringify(data, null, 1), "utf8");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const squash = (text) => text.replace(/<[^>]+>/g, "").replace(/\s+/g, "").toLowerCase();
const plain = (text) =>
  text.replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

const files = {
  posts: path.join(CACHE_DIR, `sights-${DISTRICT}-posts.json`),
  names: path.join(CACHE_DIR, `sights-${DISTRICT}-names.json`),
  resolved: path.join(CACHE_DIR, `sights-${DISTRICT}-resolved.json`),
};

// ---- stage 1: posts (Naver blog search via API HUB) ----------------------------------

const HUB = "https://naverapihub.apigw.ntruss.com";
const DAILY_LIMIT = 25_000;
const STOP_AT = Math.floor(DAILY_LIMIT * 0.99);
const usageFile = path.join(CACHE_DIR, "hub-usage.json");
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const searchCallsToday = () => {
  const usage = readJson(usageFile, {});
  return usage.date === kstToday() ? usage.calls : 0;
};
const countSearchCall = () => writeJson(usageFile, { date: kstToday(), calls: searchCallsToday() + 1 });

async function blogSearch(query, start) {
  const url = `${HUB}/search/v1/blog?query=${encodeURIComponent(query)}&display=100&start=${start}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    if (searchCallsToday() >= STOP_AT) return { error: "daily limit" };
    countSearchCall();
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

const QUERY_TOPICS = ["가볼만한 곳", "명소", "관광", "데이트 코스", "산책", "전시", "박물관", "미술관", "공원", "시장", "전망", "역사 유적"];
// Posts that are paid placements are skipped: they name what was paid for, not what people visit.
const AD_PATTERN = /광고|협찬|체험단|제공받|원고료|소정의|지원받|서포터즈|파트너스/;

function topDongs() {
  const file = path.join(CACHE_DIR, `food-${DISTRICT}-candidates.json`);
  const candidates = readJson(file, []);
  const count = {};
  for (const place of candidates) if (place.dong) count[place.dong] = (count[place.dong] ?? 0) + 1;
  return Object.entries(count)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([dong]) => dong.replace(/동$/, ""))
    .filter((stem) => stem.length >= 2);
}

async function runPosts() {
  if (!env.NAVER_CLIENT_ID || !env.NAVER_CLIENT_SECRET) {
    console.error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET missing in .env.local");
    process.exit(1);
  }
  const stem = DISTRICT.replace(/구$/, "");
  // (query, start) pairs; the two broadest topics get a second page.
  const jobs = [];
  for (const topic of QUERY_TOPICS) {
    jobs.push([`${DISTRICT} ${topic}`, 1]);
    if (topic === "가볼만한 곳" || topic === "명소") jobs.push([`${DISTRICT} ${topic}`, 101]);
  }
  for (const dong of topDongs()) jobs.push([`${dong} 가볼만한 곳`, 1]);

  const store = readJson(files.posts, { done: [], posts: {} });
  let calls = 0;
  for (const [query, start] of jobs) {
    const jobKey = `${query}|${start}`;
    if (store.done.includes(jobKey)) continue;
    const data = await blogSearch(query, start);
    if (data.error) {
      writeJson(files.posts, store);
      console.log(`[posts] STOPPED (${data.error}) after ${calls} calls; ${Object.keys(store.posts).length} posts saved. Run again to continue.`);
      process.exitCode = 2;
      return;
    }
    calls += 1;
    for (const item of data.items ?? []) {
      const title = plain(item.title);
      const desc = plain(item.description ?? "");
      if (AD_PATTERN.test(`${title} ${desc}`)) continue;
      store.posts[item.link] = { t: title.slice(0, 90), d: desc.slice(0, 120), q: query };
    }
    store.done.push(jobKey);
    writeJson(files.posts, store);
    await sleep(120);
  }
  console.log(`[posts] ${DISTRICT} (${stem}): ${Object.keys(store.posts).length} posts from ${store.done.length} searches (${calls} calls this run, ${searchCallsToday()} today)`);
}

// ---- stage 2: extract place names (Gemini) -------------------------------------------

const SPEND_FILE = path.join(CACHE_DIR, "gemini-spend.json");
const SPEND_BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "12");
const SPEND_MARGIN = 0.2;
let spentUsd = readJson(SPEND_FILE, { usd: 0 }).usd;
const usage = { calls: 0, prompt: 0, output: 0, thoughts: 0 };
let stopGemini = false;

function overBudget() {
  if (spentUsd + SPEND_MARGIN < SPEND_BUDGET) return false;
  if (!stopGemini) console.log(`  Gemini spend guard: $${spentUsd.toFixed(2)} of $${SPEND_BUDGET} used — stopping. Raise GEMINI_BUDGET_USD to continue.`);
  stopGemini = true;
  process.exitCode = 2;
  return true;
}
function countUsage(data) {
  const meta = data?.usageMetadata ?? {};
  usage.calls += 1;
  usage.prompt += meta.promptTokenCount ?? 0;
  usage.output += meta.candidatesTokenCount ?? 0;
  usage.thoughts += meta.thoughtsTokenCount ?? 0;
  spentUsd += ((meta.promptTokenCount ?? 0) * 0.3 + ((meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0)) * 2.5) / 1e6;
  if (!SELFTEST) writeJson(SPEND_FILE, { usd: Number(spentUsd.toFixed(4)) });
}
process.on("exit", () => {
  if (usage.calls > 0) {
    const cost = (usage.prompt * 0.3 + (usage.output + usage.thoughts) * 2.5) / 1e6;
    console.log(`[gemini] ${usage.calls} calls, in ${usage.prompt}, out ${usage.output}, thinking ${usage.thoughts} tokens = about $${cost.toFixed(3)}`);
  }
});

const EXTRACT_PROMPT = (district) => `You read blog post titles and summaries about places to visit in Seoul's ${district}.
For each numbered post, list the named PLACES TO VISIT that the post is about (at most 5), as a visitor would search for them.
Include: palaces, museums, galleries, parks, gardens, markets, viewpoints, landmarks, historic sites, streets and neighbourhoods that are themselves destinations (e.g. "경의선숲길", "망원시장", "홍대걷고싶은거리"), performance venues of note, festivals' venues.
Exclude: restaurants, cafés, bars, hotels, cinemas, shopping malls, shops, classes, clinics, and generic words ("산책", "데이트", "맛집"), and places outside ${district}.
Write each name in its common official form, without branch words, adjectives or promotional text. If a post names no real place, return an empty list for it.`;

async function geminiExtract(batch) {
  if (stopGemini || overBudget()) return null;
  const body = batch.map((post, i) => `[${i}] ${post.t} | ${post.d}`).join("\n");
  const MAX_ATTEMPTS = 5;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: EXTRACT_PROMPT(DISTRICT) }] },
          contents: [{ parts: [{ text: body }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: { i: { type: "INTEGER" }, places: { type: "ARRAY", items: { type: "STRING" } } },
                required: ["i", "places"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(60_000),
      },
    );
    if (response.status === 402) {
      console.log("  Gemini prepaid credits depleted (402).");
      stopGemini = true;
      process.exitCode = 2;
      return null;
    }
    if (response.status === 429 || response.status >= 500) {
      if (response.status === 429 && /per day/i.test(await response.text().catch(() => ""))) {
        stopGemini = true;
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
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]");
    } catch (error) {
      console.log(`  Gemini reply could not be read: ${error instanceof Error ? error.message : error}`);
      return null;
    }
  }
  return null;
}

const SAMPLE_POSTS = [
  { t: "마포구 가볼만한 곳 경의선숲길 산책 코스", d: "연남동에서 시작해 홍대입구까지 이어지는 경의선숲길을 걸었어요" },
  { t: "서울 하늘공원 억새 보러 월드컵공원 다녀왔어요", d: "가을이면 하늘공원 억새가 장관이에요. 맹꽁이전기차도 탔어요" },
  { t: "망원시장 먹거리 투어 후기", d: "망원시장에서 호떡이랑 닭강정 먹고 망원한강공원에서 쉬었어요" },
  { t: "합정 맛집 베스트 5 협찬 없이 솔직후기", d: "합정역 근처 파스타 맛집을 다녀왔습니다" },
  { t: "홍대 걷고싶은거리 데이트 코스 추천", d: "홍대걷고싶은거리와 레드로드를 따라 구경하고 마포아트센터에서 공연도 봤어요" },
  { t: "주말 서울 나들이 문화비축기지 전시 관람", d: "문화비축기지에서 전시를 보고 근처 노을공원까지 걸었어요" },
];

// A name, normalised to compare across posts ("서울 경의선숲길" == "경의선숲길").
const nameKey = (name) => squash(name).replace(new RegExp(`^서울(시)?${DISTRICT.replace(/구$/, "")}구?`), "").replace(/^서울(시)?/, "");

async function runExtract(posts, { write }) {
  const list = posts ?? Object.entries(readJson(files.posts, { posts: {} }).posts).map(([link, post]) => ({ link, ...post }));
  if (list.length === 0) {
    console.error("No posts yet: run the posts stage first.");
    return null;
  }
  const done = write ? readJson(files.names, { doneLinks: [], names: {} }) : { doneLinks: [], names: {} };
  const doneSet = new Set(done.doneLinks);
  const todo = list.filter((post) => !doneSet.has(post.link ?? post.t));
  const BATCH = 25;
  for (let start = 0; start < todo.length; start += BATCH) {
    const batch = todo.slice(start, start + BATCH);
    const result = await geminiExtract(batch);
    if (!result) {
      console.log(`[extract] stopped at ${start}/${todo.length}; progress saved.`);
      break;
    }
    for (const row of result) {
      const post = batch[row.i];
      if (!post) continue;
      for (const raw of row.places ?? []) {
        const name = raw.trim();
        const key = nameKey(name);
        if (key.length < 2) continue;
        const entry = (done.names[key] ??= { name, posts: 0, samples: [] });
        entry.posts += 1;
        if (entry.samples.length < 3) entry.samples.push(post.t);
      }
    }
    for (const post of batch) done.doneLinks.push(post.link ?? post.t);
    if (write) writeJson(files.names, done);
  }
  const ranked = Object.values(done.names).sort((a, b) => b.posts - a.posts);
  console.log(`[extract] ${ranked.length} distinct names from ${done.doneLinks.length} posts; named in 2+ posts: ${ranked.filter((entry) => entry.posts >= 2).length}`);
  return ranked;
}

// ---- stage 3: resolve names to places (Kakao keyword search) -------------------------

async function kakaoKeyword(query) {
  const params = new URLSearchParams({ query, size: "5" });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
    });
    if (response.ok) {
      await sleep(60);
      return response.json();
    }
    if (response.status === 429 || response.status >= 500) {
      await sleep(500 * attempt);
      continue;
    }
    return { documents: [] };
  }
  return { documents: [] };
}

// Cafés, restaurants and the like are not what this layer is for, even when the name matches.
const NOT_A_SIGHT = /음식점|카페|술집|호텔|숙박|영화관|백화점|대형마트|편의점|병원|학원|지하철|전철|주차장|버스/;

async function resolveName(entry) {
  const data = await kakaoKeyword(`서울 ${DISTRICT} ${entry.name}`);
  const key = nameKey(entry.name);
  const docs = (data.documents ?? []).filter((doc) => (doc.address_name ?? "").includes(`서울 ${DISTRICT}`) && !NOT_A_SIGHT.test(doc.category_name ?? ""));
  const pick = docs.find((doc) => squash(doc.place_name) === key) ?? docs.find((doc) => squash(doc.place_name).includes(key) || key.includes(squash(doc.place_name)));
  return pick
    ? {
        id: pick.id,
        name: pick.place_name,
        category: (pick.category_name ?? "").split(" > ").slice(1).join(" > "),
        address: pick.road_address_name || pick.address_name,
        lat: Number(pick.y),
        lng: Number(pick.x),
        url: pick.place_url,
      }
    : null;
}

async function runResolve(ranked, { write, min }) {
  if (!env.KAKAO_REST_API_KEY) {
    console.error("KAKAO_REST_API_KEY missing in .env.local");
    return;
  }
  const out = [];
  let found = 0;
  for (const entry of ranked.filter((item) => item.posts >= min).slice(0, 400)) {
    const kakao = await resolveName(entry);
    if (kakao) found += 1;
    out.push({ ...entry, kakao });
  }
  if (write) writeJson(files.resolved, out);
  console.log(`[resolve] ${found} of ${out.length} names matched a place in ${DISTRICT}`);
  return out;
}

// ---- run -----------------------------------------------------------------------------

if (SELFTEST) {
  console.log("[selftest] built-in sample posts, nothing is written");
  const ranked = await runExtract(SAMPLE_POSTS, { write: false });
  const resolved = ranked ? await runResolve(ranked, { write: false, min: 1 }) : null;
  for (const row of resolved ?? []) {
    console.log(`  ${String(row.posts).padStart(2)}  ${row.name}  ->  ${row.kakao ? `${row.kakao.name} | ${row.kakao.category} | ${row.kakao.address}` : "(no match)"}`);
  }
} else {
  if (STAGE === "all" || STAGE === "posts") await runPosts();
  if (process.exitCode === 2 && (STAGE === "all" || STAGE === "posts")) process.exit(2);
  let ranked = null;
  if (STAGE === "all" || STAGE === "extract") ranked = await runExtract(null, { write: true });
  if (STAGE === "all" || STAGE === "resolve") {
    const names = ranked ?? Object.values(readJson(files.names, { names: {} }).names).sort((a, b) => b.posts - a.posts);
    await runResolve(names, { write: true, min: 2 });
  }
}
