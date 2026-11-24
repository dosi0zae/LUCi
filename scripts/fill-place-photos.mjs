// Stage 2 of the place-photo work: finds a photo for the sights that have none, from sources that allow it, and keeps only a
// photo that really is of the place.
//
//   node scripts/fill-place-photos.mjs --limit 150          # try the 150 best-known sights without a photo (resumes)
//   node scripts/fill-place-photos.mjs --limit 150 --write  # and put the photos that passed into seoul-places.json
//   node scripts/fill-place-photos.mjs --commons --limit 300 --write   # stage 3: Wikimedia Commons by position and by name
//
// Sources (nothing else): the Korea Tourism Organization's TourAPI (photos of the "공공누리 1유형" licence: free to use with the
// source named), and Wikimedia Commons through the Korean Wikipedia (CC BY, CC BY-SA, CC0 or public domain; never NC or ND), each
// found by the place's name AND its position (a place with the same name somewhere else is not taken). Every candidate is then
// looked at by Gemini together with the place's facts, as in audit-place-photos.mjs; the best one that is "yes, this place" and
// scores 6 or more is kept, and its credit text (source and licence) goes with it. No photo is better than a wrong one.
//
// State: scripts/.cache/photo-fill.json (id -> result). A TourAPI daily limit stops the run; it resumes the next day.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const COMMONS = args.includes("--commons");
// Stage 4 (--naver): for the sights the first stages found nothing for, Naver image search (the way the dining photos were
// found), each picture looked at by Gemini. Other people's pictures with no licence: an alpha-only choice by the owner, to be
// replaced before a public launch. Stricter than the dining photos, because a wrong photo for a sight is easy to see: the
// picture's own title must carry the sight's name, and the judge must say it is that place with a score of 7 or more.
const NAVER = args.includes("--naver");
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const PLACES_FILE = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
const STATE_FILE = path.join(CACHE, NAVER ? "photo-fill-naver.json" : COMMONS ? "photo-fill-commons.json" : "photo-fill.json");
const FIRST_STATE_FILE = path.join(CACHE, "photo-fill.json");
const REPORT_FILE = path.join(CACHE, NAVER ? "photo-fill-naver.html" : COMMONS ? "photo-fill-commons.html" : "photo-fill.html");
const USAGE_FILE = path.join(CACHE, "hub-usage.json");
const SPEND_FILE = path.join(CACHE, "gemini-spend.json");
const WRITE = args.includes("--write");
// Stage 3 (--commons): for the places the first stage found nothing for, look in Wikimedia Commons directly: the photos taken
// near the place's position, and the files that carry its name. Same licences, same picture test; its own state file.
const LIMIT = Number(args[args.indexOf("--limit") + 1]) || 100;

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq !== -1) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}
const TOUR_KEY = decodeURIComponent(env.TOURAPI_SERVICE_KEY ?? "");
const TOUR = "https://apis.data.go.kr/B551011/KorService2";
const MIN_SCORE = 6;
const MAX_KM = 1.2;
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "17");
let spent = readJson(SPEND_FILE, { usd: 0 }).usd;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const places = readJson(PLACES_FILE, []);
const state = readJson(STATE_FILE, {});

