// Stage 1 of the place-photo work: looks at every photo a sight has today and decides whether it should stay.
//
//   node scripts/audit-place-photos.mjs            # audit (resumes from scripts/.cache/photo-audit.json) + writes the review page
//   node scripts/audit-place-photos.mjs --apply    # removes the photos that failed from seoul-places.json (a backup is kept)
//
// Two tests, both must pass for a photo to stay:
//   1. Where it comes from. Only official sources are used (the Korea Tourism Organization's TourAPI, the Cultural Heritage
//      Administration's portal; later Wikimedia Commons and CC photos with their licence). A photo that came out of an image
//      search (blogs, cafés, news) is somebody else's picture and is not used, however good it is.
//   2. What it shows. Gemini looks at the picture together with the place's name, kind, address and description and says whether
//      it is that place and whether it is a picture that stands for it (scenery or the building, not a bowl of noodles, a face,
//      a poster, a map, a logo). The "망원한강공원" with a photo of instant noodles is the failure this is for.
//
// Everything it writes is in scripts/.cache (not in git) except the cleaned seoul-places.json after --apply.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const PLACES_FILE = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
const AUDIT_FILE = path.join(CACHE, "photo-audit.json");
const REMOVED_FILE = path.join(CACHE, "photo-removed.json");
const REPORT_FILE = path.join(CACHE, "photo-audit.html");
const SPEND_FILE = path.join(CACHE, "gemini-spend.json");
const APPLY = process.argv.includes("--apply");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq !== -1) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const OFFICIAL_HOSTS = new Set(["tong.visitkorea.or.kr", "www.khs.go.kr"]);
const MIN_SCORE = 5;
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const hostOf = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return "";
  }
};
const BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "17");
let spent = readJson(SPEND_FILE, { usd: 0 }).usd;

const places = readJson(PLACES_FILE, []);
const withImage = places.filter((place) => place.image);
const audit = readJson(AUDIT_FILE, {});

function verdictOf(place, entry) {
  const official = OFFICIAL_HOSTS.has(hostOf(place.image));
  if (!official) return { keep: false, why: "not an official source" };
  if (entry?.fetchFailed) return { keep: true, why: "official source (could not be looked at)" };
  if (!entry) return { keep: false, why: "not audited" };
  if (entry.isPlace === "no") return { keep: false, why: `not this place: ${entry.reason}` };
  if (entry.representativeScore < MIN_SCORE) return { keep: false, why: `weak photo (${entry.representativeScore}): ${entry.reason}` };
  return { keep: true, why: "ok" };
}

async function fetchImage(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "follow", headers: { "User-Agent": "Mozilla/5.0 (compatible; TripChainAudit/1.0)" } });
    if (!response.ok) return null;
    const type = (response.headers.get("content-type") ?? "").split(";")[0].trim();
    if (!/^image\//.test(type) && type !== "application/octet-stream") return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 2_000 || bytes.length > 8_000_000) return null;
    // The type a server sends is not always right ("image/jpg"): the first bytes say what the file is.
    const mime =
      bytes[0] === 0xff && bytes[1] === 0xd8
        ? "image/jpeg"
        : bytes.subarray(1, 4).toString() === "PNG"
          ? "image/png"
          : bytes.subarray(8, 12).toString() === "WEBP"
            ? "image/webp"
            : null;
    if (!mime) return null;
    return { mime, data: bytes.toString("base64") };
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
  "subject: what the photo mainly shows.",
  "reason: one short sentence in English.",
].join("\n");

