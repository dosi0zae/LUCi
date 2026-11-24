// Photos for the restaurants, cafés and bars (dining-data/<district>.json), from Naver image search, each one looked at by Gemini.
//
//   node scripts/fill-dining-photos.mjs --limit 100                      # the 100 best-known places without a photo (resumes)
//   node scripts/fill-dining-photos.mjs --limit 100 --district jongno    # only one district's file
//   node scripts/fill-dining-photos.mjs --limit 100 --write              # and put the photos that passed into the district files
//   node scripts/fill-dining-photos.mjs --retry --category 술집 --limit 400 --write   # places that found nothing the first time: other queries
//
// This is the "photos stored ahead" way the owner chose for the alpha, knowing the risk: these are other people's pictures (blog
// and shop photos that Naver image search lists), with no licence. Before a public launch they are to be replaced (Google, or the
// category icon). Every photo is stored with its web host as the credit text.
//
// What is kept, by the owner's guide: first the place's outside (signboard), then its inside, then its food; a few people in the
// picture are fine, a person as the subject is not; food alone is fine (the image's title must then carry the place's name); a
// bar's dim picture is fine when the mood shows. Never: posters and ads, menu boards, receipts, screenshots, maps, logos,
// collages, watermarked or shop-product pictures, tiny or blurred ones. No photo is better than a wrong one.
//
// State: scripts/.cache/dining-photo.json (id -> result). Naver's daily search limit is shared with build-food-pool.mjs
// (scripts/.cache/hub-usage.json). The image search has to be switched on for the application in the NAVER API HUB console.

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const DATA_DIR = path.join(ROOT, "src", "features", "mobile", "dining-data");
const STATE_FILE = path.join(CACHE, "dining-photo.json");
const REPORT_FILE = path.join(CACHE, "dining-photo.html");
const SPEND_FILE = path.join(CACHE, "gemini-spend.json");
const USAGE_FILE = path.join(CACHE, "hub-usage.json");
// Node's own network layer sometimes throws from inside a socket event (an internal assertion when a server closes a connection
// early), which no try/catch around the request can reach and which used to end a long run. The request that was hit then simply
// times out (it is retried or skipped), so the run goes on.
process.on("uncaughtException", (error) => console.log(`[dining] network error ignored: ${error?.message ?? error}`));
process.on("unhandledRejection", (error) => console.log(`[dining] rejected promise ignored: ${error?.message ?? error}`));
const args = process.argv.slice(2);
const arg = (name, fallback) => (args.includes(`--${name}`) ? args[args.indexOf(`--${name}`) + 1] : fallback);
const WRITE = args.includes("--write");
const LIMIT = Number(arg("limit", "100"));
const ONLY = arg("district", "");
const RETRY = args.includes("--retry");
const ONLY_CATEGORY = arg("category", "");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq !== -1) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}
const HUB = "https://naverapihub.apigw.ntruss.com";
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "30");
let spent = readJson(SPEND_FILE, { usd: 0 }).usd;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---- the places ------------------------------------------------------------------------------------------------------------

const files = readdirSync(DATA_DIR).filter((file) => file.endsWith(".json") && !/^(bounds|districts)\.json$/.test(file) && (!ONLY || file === `${ONLY}.json`));
const byFile = new Map(files.map((file) => [file, JSON.parse(readFileSync(path.join(DATA_DIR, file), "utf8"))]));
const all = [...byFile.values()].flat();
const state = readJson(STATE_FILE, {});
const usedUrls = new Set(all.map((place) => place.image).filter(Boolean));
for (const entry of Object.values(state)) if (entry.chosen) usedUrls.add(entry.chosen.url);

// ---- Naver image search ----------------------------------------------------------------------------------------------------

const DAILY_LIMIT = 25_000;
const STOP_AT = Math.floor(DAILY_LIMIT * 0.99);
const kstToday = () => new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
const callsToday = () => {
  const usage = readJson(USAGE_FILE, {});
  return usage.date === kstToday() ? usage.calls : 0;
};
let stopped = "";
async function imageSearch(query) {
  const url = `${HUB}/search/v1/image?query=${encodeURIComponent(query)}&display=20&filter=large&sort=sim`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    if (callsToday() >= STOP_AT) {
      stopped = "Naver daily limit reached";
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
      stopped = "the image search is not switched on for this Naver application (401)";
      return null;
    }
    if (!response.ok) return null;
    return (await response.json().catch(() => null))?.items ?? [];
  }
  return null;
}