function haversineKm(a, b) {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
// "서울 탑골공원" and "탑골공원 (파고다공원)" meet at "탑골공원": spaces, brackets and a leading "서울" do not count.
const nameKey = (name) => name.replace(/\(.*?\)|（.*?）/g, "").replace(/^서울\s*/, "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
function namesMatch(a, b) {
  const x = nameKey(a);
  const y = nameKey(b);
  if (x.length < 2 || y.length < 2) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length >= 3 && long.includes(short) && short.length / long.length >= 0.6;
}

// ---- candidates ---------------------------------------------------------------------------------------------------

let tourStopped = false;
async function tour(pathName, extra) {
  const params = new URLSearchParams({ serviceKey: TOUR_KEY, MobileOS: "ETC", MobileApp: "TripChain", _type: "json", ...extra });
  const response = await fetch(`${TOUR}/${pathName}?${params}`, { signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  try {
    const data = JSON.parse(text);
    const code = data?.response?.header?.resultCode;
    if (code && code !== "0000" && code !== "03") {
      if (/LIMITED|EXCEEDS|22/.test(String(data.response.header.resultMsg) + code)) tourStopped = true;
      return null;
    }
    return data?.response?.body?.items?.item ?? [];
  } catch {
    if (/LIMITED_NUMBER|EXCEEDS|SERVICE_KEY/i.test(text)) tourStopped = true;
    return null;
  }
}
const asList = (value) => (Array.isArray(value) ? value : value ? [value] : []);

async function tourCandidates(place) {
  // No area filter: it drops most of Seoul's own entries. The name and the position decide.
  const found = asList(await tour("searchKeyword2", { keyword: place.name.replace(/\(.*?\)/g, "").replace(/^서울\s*/, "").trim(), numOfRows: "10", pageNo: "1" }));
  const near = found.filter((item) => {
    if (!namesMatch(place.name, item.title ?? "")) return false;
    const lat = Number(item.mapy);
    const lng = Number(item.mapx);
    if (Number.isFinite(lat) && Number.isFinite(lng) && lat > 0 && lng > 0) return haversineKm(place, { lat, lng }) <= MAX_KM;
    // No position on the entry: only a Seoul address will do.
    return String(item.addr1 ?? "").includes("서울");
  });
  const out = [];
  for (const item of near.slice(0, 2)) {
    if (item.firstimage && item.cpyrhtDivCd === "Type1") out.push({ url: item.firstimage, source: "tourapi", credit: "한국관광공사 · 공공누리 제1유형" });
    const images = asList(await tour("detailImage2", { contentId: item.contentid, imageYN: "Y", numOfRows: "6", pageNo: "1" }));
    for (const image of images) {
      if (image.cpyrhtDivCd === "Type1" && image.originimgurl) out.push({ url: image.originimgurl.replace(/^http:/, "https:"), source: "tourapi", credit: "한국관광공사 · 공공누리 제1유형" });
    }
  }
  return [...new Map(out.map((c) => [c.url, c])).values()].slice(0, 4);
}

const WIKI_LICENCE_OK = /^(CC BY(-SA)?( |$)|CC0|Public domain|PD)/i;
async function wikiCandidates(place) {
  const url = `https://ko.wikipedia.org/w/api.php?action=query&format=json&generator=geosearch&ggscoord=${place.lat}%7C${place.lng}&ggsradius=600&ggslimit=6&prop=pageimages&piprop=name&origin=*`;
  const geo = await (await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null))?.json().catch(() => null);
  const pages = Object.values(geo?.query?.pages ?? {}).filter((page) => namesMatch(place.name, page.title) && page.pageimage);
  const out = [];
  for (const page of pages.slice(0, 2)) {
    const info = await (
      await fetch(
        `https://commons.wikimedia.org/w/api.php?action=query&format=json&titles=${encodeURIComponent("File:" + page.pageimage)}&prop=imageinfo&iiprop=url%7Cextmetadata%7Csize&iiurlwidth=1000&origin=*`,
        { signal: AbortSignal.timeout(20_000) },
      ).catch(() => null)
    )
      ?.json()
      .catch(() => null);
    const file = Object.values(info?.query?.pages ?? {})[0]?.imageinfo?.[0];
    const meta = file?.extmetadata ?? {};
    const licence = meta.LicenseShortName?.value ?? "";
    if (!file?.thumburl || !WIKI_LICENCE_OK.test(licence) || /NC|ND/i.test(licence)) continue;
    const artist = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 60);
    out.push({ url: file.thumburl, source: "wikimedia", credit: `${artist ? artist + " · " : ""}${licence} · Wikimedia Commons` });
  }
  return out;
}

// Stage 3. The files geotagged within 250 m of the place (nearest first) and the files whose title or text matches its name
// and district. Anything may turn up (a street, a neighbour); the picture test decides what is really the place.
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
async function commonsQuery(extra) {
  const params = new URLSearchParams({ action: "query", format: "json", prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1000", origin: "*", ...extra });
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`${COMMONS_API}?${params}`, { signal: AbortSignal.timeout(25_000), headers: { "User-Agent": "TripChainPhotos/1.0 (place photo audit)" } }).catch(() => null);
    if (response?.status === 429 || (response && response.status >= 500)) {
      await sleep(2000 * attempt);
      continue;
    }
    return (await response?.json().catch(() => null)) ?? null;
  }
  return null;
}
function commonsFiles(data) {
  const pages = Object.values(data?.query?.pages ?? {}).sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  const out = [];
  for (const page of pages) {
    const file = page.imageinfo?.[0];
    const meta = file?.extmetadata ?? {};
    const licence = meta.LicenseShortName?.value ?? "";
    if (!file?.thumburl || file.mime !== "image/jpeg" || (file.width ?? 0) < 700 || (file.height ?? 0) < 450) continue;
    if (!WIKI_LICENCE_OK.test(licence) || /NC|ND/i.test(licence)) continue;
    if (/(map|logo|flag|diagram|plan|poster|signature)/i.test(page.title)) continue;
    const artist = (meta.Artist?.value ?? "").replace(/<[^>]+>/g, "").trim().slice(0, 60);
    out.push({ url: file.thumburl, source: "wikimedia", credit: `${artist ? artist + " · " : ""}${licence} · Wikimedia Commons`, file: page.title });
  }
  return out;
}
async function commonsCandidates(place) {
  const near = commonsFiles(await commonsQuery({ generator: "geosearch", ggscoord: `${place.lat}|${place.lng}`, ggsradius: "250", ggslimit: "15", ggsnamespace: "6" })).slice(0, 4);
  const district = (place.address ?? "").match(/([가-힣]+구)/)?.[1] ?? "";
  const clean = place.name.replace(/\(.*?\)/g, "").replace(/^서울\s*/, "").trim();
  const named = commonsFiles(await commonsQuery({ generator: "search", gsrsearch: `${clean} ${district}`.trim(), gsrnamespace: "6", gsrlimit: "8" })).slice(0, 3);
  return [...new Map([...near, ...named].map((c) => [c.url, c])).values()];
}

// Stage 4: Naver image search. The daily search limit is shared with the dining script (scripts/.cache/hub-usage.json).
const HUB = "https://naverapihub.apigw.ntruss.com";
const NAVER_STOP_AT = Math.floor(25_000 * 0.99);
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const callsToday = () => {
  const usage = readJson(USAGE_FILE, {});
  return usage.date === kstToday() ? usage.calls : 0;
};
let naverStopped = "";
async function naverSearch(query) {
  const url = `${HUB}/search/v1/image?query=${encodeURIComponent(query)}&display=20&filter=large&sort=sim`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (callsToday() >= NAVER_STOP_AT) {
      naverStopped = "Naver daily limit reached";
      return null;
    }
    writeFileSync(USAGE_FILE, JSON.stringify({ date: kstToday(), calls: callsToday() + 1 }), "utf8");
    const response = await fetch(url, { headers: { "X-NCP-APIGW-API-KEY-ID": env.NAVER_CLIENT_ID, "X-NCP-APIGW-API-KEY": env.NAVER_CLIENT_SECRET }, signal: AbortSignal.timeout(20_000) }).catch(() => null);
    if (!response) return null;
    if (response.status === 429) {
      await sleep(1500 * attempt);
      continue;
    }
    if (response.status === 401) {
      naverStopped = "the image search is not switched on for this Naver application (401)";
      return null;
    }
    if (!response.ok) return null;
    return (await response.json().catch(() => null))?.items ?? [];
  }
  return null;
}
const squash = (text) => String(text ?? "").replace(/<[^>]+>/g, "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
const NAVER_BAD_HOST = /(coupang|gmarket|11st|auction|smartstore|shopping|danawa|wemakeprice|tmon|ssg\.com|interpark|aliexpress|temu|pinterest|alamy|shutterstock|istock|gettyimages|dreamstime|123rf|freepik|alba\.kr|albamon|foodnjob|peterpanz|jumpoline)/i;
const usedUrls = new Set(places.map((place) => place.image).filter(Boolean));
const OTHER_CITY = /(부산|대구|인천|광주|대전|울산|세종|제주|경주|전주|강릉|속초|수원|춘천|여수|통영|안동|포항|목포|순천|청주|천안|제천|남해|거제|양양|가평|파주|고양|성남|용인)/;
// The names a sight goes by: "서울 호암산성" -> "호암산성"; "탑골공원 (파고다공원)" -> both.
function nameVariants(name) {
  const inner = [...name.matchAll(/\((.*?)\)/g)].map((match) => match[1]);
  const outer = name.replace(/\(.*?\)/g, "").replace(/^서울\s*/, "").trim();
  return [...new Set([outer, ...inner.map((text) => text.replace(/^서울\s*/, "").trim())])].filter((text) => squash(text).length >= 2);
}
async function naverCandidates(place) {
  const variants = nameVariants(place.name);
  if (variants.length === 0) return [];
  const district = (place.address ?? "").match(/([가-힣]+구)/)?.[1] ?? place.area ?? "";
  const items = await naverSearch(`${variants[0]} ${district}`.trim());
  if (!items) return [];
  const keys = variants.map(squash);
  const out = [];
  for (const item of items) {
    const width = Number(item.sizewidth);
    const height = Number(item.sizeheight);
    // https only (an http picture is blocked on an https page); big enough; a usual shape; not a shop or stock site; not used twice.
    if (!item.link || !/^https:/.test(item.link) || NAVER_BAD_HOST.test(item.link) || usedUrls.has(item.link)) continue;
    if (!(width >= 500 && height >= 350)) continue;
    const ratio = width / height;
    if (ratio < 0.6 || ratio > 2.2) continue;
    const title = squash(item.title);
    // The title has to carry the sight's name (a name of one or two letters is too common to trust).
    if (!keys.some((key) => key.length >= 3 && title.includes(key))) continue;
    // A common name ("하늘전망대") also belongs to places elsewhere: a title that names another city is not this place.
    const elsewhere = title.match(OTHER_CITY);
    if (elsewhere && !squash(place.name).includes(elsewhere[0])) continue;
    out.push({ url: item.link, source: "naver", credit: `${new URL(item.link).hostname.replace(/^www\./, "")} · 네이버 이미지 검색`, title: String(item.title).replace(/<[^>]+>/g, "").slice(0, 80) });
  }
  return out.slice(0, 4);
}

// ---- the picture test (the same as audit-place-photos.mjs) --------------------------------------------------------------

async function fetchImage(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; TripChainPhotos/1.0)" } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 2_000 || bytes.length > 8_000_000) return null;
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : bytes.subarray(1, 4).toString() === "PNG" ? "image/png" : bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
    return mime ? { mime, data: bytes.toString("base64") } : null;
  } catch {
    return null;
  }
}
const SYSTEM = [
  "You check photos for a Seoul travel app. You get one photo and facts about a place (name, kind, address, description).",
  "Say whether the photo is OF THAT PLACE and whether it is a photo that stands for it.",
  "isPlace: yes = it clearly shows this place (its scenery, building, or a recognizable part of it); no = it shows something else (food, a person, an unrelated street, a different building, a poster, a news photo, a map, a logo, a screenshot); unsure = cannot tell.",
  "representativeScore 0-10: how well the photo would represent the place on its page. 8-10 a clear, well framed view of the place itself; 5-7 acceptable but plain, partly blocked or dark; 0-4 poor: blurry, tiny subject, food, people as the subject, text or poster, watermark or advert, collage.",
  "Be strict about food and people: a bowl of noodles for a park, a portrait for a monument are 'no'. For an event or festival a clear photo of the event's place or scene is fine.",
  "subject: what the photo mainly shows. reason: one short sentence in English.",
].join("\n");
async function judge(place, image) {
  if (spent + 0.2 >= BUDGET) throw new Error("spend guard");
  const facts = `Name: ${place.name}\nKind: ${place.category}\nAddress: ${place.address}\nDescription: ${(place.description ?? "").slice(0, 300)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM }] },
        contents: [{ parts: [{ text: facts }, { inlineData: { mimeType: image.mime, data: image.data } }] }],
        generationConfig: {
          temperature: 0,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              isPlace: { type: "STRING", enum: ["yes", "no", "unsure"] },
              representativeScore: { type: "INTEGER" },
              subject: { type: "STRING", enum: ["landscape", "building_exterior", "interior", "food", "person", "crowd_or_event", "text_or_poster", "map_or_diagram", "logo", "other"] },
              reason: { type: "STRING" },
            },
            required: ["isPlace", "representativeScore", "subject", "reason"],
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(3000 * attempt);
      continue;
    }
    // Out of credit, or the key refused: the run stops here and this place is NOT written down as "no photo".
    if (response.status === 401 || response.status === 402 || response.status === 403) throw new Error(`the judge refused (${response.status})`);
    if (!response.ok) return null;
    const data = await response.json();
    const usage = data.usageMetadata ?? {};
    spent += ((usage.promptTokenCount ?? 0) * 0.1 + ((usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0)) * 0.4) / 1e6;
    try {
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch {
      return null;
    }
  }
  // Still rate-limited after three tries: stop rather than record a wrong "no photo" for this place.
  throw new Error("the judge is rate-limited (429/5xx)");
}

// ---- run -------------------------------------------------------------------------------------------------------------------

const NAVER_MIN_SCORE = 7;
const NAVER_OUT_SUBJECTS = new Set(["food", "person", "text_or_poster", "map_or_diagram", "logo", "other"]);
const firstState = COMMONS ? readJson(FIRST_STATE_FILE, {}) : {};
const todo = places
  .filter((place) => !place.image && !state[place.id] && (!COMMONS || firstState[place.id]?.status !== "found"))
  .sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0))
  .slice(0, LIMIT);
console.log(`[fill] ${places.filter((p) => !p.image).length} sights without a photo, ${Object.keys(state).length} tried before, trying ${todo.length} now`);

let kept = 0;
let none = 0;
try {
  for (const [index, place] of todo.entries()) {
    if (tourStopped && !COMMONS) {
      console.log("[fill] TourAPI limit reached; stopping (resumes next time)");
      break;
    }
    let candidates = NAVER ? await naverCandidates(place) : COMMONS ? await commonsCandidates(place) : await tourCandidates(place);
    if (naverStopped) {
      // Not written down as "no photo": the search did not run.
      console.log(`[fill] ${naverStopped}; stopping`);
      break;
    }
    if (!COMMONS && !NAVER && candidates.length === 0 && !tourStopped) candidates = await wikiCandidates(place);
    let best = null;
    const looked = [];
    for (const candidate of candidates) {
      const image = await fetchImage(candidate.url);
      if (!image) continue;
      const result = await judge(place, image);
      if (!result) continue;
      looked.push({ ...candidate, ...result });
      // A picture of a sight, not of a person, food, a poster or a map (the first stages' sources hold none of these; a search does).
      if (NAVER && NAVER_OUT_SUBJECTS.has(result.subject)) continue;
      if (result.isPlace === "yes" && result.representativeScore >= (NAVER ? NAVER_MIN_SCORE : MIN_SCORE) && (!best || result.representativeScore > best.representativeScore)) best = { ...candidate, ...result };
    }
    state[place.id] = { name: place.name, status: best ? "found" : candidates.length ? "rejected" : "none", chosen: best, looked, at: new Date().toISOString().slice(0, 10) };
    if (best) kept += 1;
    else none += 1;
    if ((index + 1) % 20 === 0) {
      writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
      writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");
      console.log(`  ${index + 1}/${todo.length}: ${kept} found, ${none} without`);
    }
  }
} catch (error) {
  console.log(`[fill] stopped: ${error.message}`);
}
writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");

// the review page
const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const found = Object.entries(state).filter(([, entry]) => entry.chosen);
const rejected = Object.entries(state).filter(([, entry]) => !entry.chosen && entry.looked?.length);
const card = (id, entry, shown) =>
  `<figure><img loading="lazy" referrerpolicy="no-referrer" src="${esc(shown.url)}"><figcaption><b>${esc(entry.name)}</b><br>${esc(shown.source)} · ${esc(shown.isPlace)} · ${esc(shown.subject)} · ${esc(shown.representativeScore)}/10<br><i>${esc(shown.reason)}</i><br>${esc(shown.credit)}</figcaption></figure>`;
writeFileSync(
  REPORT_FILE,
  `<!doctype html><meta charset="utf-8"><title>Photo fill</title><style>body{font:14px system-ui;margin:20px;background:#f7fafc}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}img{width:100%;height:150px;object-fit:cover;display:block;background:#e5e7eb}figcaption{padding:8px;font-size:12px;line-height:1.5}</style><h1>Found ${found.length}</h1><div class="grid">${found.map(([id, e]) => card(id, e, e.chosen)).join("")}</div><h1>Looked at and not used ${rejected.length}</h1><div class="grid">${rejected.map(([id, e]) => card(id, e, e.looked[0])).join("")}</div>`,
  "utf8",
);
console.log(`[fill] this run: ${kept} photos found, ${none} places without one. In total: ${found.length} found, ${rejected.length} looked at and refused. spend about $${spent.toFixed(3)}. review page: ${REPORT_FILE}`);

if (WRITE) {
  let written = 0;
  for (const place of places) {
    const entry = state[place.id];
    if (entry?.chosen && !place.image) {
      place.image = entry.chosen.url;
      place.photoCredit = entry.chosen.credit;
      written += 1;
    }
  }
  writeFileSync(PLACES_FILE, JSON.stringify(places, null, 1) + "\n", "utf8");
  console.log(`[write] ${written} photos put into seoul-places.json`);
}
