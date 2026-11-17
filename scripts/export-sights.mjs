// Turns the verified sights lists (scripts/.cache/sights-<구>-scored.json + -verify.json, built by
// build-sights-pool.mjs) into the app's place list, src/features/mobile/seoul-places.json.
//
//   node scripts/export-sights.mjs --dry     # print what would change, write nothing
//   node scripts/export-sights.mjs           # write seoul-places.json and place-enrichment.json
//
// New places: every verified "include" (a stop worth a visit; clubs flagged night-only).
// Old places (TourAPI / 문화재청 / Kakao dig): one that is the same place as a new one (within 200 m and
// sharing a name part) keeps its id, photo, description, translations, fee and hours and takes the new
// type, tags and recommendation signals; one that matches nothing is kept only when it is a real place
// of the kinds the old data was good at (see keepOld) — objects inside a museum, neighbourhood
// "places" and the like go.
//
// A place's id: kept for an old match, otherwise `sight-<district code>-<Kakao id>`.

import { existsSync, readFileSync, readdirSync, writeFileSync, copyFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");
const DATA_DIR = path.join(ROOT, "src", "features", "mobile");
const DRY = process.argv.includes("--dry");

const readJson = (file) => JSON.parse(readFileSync(file, "utf8"));
const squash = (value) => String(value).replace(/[\s·・\-_()（）\[\]"'.,]/g, "").replace(/^서울(특별시|시)?/, "");
const codes = readJson(path.join(DATA_DIR, "dining-data", "districts.json"));

function distanceM(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
// Two names share a part: one holds the other, or they have 3 characters in a row in common.
function sharesName(a, b) {
  const x = squash(a);
  const y = squash(b);
  if (x.includes(y) || y.includes(x)) return true;
  for (let i = 0; i + 3 <= x.length; i++) if (y.includes(x.slice(i, i + 3))) return true;
  return false;
}

// ---- the new places -----------------------------------------------------------------------

const fameOf = (mentions) => Math.max(10, Math.min(95, Math.round(15 * Math.log10(1 + mentions))));

const fresh = [];
for (const file of readdirSync(CACHE_DIR).filter((f) => /^sights-.*-verify\.json$/.test(f) && !f.includes("-old-verify"))) {
  const district = file.replace(/^sights-|-verify\.json$/g, "");
  const scored = readJson(path.join(CACHE_DIR, `sights-${district}-scored.json`));
  const verify = readJson(path.join(CACHE_DIR, file));
  for (const place of scored) {
    const v = verify[place.id];
    if (!v || v.verdict !== "include") continue;
    const moods = [...new Set([v.setting === "혼합" ? null : v.setting, ...v.moods].filter(Boolean))];
    if (v.setting === "혼합") moods.unshift("실내", "실외");
    fresh.push({
      id: `sight-${codes[district]}-${place.id}`,
      name: place.name,
      category: v.type,
      area: district,
      address: place.address,
      description: v.story,
      duration: `${v.durationMin}분`,
      fee: v.moods.includes("무료") ? "무료" : "정보 없음",
      tags: moods.slice(0, 5),
      hours: "정보 없음",
      savedBy: 200 + (Number(place.id) % 700),
      fameScore: fameOf(place.mentions),
      lat: place.lat,
      lng: place.lng,
      source: "sights",
      moods,
      energy: v.energy,
      bestTime: v.nightOnly ? ["night"] : v.bestTime,
      durationMin: v.durationMin,
      story: v.story,
      ...(v.nightOnly ? { nightOnly: true } : {}),
      _kind: place.kind,
      _mentions: place.mentions,
      _url: place.url,
    });
  }
}

// ---- the old places -----------------------------------------------------------------------

// The originals (restored from git before the first export, kept in scripts/.cache/backup): running this on its
// own output would treat the new places as "old".
const BACKUP = path.join(CACHE_DIR, "backup");
const oldFile = existsSync(path.join(BACKUP, "seoul-places.before-sights.json")) ? path.join(BACKUP, "seoul-places.before-sights.json") : path.join(DATA_DIR, "seoul-places.json");
const oldEnrichmentFile = existsSync(path.join(BACKUP, "place-enrichment.before-sights.json")) ? path.join(BACKUP, "place-enrichment.before-sights.json") : path.join(DATA_DIR, "place-enrichment.json");
const old = readJson(oldFile);
const oldEnrichment = readJson(oldEnrichmentFile);

// All candidates, whatever the verdict: what the new pipeline thought of an old place that did not make the list.
const allCandidates = [];
for (const file of readdirSync(CACHE_DIR).filter((f) => /^sights-.*-scored\.json$/.test(f) && !f.includes("-old-scored"))) {
  const district = file.replace(/^sights-|-scored\.json$/g, "");
  const verify = readJson(path.join(CACHE_DIR, `sights-${district}-verify.json`));
  for (const place of readJson(path.join(CACHE_DIR, file))) allCandidates.push({ ...place, verdict: verify[place.id]?.verdict ?? null });
}

// Same place: within 200 m and sharing 3 characters of the name, or (a large site's centre point differs
// between sources) one name holding the other within 700 m.
function samePlace(o, n) {
  const d = distanceM(o, n);
  if (d > 700) return false;
  const x = squash(o.name);
  const y = squash(n.name);
  const holds = Math.min(x.length, y.length) >= 3 && (x.includes(y) || y.includes(x));
  return holds || (d <= 200 && sharesName(o.name, n.name));
}

const matchedOld = new Map(); // old id -> new place
const usedNew = new Set();
for (const o of old) {
  let best = null;
  for (const n of fresh) {
    if (usedNew.has(n.id) || !samePlace(o, n)) continue;
    const d = distanceM(o, n);
    if (!best || d < best.d) best = { n, d };
  }
  if (best) {
    matchedOld.set(o.id, best.n);
    usedNew.add(best.n.id);
  }
}

// An old place that matched no new one. If the new pipeline looked at it and judged it (excluded, no blog
// evidence, a part of another place, a neighbourhood) the judgement stands. If the pipeline never saw
// it (a heritage site or TourAPI spot the Kakao scan and the blogs both missed — 종묘, 건청궁 …) it is kept,
// except for the kinds the old data let in by mistake: objects kept in a museum, hotels, cinemas, spas,
// shopping, visitor desks, fan-club forests, monuments of a person.
const JUNK_NAME =
  /호텔|모텔|레지던스|CGV|시네마|메가박스|스파|상가|도예|사진관|안내소|안내센터|방문자센터|관광정보센터|인력거|스테이|숲\s?\d*호?$|\d호|동상$|위령비|표지석|꿀벌|문보트|매직캐슬|혜성특급|단지$|앰배서더|더그랜드롯데|폰케이스|장난감나라|경찰혼|문화원$|도서관$/;
// Places the recommendation engine names by id (its landmark and Han River lists) always stay.
const engineIds = new Set(
  [...readFileSync(path.join(DATA_DIR, "recommend-engine.ts"), "utf8").matchAll(/"((?:tour|heritage|kakao)-[0-9-]+)"/g)].map((m) => m[1]),
);
function keepOld(o) {
  if (engineIds.has(o.id)) return { keep: true, why: "" };
  const name = o.name.trim();
  if (/^(서울 )?[가-힣]{2,6}(동|역|구)$/.test(name) || /^강남$/.test(name)) return { keep: false, why: "area/station" };
  // 문화재청 type 11 (국보): the ones that are objects, not buildings, sit at their museum's address.
  if (o.id.startsWith("heritage-11-") && !/문$|탑$/.test(name)) return { keep: false, why: "object in a museum" };
  if (JUNK_NAME.test(name)) return { keep: false, why: "not a sight (shop, hotel, desk …)" };
  const seen = allCandidates.filter((n) => samePlace(o, n)).sort((a, b) => distanceM(o, a) - distanceM(o, b))[0];
  if (seen) {
    const why = seen.verdict === "exclude" ? "excluded by verification" : seen.kind === "part" ? "part of another place" : seen.kind === "area" ? "area" : seen.tier === "none" ? "no blog evidence" : "other";
    return { keep: false, why: `${why} (${seen.name})` };
  }
  return { keep: true, why: "" };
}

const kept = [];
const dropped = [];
for (const o of old) {
  const m = matchedOld.get(o.id);
  if (m) continue;
  const verdict = keepOld(o);
  (verdict.keep ? kept : dropped).push({ o, why: verdict.why });
}

// ---- old places that get the same Gemini judgement as the new ones ---------------------------
// Kept because the pipeline never saw them, or dropped only for lack of blog evidence. Festivals (events that
// expire by themselves), 문화재청 사적 (designated sites) and the places the engine names are not judged.
const judgeable = (o) => o.category !== "축제행사" && !o.id.startsWith("heritage-13-") && !engineIds.has(o.id);
const toJudge = [
  ...kept.filter(({ o }) => judgeable(o)).map(({ o }) => o),
  ...dropped.filter(({ o, why }) => why.startsWith("no blog evidence") && judgeable(o)).map(({ o }) => o),
];
if (process.argv.includes("--prepare-old")) {
  const byArea = {};
  for (const o of toJudge) (byArea[o.area] ??= []).push(o);
  for (const [area, list] of Object.entries(byArea)) {
    writeFileSync(
      path.join(CACHE_DIR, `sights-${area}-old-merged.json`),
      JSON.stringify(
        list.map((o) => ({
          id: o.id, name: o.name, kind: "venue", category: o.category, address: o.address, lat: o.lat, lng: o.lng,
          sources: ["old"], posts: 0, samples: [],
        })),
        null,
        1,
      ),
      "utf8",
    );
  }
  console.log(`[prepare-old] ${toJudge.length} old places to judge in ${Object.keys(byArea).length} districts: ${Object.entries(byArea).map(([a, l]) => `${a} ${l.length}`).join(", ")}`);
  process.exit(0);
}
const oldVerdict = {};
for (const file of readdirSync(CACHE_DIR).filter((f) => /^sights-.*-old-verify\.json$/.test(f))) {
  Object.assign(oldVerdict, readJson(path.join(CACHE_DIR, file)));
}
let judgedKeep = 0;
let judgedDrop = 0;
let rescued = 0;
for (let i = kept.length - 1; i >= 0; i--) {
  const v = oldVerdict[kept[i].o.id];
  if (v?.verdict === "exclude") {
    dropped.push({ o: kept[i].o, why: `judged by Gemini: ${v.reason}` });
    kept.splice(i, 1);
    judgedDrop += 1;
  } else if (v?.verdict === "include") {
    kept[i].verdict = v;
    judgedKeep += 1;
  }
}
for (let i = dropped.length - 1; i >= 0; i--) {
  const v = oldVerdict[dropped[i].o.id];
  if (dropped[i].why.startsWith("no blog evidence") && v?.verdict === "include") {
    kept.push({ o: dropped[i].o, why: "", verdict: v });
    dropped.splice(i, 1);
    rescued += 1;
  }
}
if (Object.keys(oldVerdict).length > 0) {
  console.log(`old places judged by Gemini: ${Object.keys(oldVerdict).length} — kept ${judgedKeep}, dropped ${judgedDrop}, rescued from "no blog evidence" ${rescued}`);
}

// ---- assemble -----------------------------------------------------------------------------

const out = [];
const enrichment = {};
const strip = ({ _kind, _mentions, _url, ...place }) => place;

for (const o of old) {
  const m = matchedOld.get(o.id);
  if (!m) continue;
  // The old record (text, photo, translations, type, tags, fee, hours) stays as it is; the new judgement
  // adds the recommendation signals and raises the fame score if the blogs say it is better known.
  out.push({
    ...o,
    fameScore: Math.max(o.fameScore ?? 0, m.fameScore),
    ...(m.nightOnly ? { nightOnly: true } : {}),
  });
  enrichment[o.id] = { moods: m.moods, energy: m.energy, bestTime: m.bestTime, durationMin: m.durationMin, story: m.story };
}
for (const { o, verdict } of kept) {
  out.push(o);
  if (verdict) {
    // judged by Gemini: its signals replace the old overlay
    enrichment[o.id] = { moods: verdict.moods, energy: verdict.energy, bestTime: verdict.nightOnly ? ["night"] : verdict.bestTime, durationMin: verdict.durationMin, story: verdict.story };
  } else if (oldEnrichment[o.id]) {
    enrichment[o.id] = oldEnrichment[o.id];
  }
}
for (const n of fresh) {
  if (usedNew.has(n.id)) continue;
  out.push(strip(n));
}

const bySource = {};
for (const place of out) {
  const key = place.source ?? place.id.split("-")[0];
  bySource[key] = (bySource[key] ?? 0) + 1;
}
console.log(`new verified places: ${fresh.length}`);
console.log(`old places: ${old.length} -> matched a new place ${matchedOld.size}, kept as they are ${kept.length}, dropped ${dropped.length}`);
console.log(`result: ${out.length} places`, JSON.stringify(bySource));
const reasons = {};
for (const { why } of dropped) {
  const key = why.replace(/ \(.*$/, "");
  reasons[key] = (reasons[key] ?? 0) + 1;
}
console.log(`dropped old by reason: ${JSON.stringify(reasons)}`);
writeFileSync(path.join(CACHE_DIR, "export-dropped-old.txt"), dropped.map(({ o, why }) => `${o.name} | ${o.id.split("-")[0]} | ${why}`).join("\n"), "utf8");
writeFileSync(path.join(CACHE_DIR, "export-kept-old.txt"), kept.map(({ o }) => `${o.name} | ${o.id.split("-")[0]} | ${o.area}`).join("\n"), "utf8");

if (!DRY) {
  mkdirSync(path.join(CACHE_DIR, "backup"), { recursive: true });
  // Never overwrite the backup: it is the input of every later run (the originals, not an earlier output).
  for (const name of ["seoul-places", "place-enrichment"]) {
    const backup = path.join(CACHE_DIR, "backup", `${name}.before-sights.json`);
    if (!existsSync(backup)) copyFileSync(path.join(DATA_DIR, `${name}.json`), backup);
  }
  writeFileSync(path.join(DATA_DIR, "seoul-places.json"), JSON.stringify(out, null, 1) + "\n", "utf8");
  writeFileSync(path.join(DATA_DIR, "place-enrichment.json"), JSON.stringify(enrichment, null, 1) + "\n", "utf8");
  console.log("written: seoul-places.json, place-enrichment.json (backups in scripts/.cache/backup)");
}