const squash = (text) => String(text ?? "").replace(/<[^>]+>/g, "").replace(/[^0-9a-zA-Z가-힣]/g, "").toLowerCase();
// "낙산냉면" or "차지 종로점" -> the part that is the name: a trailing branch ("종로점", "본점") does not have to be in the title.
const brandOf = (name) => name.replace(/\(.*?\)/g, "").replace(/\s+\S*(점|호점|지점)$/, "").trim();
const BAD_HOST = /(coupang|gmarket|11st|auction|smartstore|shopping|danawa|wemakeprice|tmon|ssg\.com|interpark|aliexpress|temu|pinterest|alamy|shutterstock|istock|gettyimages|dreamstime|123rf|freepik|alba.kr|albamon|foodnjob|peterpanz|jumpoline)/i;

function usable(item) {
  const width = Number(item.sizewidth);
  const height = Number(item.sizeheight);
  if (!item.link || !/^https?:/.test(item.link) || BAD_HOST.test(item.link)) return false;
  if (!(width >= 400 && height >= 300)) return false;
  const ratio = width / height;
  if (ratio < 0.55 || ratio > 2.4) return false;
  return !usedUrls.has(item.link);
}

async function candidatesFor(place) {
  const items = await imageSearch(`${brandOf(place.name)} ${place.area}`);
  if (!items) return [];
  const brand = squash(brandOf(place.name));
  const out = [];
  for (const item of items) {
    if (!usable(item)) continue;
    const titleMatch = brand.length >= 2 && squash(item.title).includes(brand);
    out.push({ url: item.link, thumb: item.thumbnail, title: String(item.title).replace(/<[^>]+>/g, "").slice(0, 80), titleMatch, w: Number(item.sizewidth), h: Number(item.sizeheight) });
  }
  // Pictures whose own title carries the place's name first.
  out.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch));
  return out.slice(0, 4);
}

// --retry: places that found nothing the first time (all pictures refused, or none came up). Other queries (the outside; the street),
// and only pictures that were not looked at before.
const roadOf = (address) => (String(address ?? "").match(/([가-힣0-9]+(?:로|길))\s*\d/) ?? [])[1] ?? "";
async function retryCandidatesFor(place, seen) {
  const brand = brandOf(place.name);
  const queries = [`${brand} ${place.area} 외관`, `${brand} ${roadOf(place.address)}`.trim()];
  const key = squash(brand);
  const out = [];
  for (const query of queries) {
    const items = await imageSearch(query);
    if (!items) continue;
    for (const item of items) {
      if (!usable(item) || seen.has(item.link) || out.some((c) => c.url === item.link)) continue;
      const titleMatch = key.length >= 2 && squash(item.title).includes(key);
      out.push({ url: item.link, thumb: item.thumbnail, title: String(item.title).replace(/<[^>]+>/g, "").slice(0, 80), titleMatch, w: Number(item.sizewidth), h: Number(item.sizeheight) });
    }
  }
  out.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch));
  return out.slice(0, 4);
}

// ---- the picture test ------------------------------------------------------------------------------------------------------

async function fetchImage(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; TripChainPhotos/1.0)" } });
    if (!response.ok) return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 8_000 || bytes.length > 7_000_000) return null;
    const mime = bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : bytes.subarray(1, 4).toString() === "PNG" ? "image/png" : bytes.subarray(8, 12).toString() === "WEBP" ? "image/webp" : null;
    return mime ? { mime, data: bytes.toString("base64") } : null;
  } catch {
    return null;
  }
}

const SYSTEM = [
  "You check photos for a Seoul travel app that shows a restaurant, café or bar. You get one photo and facts about the place (name, kind, district, tags).",
  "Describe the photo as the schema asks. Be strict.",
  "sameKind: yes = what is shown fits this place (the signboard or any visible text matches its name, or it is plainly the right kind of place and food/atmosphere for it); no = it shows a different kind of place or food (a bakery photo for a bar, a Japanese set meal for a coffee shop) or a different shop's name; unknown = cannot tell.",
  "subject: exterior = the shop's front, its signboard or street view; interior = inside the shop (seats, counter, decor); food = dishes, drinks or desserts as the main subject; person = a person or group is the subject (selfie, portrait, group photo); text_or_poster = an ad, a poster, a banner, a coupon, a price list or a picture made mostly of text; menu_board = a menu board or menu sheet; receipt_or_screenshot = a receipt, an app or web screenshot, a map; logo = a logo or brand mark; collage = several photos joined; product_shot = a studio product photo or a shop-listing image; other = anything else.",
  "people: none = nobody; minor = a few people in the background or small in the frame; major = people fill the frame.",
  "light: good = bright enough; dim_with_mood = dark but the place and its atmosphere can still be seen (a bar at night); too_dark = too dark or too blurred to see what it is.",
  "watermark: true when a large watermark, a shop's advert text or another company's logo covers the picture.",
  "quality 0-10: sharp, well framed, the subject clear. 8-10 a clear well framed shot; 6-7 acceptable though plain; 0-5 blurry, tiny subject, crooked, cluttered.",
  "reason: one short English sentence.",
].join("\n");

