// Translates the name and the one-line description of the sights found with the evidence pipeline
// (places with `source: "sights"` in seoul-places.json) into English, Japanese and Chinese with Gemini, and
// writes scripts/.cache/sights-translations.json (id -> { en, ja, zh: { name, description } }).
// export-sights.mjs reads that file and puts the text into each new place's `translations`; the other
// fields (district, length, tags, fee, hours) are localized at run time from shared tables.
//
//   GEMINI_BUDGET_USD=16 node scripts/translate-sights.mjs
//
// Resumes from the cache file; stops before the spend guard (gemini-spend.json) is passed.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const OUT = path.join(CACHE, "sights-translations.json");
const SPEND_FILE = path.join(CACHE, "gemini-spend.json");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq !== -1) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const readJson = (file, fallback) => (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : fallback);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "12");
const MARGIN = 0.2;
let spent = readJson(SPEND_FILE, { usd: 0 }).usd;
const usage = { calls: 0, prompt: 0, output: 0 };

const places = readJson(path.join(ROOT, "src", "features", "mobile", "seoul-places.json"), []).filter((p) => p.id.startsWith("sight-"));
const cache = readJson(OUT, {});
const todo = places.filter((p) => !cache[p.id]);
console.log(`[translate] ${places.length} new sights, ${todo.length} to translate`);

const PROMPT = [
  "너는 서울 관광 서비스의 번역가야. 입력은 서울의 장소 이름과 한 줄 설명(한국어)이다.",
  "각 항목을 영어(en), 일본어(ja), 중국어 간체(zh)로 옮긴다.",
  "이름: 그 나라에서 통용되는 표기를 쓴다(예: 경복궁 → Gyeongbokgung Palace / 景福宮 / 景福宫). 통용 표기가 없으면 한국어 발음의 로마자·가나·한자(또는 병음 없이 한자)로 쓴다. 상호·브랜드는 그대로 둔다.",
  "설명: 원문의 사실만 옮긴다. 새 정보를 덧붙이지 않는다. 한 문장, 자연스러운 관광 안내 문체. 영어 70자, 일본어·중국어 40자 안팎.",
].join("\n");

async function translateBatch(batch) {
  if (spent + MARGIN >= BUDGET) {
    console.log(`  spend guard: $${spent.toFixed(2)} of $${BUDGET}; stopping`);
    return null;
  }
  const body = batch.map((p) => `[${p.id}] ${p.name} | ${p.description}`).join("\n");
  const text = { type: "STRING" };
  for (let attempt = 1; attempt <= 5; attempt++) {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: PROMPT }] },
          contents: [{ parts: [{ text: body }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: { id: { type: "STRING", enum: batch.map((p) => p.id) }, en_name: text, en_desc: text, ja_name: text, ja_desc: text, zh_name: text, zh_desc: text },
                required: ["id", "en_name", "en_desc", "ja_name", "ja_desc", "zh_name", "zh_desc"],
              },
            },
          },
        }),
        signal: AbortSignal.timeout(90_000),
      },
    );
    if (response.status === 402 || (response.status === 429 && /spending cap|per day/i.test(await response.clone().text().catch(() => "")))) {
      console.log(`  Gemini ${response.status}: out of credit or cap; stopping`);
      return null;
    }
    if (response.status === 429 || response.status >= 500) {
      console.log(`  Gemini ${response.status} (attempt ${attempt}/5); waiting`);
      await sleep(5000 * attempt);
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

const BATCH = 25;
for (let start = 0; start < todo.length; start += BATCH) {
  const batch = todo.slice(start, start + BATCH);
  const rows = await translateBatch(batch);
  if (!rows) {
    writeFileSync(OUT, JSON.stringify(cache), "utf8");
    console.log(`[translate] stopped at ${start}/${todo.length}; progress saved`);
    break;
  }
  for (const r of rows) {
    cache[r.id] = {
      en: { name: r.en_name, description: r.en_desc },
      ja: { name: r.ja_name, description: r.ja_desc },
      zh: { name: r.zh_name, description: r.zh_desc },
    };
  }
  writeFileSync(OUT, JSON.stringify(cache), "utf8");
  if ((start / BATCH) % 10 === 9) console.log(`  ${Math.min(start + BATCH, todo.length)}/${todo.length}`);
}
const cost = (usage.prompt * 0.3 + usage.output * 2.5) / 1e6;
console.log(`[translate] done: ${Object.keys(cache).length} translated; ${usage.calls} calls ≈ $${cost.toFixed(3)}; spend now $${spent.toFixed(2)}`);
