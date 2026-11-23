// Finds the English / Japanese / Chinese place names and descriptions in seoul-places.json that still hold Korean
// (Hangul) syllables, e.g. "ノ들섬", "經理團길", "Daps십리 Park": an earlier translation pass left some syllables
// untranslated. Each one is sent to Gemini together with its Korean source and the faulty text, with the order to keep the
// good parts and render every Hangul fragment in the target language; the answer is accepted only when no Hangul is left.
// The fixed text goes back into seoul-places.json (and into scripts/.cache/sights-translations.json when the place is in
// it, so a later export does not bring the fault back).
//
//   node scripts/fix-hangul-translations.mjs            # a dry run: lists what would be sent, no request
//   GEMINI_BUDGET_USD=17 node scripts/fix-hangul-translations.mjs --write
//
// Spend guard: the running total is kept in scripts/.cache/gemini-spend.json like the other scripts; it stops before the budget.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const PLACES_FILE = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
const SIGHTS_CACHE = path.join(CACHE, "sights-translations.json");
const SPEND_FILE = path.join(CACHE, "gemini-spend.json");
const WRITE = process.argv.includes("--write");
// A second pass for what the first one left: the faulty text is not shown (the model tends to copy its Hangul), only the source.
const FROM_SOURCE = process.argv.includes("--from-source");
// A third pass for names: the English name (already fixed) is given as a guide for the Japanese / Chinese one.
const WITH_ENGLISH = process.argv.includes("--with-english");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq !== -1) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const HANGUL = /[ᄀ-ᇿ㄰-㆏가-힣]/;
const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "17");
const MARGIN = 0.2;
let spent = readJson(SPEND_FILE, { usd: 0 }).usd;

const places = readJson(PLACES_FILE, []);
const sightsCache = readJson(SIGHTS_CACHE, {});
const LANGUAGE = { en: "English", ja: "日本語 (Japanese)", zh: "简体中文 (Simplified Chinese)" };

// What needs fixing: { lang, field, place } for each faulty translation field.
const jobs = [];
for (const place of places) {
  for (const lang of ["en", "ja", "zh"]) {
    const t = place.translations?.[lang];
    if (!t) continue;
    for (const field of ["name", "description"]) {
      if (typeof t[field] === "string" && HANGUL.test(t[field])) jobs.push({ lang, field, place });
    }
  }
}
const count = (lang, field) => jobs.filter((job) => job.lang === lang && job.field === field).length;
console.log(
  `[fix] ${jobs.length} faulty fields: en name ${count("en", "name")} / desc ${count("en", "description")}, ja ${count("ja", "name")} / ${count("ja", "description")}, zh ${count("zh", "name")} / ${count("zh", "description")}`,
);
if (!WRITE) {
  for (const job of jobs.filter((j) => j.field === "name").slice(0, 12)) {
    console.log(`  ${job.lang} name  ${job.place.name}  ->  ${job.place.translations[job.lang].name}`);
  }
  console.log("[fix] dry run: nothing sent. Add --write to fix them.");
  process.exit(0);
}

const usage = { calls: 0, prompt: 0, output: 0 };