async function judge(place, image) {
  if (spent + 0.2 >= BUDGET) throw new Error("spend guard");
  const facts = `Name: ${place.name}\nKind: ${place.category}\nDistrict: ${place.area}\nTags: ${(place.tags ?? []).join(", ")}`;
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
              sameKind: { type: "STRING", enum: ["yes", "no", "unknown"] },
              subject: { type: "STRING", enum: ["exterior", "interior", "food", "person", "text_or_poster", "menu_board", "receipt_or_screenshot", "logo", "collage", "product_shot", "other"] },
              people: { type: "STRING", enum: ["none", "minor", "major"] },
              light: { type: "STRING", enum: ["good", "dim_with_mood", "too_dark"] },
              watermark: { type: "BOOLEAN" },
              quality: { type: "INTEGER" },
              reason: { type: "STRING" },
            },
            required: ["sameKind", "subject", "people", "light", "watermark", "quality", "reason"],
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (response.status === 429 || response.status >= 500) {
      await sleep(3000 * attempt);
      if (attempt === 3) throw new Error(`the judge is not answering (${response.status}); out of credit, or too busy`);
      continue;
    }
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
  return null;
}

// The owner's guide as code: why a picture is out, or how it ranks (outside, then inside, then food).
const OUT_SUBJECTS = new Set(["person", "text_or_poster", "menu_board", "receipt_or_screenshot", "logo", "collage", "product_shot"]);
const SUBJECT_BONUS = { exterior: 3, interior: 1.5, food: 0 };
function verdict(candidate, result) {
  if (OUT_SUBJECTS.has(result.subject)) return { ok: false, why: `subject ${result.subject}` };
  if (result.people === "major") return { ok: false, why: "people fill the frame" };
  if (result.light === "too_dark") return { ok: false, why: "too dark" };
  if (result.watermark) return { ok: false, why: "watermark or advert" };
  if (result.sameKind === "no") return { ok: false, why: "not this kind of place" };
  if (result.quality < 6) return { ok: false, why: `quality ${result.quality}` };
  // Food says little about which shop it is: the picture's own title has to carry the name. Outside or inside: the picture fits
  // the place, and either the title carries the name or the judge saw it say so.
  if (result.subject === "food" && !candidate.titleMatch) return { ok: false, why: "food and no name in the title" };
  if ((result.subject === "exterior" || result.subject === "interior") && !candidate.titleMatch && result.sameKind !== "yes") return { ok: false, why: "not shown to be this place" };
  // "other" is a sign, a book, a street, a map of the area: whatever the title says, it is not what the place looks like.
  if (result.subject === "other") return { ok: false, why: "something else" };
  const rank = result.quality + (SUBJECT_BONUS[result.subject] ?? 0) + (candidate.titleMatch ? 1 : 0) + (result.sameKind === "yes" ? 1 : 0) - (result.people === "minor" ? 1 : 0) - (result.light === "dim_with_mood" ? 0.5 : 0);
  return { ok: true, rank };
}

// --reeval: the rules above changed; decide again from what the judge already said (no new searches or judge calls).
if (args.includes("--reeval")) {
  for (const entry of Object.values(state)) {
    let best = null;
    for (const item of entry.looked ?? []) {
      const decision = verdict(item, item);
      Object.assign(item, { ok: decision.ok, why: decision.why, rank: decision.rank });
      if (decision.ok && (!best || decision.rank > best.rank)) best = { ...item };
    }
    entry.chosen = best;
    entry.status = best ? "found" : entry.looked?.length ? "rejected" : "none";
  }
  writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
}

// ---- run -------------------------------------------------------------------------------------------------------------------

const todo = all
  .filter((place) => {
    if (place.image) return false;
    if (ONLY_CATEGORY && place.category !== ONLY_CATEGORY) return false;
    if (!RETRY) return !state[place.id];
    const before = state[place.id];
    return before && before.status !== "found" && !before.retried;
  })
  .sort((a, b) => (b.savedBy ?? 0) - (a.savedBy ?? 0))
  .slice(0, LIMIT);
console.log(`[dining] ${all.filter((p) => !p.image).length} places without a photo, ${Object.keys(state).length} tried before, trying ${todo.length} now`);

let kept = 0;
let none = 0;
let done = 0;
let next = 0;
let halted = false;
let failures = 0;
const WORKERS = Number(arg("workers", "6"));

function save() {
  writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
  writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");
}