async function judge(place, image) {
  if (spent + 0.2 >= BUDGET) throw new Error("spend guard");
  const facts = `Name: ${place.name}\nKind: ${place.category}\nAddress: ${place.address}\nDescription: ${(place.description ?? "").slice(0, 300)}`;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`,
      {
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
      },
    );
    if (response.status === 429 || response.status >= 500) {
      await new Promise((resolve) => setTimeout(resolve, 3000 * attempt));
      continue;
    }
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

async function runAudit() {
  const todo = withImage.filter((place) => audit[place.id]?.url !== place.image || audit[place.id]?.fetchFailed);
  console.log(`[audit] ${withImage.length} photos, ${todo.length} to look at`);
  let index = 0;
  let done = 0;
  async function worker() {
    while (index < todo.length) {
      const place = todo[index++];
      const image = await fetchImage(place.image);
      let entry;
      if (!image) {
        entry = { url: place.image, fetchFailed: true };
      } else {
        const result = await judge(place, image);
        entry = result ? { url: place.image, ...result } : { url: place.image, fetchFailed: true };
      }
      audit[place.id] = entry;
      done += 1;
      if (done % 25 === 0) {
        writeFileSync(AUDIT_FILE, JSON.stringify(audit), "utf8");
        writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");
        console.log(`  ${done}/${todo.length}`);
      }
    }
  }
  await Promise.all([worker(), worker(), worker(), worker()]);
  writeFileSync(AUDIT_FILE, JSON.stringify(audit), "utf8");
  writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");
}

function writeReport() {
  const rows = withImage.map((place) => ({ place, entry: audit[place.id], verdict: verdictOf(place, audit[place.id]) }));
  const esc = (text) => String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const section = (title, list) =>
    `<h2>${title} (${list.length})</h2><div class="grid">${list
      .map(
        ({ place, entry, verdict }) =>
          `<figure class="${verdict.keep ? "keep" : "drop"}"><img loading="lazy" referrerpolicy="no-referrer" src="${esc(place.image)}"><figcaption><b>${esc(place.name)}</b><br>${esc(place.category)} · ${esc(hostOf(place.image))}<br>${entry && !entry.fetchFailed ? `${esc(entry.isPlace)} · ${esc(entry.subject)} · ${esc(entry.representativeScore)}/10` : "not looked at"}<br><i>${esc(verdict.why)}</i></figcaption></figure>`,
      )
      .join("")}</div>`;
  const kept = rows.filter((row) => row.verdict.keep);
  const official = rows.filter((row) => !row.verdict.keep && OFFICIAL_HOSTS.has(hostOf(row.place.image)));
  const other = rows.filter((row) => !OFFICIAL_HOSTS.has(hostOf(row.place.image)));
  const html = `<!doctype html><meta charset="utf-8"><title>Photo audit</title><style>body{font:14px system-ui;margin:20px;background:#f7fafc;color:#111827}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}figure{margin:0;background:#fff;border-radius:12px;overflow:hidden;border:3px solid transparent}figure.drop{border-color:#f87171}figure.keep{border-color:#86efac}img{width:100%;height:140px;object-fit:cover;display:block;background:#e5e7eb}figcaption{padding:8px;font-size:12px;line-height:1.5}h2{margin-top:28px}</style><h1>Place photos: ${rows.length} looked at, ${kept.length} stay</h1>${section("Official source, failed the picture test (removed)", official)}${section("Not from an official source (removed)", other)}${section("Stay", kept)}`;
  writeFileSync(REPORT_FILE, html, "utf8");
  return { rows, kept, official, other };
}

if (!APPLY) {
  try {
    await runAudit();
  } catch (error) {
    console.log(`[audit] stopped: ${error.message}`);
  }
}
const { rows, kept, official, other } = writeReport();
const bySubject = {};
for (const { entry } of rows) if (entry && !entry.fetchFailed) bySubject[entry.subject] = (bySubject[entry.subject] ?? 0) + 1;
console.log(`[audit] ${rows.length} photos: ${kept.length} stay, ${official.length} official but failed the picture test, ${other.length} not official; spend about $${spent.toFixed(3)} in total`);
console.log("  what they show:", JSON.stringify(bySubject));
for (const { place, entry, verdict } of official.slice(0, 15)) console.log(`  drop ${place.name}: ${verdict.why}`);
console.log(`  review page: ${REPORT_FILE}`);

if (APPLY) {
  const removed = {};
  for (const { place, verdict } of rows) {
    if (!verdict.keep) removed[place.id] = { name: place.name, image: place.image, why: verdict.why };
  }
  const previous = readJson(REMOVED_FILE, {});
  writeFileSync(REMOVED_FILE, JSON.stringify({ ...previous, ...removed }, null, 1), "utf8");
  for (const place of places) {
    if (removed[place.id]) delete place.image;
  }
  writeFileSync(PLACES_FILE, JSON.stringify(places, null, 1) + "\n", "utf8");
  console.log(`[apply] removed ${Object.keys(removed).length} photos from seoul-places.json (kept in ${REMOVED_FILE})`);
}
