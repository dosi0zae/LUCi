// The persona planner writes each title on its own, so the 20 titles drift into the same few phrases ("쉼표",
// "숲 그늘"…). This reads all 20 courses together and rewrites the titles (and en/ja/zh versions) so no two share a
// signature word, the way an editor of a list would. Reads and writes scripts/.cache/persona-courses.json.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = path.join(ROOT, "scripts", ".cache", "persona-courses.json");
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);

const courses = JSON.parse(readFileSync(FILE, "utf8"));

async function call(model, system, user, schema) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${env.GEMINI_API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", responseSchema: schema },
    }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
  return JSON.parse((await response.json()).candidates[0].content.parts[0].text);
}

const input = courses.map((entry) => ({
  n: entry.n,
  title: entry.plan.title,
  who: `${entry.persona.age}세 ${entry.persona.sex}, ${entry.persona.party}`,
  stops: entry.plan.stops.map((stop) => `${stop.time} ${stop.name}`),
}));

const titles = await call(
  "gemini-flash-latest",
  `서울 여행 앱의 "코스 둘러보기" 목록에 올라갈 코스 20개의 제목을 다듬어 줘. 각 코스의 장소와 누구와 가는지를 보고, 그 코스만의 분위기를 한 구절(한국어 12~20자)로 지어. 제목끼리 비슷하면 목록이 단조로워 보여: 같은 핵심 단어("쉼표", "숲", "그늘", "하루" 등)가 세 제목 이상에 나오지 않게 하고, 코스마다 말투와 구조도 다르게 해(명사구, 동사구, 장면 묘사 등). 장소 이름을 그대로 나열하지는 마. 따옴표와 마침표는 쓰지 마.`,
  JSON.stringify(input),
  {
    type: "ARRAY",
    items: { type: "OBJECT", properties: { n: { type: "INTEGER" }, title: { type: "STRING" } }, required: ["n", "title"] },
  },
);

const byN = new Map(titles.map((entry) => [entry.n, entry.title.trim()]));
const translations = await call(
  "gemini-flash-lite-latest",
  "한국어 여행 코스 제목과 소개를 en, ja, zh로 자연스럽게 옮겨. 장소 이름은 널리 쓰이는 표기로. 번역에 한글을 남기지 마.",
  JSON.stringify(courses.map((entry) => ({ n: entry.n, title: byN.get(entry.n) ?? entry.plan.title, description: entry.plan.description }))),
  {
    type: "ARRAY",
    items: {
      type: "OBJECT",
      properties: {
        n: { type: "INTEGER" },
        ...Object.fromEntries(
          ["en", "ja", "zh"].map((lang) => [lang, { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" } }, required: ["title", "description"] }]),
        ),
      },
      required: ["n", "en", "ja", "zh"],
    },
  },
);

const trByN = new Map(translations.map((entry) => [entry.n, entry]));
for (const entry of courses) {
  const title = byN.get(entry.n);
  if (title) {
    entry.plan.originalTitle = entry.plan.originalTitle ?? entry.plan.title;
    entry.plan.title = title;
  }
  const tr = trByN.get(entry.n);
  if (tr) entry.translations = { en: tr.en, ja: tr.ja, zh: tr.zh };
  console.log(`#${entry.n} ${entry.plan.title}`);
}
writeFileSync(FILE, JSON.stringify(courses, null, 1));