async function handle(place) {
  const before = state[place.id];
  const seen = new Set((before?.looked ?? []).map((item) => item.url));
  const candidates = RETRY ? await retryCandidatesFor(place, seen) : await candidatesFor(place);
  if (stopped) {
    halted = true;
    return;
  }
  let best = null;
  const looked = [];
  for (const candidate of candidates) {
    const image = await fetchImage(candidate.url);
    if (!image) continue;
    const result = await judge(place, image);
    if (!result) continue;
    const decision = verdict(candidate, result);
    looked.push({ ...candidate, ...result, ok: decision.ok, why: decision.why, rank: decision.rank });
    if (decision.ok && (!best || decision.rank > best.rank)) best = { ...candidate, ...result, rank: decision.rank };
  }
  if (best) usedUrls.add(best.url);
  if (RETRY) {
    // Keep what was looked at before; a place is retried once.
    const all = [...(before?.looked ?? []), ...looked];
    state[place.id] = { name: place.name, area: place.area, category: place.category, status: best ? "found" : all.length ? "rejected" : "none", chosen: best, looked: all, retried: true, at: new Date().toISOString().slice(0, 10) };
  } else {
    state[place.id] = { name: place.name, area: place.area, category: place.category, status: best ? "found" : candidates.length ? "rejected" : "none", chosen: best, looked, at: new Date().toISOString().slice(0, 10) };
  }
  if (best) kept += 1;
  else none += 1;
  done += 1;
  if (done % 50 === 0) {
    save();
    console.log(`  ${done}/${todo.length}: ${kept} found, ${none} without, spend $${spent.toFixed(2)}`);
  }
}

// A few places at a time: each one spends most of its time waiting on the network.
async function worker() {
  while (!halted && next < todo.length) {
    const place = todo[next];
    next += 1;
    try {
      await handle(place);
      failures = 0;
    } catch (error) {
      // The spend limit ends the run. Anything else (a timeout, the judge being out of reach, or out of credit) leaves this place
      // untried (it is done the next time) and, when it keeps happening, ends the run rather than writing down wrong "no photo"s.
      failures += 1;
      if (/spend guard/.test(error.message) || failures >= 8) {
        console.log(`[dining] stopped: ${error.message}${failures >= 8 ? " (eight failures in a row)" : ""}`);
        halted = true;
      } else {
        console.log(`[dining] skipped ${place.name}: ${error.message}`);
      }
    }
  }
}
await Promise.all(Array.from({ length: Math.max(1, WORKERS) }, worker));
if (stopped) console.log(`[dining] stopped: ${stopped}`);
writeFileSync(STATE_FILE, JSON.stringify(state), "utf8");
writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");

// the review page
const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const entries = Object.entries(state);
const found = entries.filter(([, entry]) => entry.chosen);
const refused = entries.filter(([, entry]) => !entry.chosen && entry.looked?.length);
const card = (entry, shown) =>
  `<figure><img loading="lazy" referrerpolicy="no-referrer" src="${esc(shown.url)}"><figcaption><b>${esc(entry.name)}</b> · ${esc(entry.category)} · ${esc(entry.area)}<br>${esc(shown.subject)} · people ${esc(shown.people)} · ${esc(shown.light)} · q${esc(shown.quality)}${shown.titleMatch ? " · name in title" : ""}<br><i>${esc(shown.ok === false ? shown.why : shown.reason)}</i><br>${esc(shown.title)}</figcaption></figure>`;
writeFileSync(
  REPORT_FILE,
  `<!doctype html><meta charset="utf-8"><title>Dining photos</title><style>body{font:14px system-ui;margin:20px;background:#f7fafc}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden}img{width:100%;height:150px;object-fit:cover;display:block;background:#e5e7eb}figcaption{padding:8px;font-size:12px;line-height:1.5}</style><h1>Found ${found.length}</h1><div class="grid">${found.map(([, e]) => card(e, e.chosen)).join("")}</div><h1>Looked at and not used ${refused.length}</h1><div class="grid">${refused.map(([, e]) => card(e, e.looked.sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0))[0])).join("")}</div>`,
  "utf8",
);
console.log(`[dining] this run: ${kept} photos found, ${none} without. In total: ${found.length} found, ${refused.length} refused. spend about $${spent.toFixed(3)}. review page: ${REPORT_FILE}`);

if (WRITE) {
  let written = 0;
  for (const [file, places] of byFile) {
    let changed = false;
    for (const place of places) {
      const chosen = state[place.id]?.chosen;
      if (chosen && !place.image) {
        place.image = chosen.url;
        place.photoCredit = `${new URL(chosen.url).hostname.replace(/^www\./, "")} · 네이버 이미지 검색`;
        written += 1;
        changed = true;
      }
    }
    if (changed) writeFileSync(path.join(DATA_DIR, file), JSON.stringify(places), "utf8");
  }
  console.log(`[write] ${written} photos put into the district files`);
}