async function ask(lang, field, batch) {
  if (spent + MARGIN >= BUDGET) {
    console.log(`  spend guard: $${spent.toFixed(2)} of $${BUDGET}; stopping`);
    return null;
  }
  const system = [
    `You fix machine translations of Seoul place ${field === "name" ? "names" : "descriptions"} into ${LANGUAGE[lang]}.`,
    FROM_SOURCE || WITH_ENGLISH
      ? "Each input line gives: [id], the Korean SOURCE and, when there is one, the ENGLISH name as a guide to sound and meaning. Translate it from scratch into the target language; a Hangul syllable must not appear anywhere in your answer."
      : "Each input line gives: [id], the Korean SOURCE, and the CURRENT translation, which still contains Korean (Hangul) syllables by mistake.",
    FROM_SOURCE || WITH_ENGLISH
      ? "Examples of the mistake to avoid: 노들섬 -> ノ들섬 (wrong) / ノドゥル島 (right); 암사초록길 -> 岩사绿道 (wrong) / 岩寺绿道 (right). Translate EVERY syllable: none may be left in Korean script."
      : "Return the corrected translation for each id. Keep every part of CURRENT that is already correct; replace each remaining Hangul fragment with the proper form in the target language.",
    field === "name"
      ? "For a name use the form in common use in that language (e.g. 경복궁 → Gyeongbokgung Palace / 景福宮 / 景福宫). If none exists, write the Korean sound in romaji/katakana (ja), pinyin-free hanzi or an established Chinese name (zh), or Revised Romanization (en). Brands and shop names may stay in Latin letters."
      : "Translate faithfully: no new facts, no omissions of facts that are in SOURCE.",
    "The result must contain NO Hangul at all. Output only the JSON array.",
  ].join("\n");
  const body = batch.map((job) => `[${job.place.id}] SOURCE: ${field === "name" ? job.place.name : job.place.description}${FROM_SOURCE || WITH_ENGLISH ? "" : `\nCURRENT: ${job.place.translations[lang][field]}`}${WITH_ENGLISH && field === "name" && job.place.translations.en?.name ? `\nENGLISH: ${job.place.translations.en.name}` : ""}`).join("\n\n");
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: body }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: { id: { type: "STRING", enum: batch.map((job) => job.place.id) }, text: { type: "STRING" } },
                required: ["id", "text"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (response.status === 429 || response.status >= 500) {
      console.log(`  Gemini ${response.status} (attempt ${attempt}/4); waiting`);
      await sleep(4000 * attempt);
      continue;
    }
    if (!response.ok) {
      console.log(`  Gemini ${response.status}: ${(await response.text().catch(() => "")).slice(0, 160)}`);
      return null;
    }
    const data = await response.json();
    const u = data.usageMetadata ?? {};
    usage.calls += 1;
    usage.prompt += u.promptTokenCount ?? 0;
    usage.output += (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
    spent += ((u.promptTokenCount ?? 0) * 0.3 + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * 2.5) / 1e6;
    writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }), "utf8");
    try {
      return JSON.parse(data.candidates?.[0]?.content?.parts?.[0]?.text);
    } catch {
      return null;
    }
  }
  return null;
}

let fixed = 0;
let stillBad = 0;
for (const lang of ["en", "ja", "zh"]) {
  for (const field of ["name", "description"]) {
    let todo = jobs.filter((job) => job.lang === lang && job.field === field);
    const size = field === "name" ? 40 : 10;
    for (let round = 1; round <= 2 && todo.length > 0; round++) {
      const next = [];
      for (let start = 0; start < todo.length; start += size) {
        const batch = todo.slice(start, start + size);
        const rows = await ask(lang, field, batch);
        const byId = new Map((rows ?? []).map((row) => [row.id, row.text]));
        for (const job of batch) {
          const text = byId.get(job.place.id);
          if (typeof text === "string" && text.trim() && !HANGUL.test(text)) {
            job.place.translations[lang][field] = text.trim();
            const cached = sightsCache[job.place.id]?.[lang];
            if (cached) cached[field] = text.trim();
            fixed += 1;
          } else {
            next.push(job);
          }
        }
        if (rows === null) break;
      }
      todo = next;
    }
    stillBad += todo.length;
    console.log(`  ${lang} ${field}: ${count(lang, field) - todo.length} fixed, ${todo.length} left`);
  }
}

writeFileSync(PLACES_FILE, JSON.stringify(places, null, 1) + "\n", "utf8");
if (existsSync(SIGHTS_CACHE)) writeFileSync(SIGHTS_CACHE, JSON.stringify(sightsCache), "utf8");
console.log(`[fix] ${fixed} fields fixed, ${stillBad} still hold Hangul; ${usage.calls} calls, $${spent.toFixed(3)} spent in total (this run about $${(((usage.prompt * 0.3 + usage.output * 2.5) / 1e6)).toFixed(3)})`);
