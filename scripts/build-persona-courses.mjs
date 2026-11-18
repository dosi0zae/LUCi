// Has Gemini play each of the selected NVIDIA personas (scripts/select-personas.mjs) and plan the one-day Seoul
// course that person would really take, so we can study what a human-made course looks like (where it starts,
// how it flows through the day, how far it travels, what mix of places it holds) and how it differs from what the
// recommender builds.
//
//   node scripts/build-persona-courses.mjs                # plans every persona, writes scripts/.cache/persona-courses.json
//   node scripts/build-persona-courses.mjs --only 3,7     # only personas number 3 and 7 (1-based)
//   node scripts/build-persona-courses.mjs --write        # also writes src/features/mobile/sample-courses.json (the 탐색 tab)
//
// Step 1 (brief): the persona decides who they go with, when they start, what they want from the day and which
//   part of Seoul they head for.
// Step 2 (plan): from sights and dining spots around that area (with coordinates, hours, best time, story) they
//   write a timetable: each stop with a time and the reason it is there at that moment.
// Step 3 (translate): title and one-liner into en/ja/zh for the app.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src", "features", "mobile");
const CACHE = path.join(ROOT, "scripts", ".cache");
const OUT = path.join(CACHE, "persona-courses.json");
const WRITE = process.argv.includes("--write");
const onlyArg = process.argv.indexOf("--only");
const ONLY = onlyArg > -1 ? new Set(process.argv[onlyArg + 1].split(",").map(Number)) : null;

// ---- env, spend guard --------------------------------------------------------------------------------------
const env = Object.fromEntries(
  readFileSync(path.join(ROOT, ".env.local"), "utf8")
    .split(/\r?\n/)
    .filter((line) => line.includes("=") && !line.startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).trim()]),
);
const SPEND_FILE = path.join(CACHE, "gemini-spend.json");
const BUDGET = Number(process.env.GEMINI_BUDGET_USD ?? "17");
let spent = existsSync(SPEND_FILE) ? JSON.parse(readFileSync(SPEND_FILE, "utf8")).usd : 0;
let stopped = false;
const usage = { calls: 0, prompt: 0, output: 0 };

function count(data) {
  const u = data?.usageMetadata ?? {};
  usage.calls += 1;
  usage.prompt += u.promptTokenCount ?? 0;
  usage.output += (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0);
  spent += ((u.promptTokenCount ?? 0) * 0.3 + ((u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)) * 2.5) / 1e6;
  writeFileSync(SPEND_FILE, JSON.stringify({ usd: Number(spent.toFixed(4)) }));
}
process.on("exit", () => {
  const cost = (usage.prompt * 0.3 + usage.output * 2.5) / 1e6;
  if (usage.calls) console.log(`[gemini] ${usage.calls} calls, in ${usage.prompt}, out ${usage.output} = about $${cost.toFixed(3)} (total spend file $${spent.toFixed(2)})`);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function gemini(model, system, user, schema) {
  if (stopped || spent + 0.2 >= BUDGET) {
    stopped = true;
    throw new Error(`spend guard: $${spent.toFixed(2)} of $${BUDGET}`);
  }
  for (let attempt = 1; attempt <= 4; attempt += 1) {
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
    if (response.status === 429 || response.status >= 500) {
      const text = await response.text().catch(() => "");
      if (/spending cap|per day/i.test(text)) {
        stopped = true;
        throw new Error(`Gemini cap: ${text.slice(0, 120)}`);
      }
      await sleep(4000 * attempt);
      continue;
    }
    if (!response.ok) throw new Error(`Gemini ${response.status}: ${(await response.text()).slice(0, 200)}`);
    const data = await response.json();
    count(data);
    return JSON.parse(data.candidates[0].content.parts[0].text);
  }
  throw new Error("Gemini retries exhausted");
}

// ---- places ------------------------------------------------------------------------------------------------
const sights = JSON.parse(readFileSync(path.join(DATA, "seoul-places.json"), "utf8"));
const dining = [];
for (const file of readdirSync(path.join(DATA, "dining-data")).filter((f) => f.endsWith(".json") && !["bounds.json", "districts.json"].includes(f))) {
  dining.push(...JSON.parse(readFileSync(path.join(DATA, "dining-data", file), "utf8")));
}
const allPlaces = [...sights, ...dining];
const byId = new Map(allPlaces.map((place) => [place.id, place]));
const DISTRICTS = Object.keys(JSON.parse(readFileSync(path.join(DATA, "dining-data", "districts.json"), "utf8")));

const hav = (a, b) => {
  const r = Math.PI / 180;
  const dl = (b.lat - a.lat) * r;
  const dg = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const centroid = (list) => ({ lat: list.reduce((s, p) => s + p.lat, 0) / list.length, lng: list.reduce((s, p) => s + p.lng, 0) / list.length });

// What each district is known for, read from the data (its best-known sights and the moods most of them share),
// so a persona choosing where to go sees the whole city and not only the best-known centre.
function districtSummary() {
  return DISTRICTS.map((name) => {
    const list = sights.filter((place) => place.area === name);
    const top = [...list].sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0)).slice(0, 4).map((place) => place.name);
    const moodCount = new Map();
    for (const place of list) for (const mood of place.moods ?? []) moodCount.set(mood, (moodCount.get(mood) ?? 0) + 1);
    const moods = [...moodCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([mood]) => mood);
    return `${name}: ${top.join(", ")} (${moods.join("·")})`;
  }).join("\n");
}
const DISTRICT_SUMMARY = districtSummary();

function candidatePool(districtNames, startHour) {
  const wantsNight = startHour >= 17;
  const home = sights.filter((place) => districtNames.includes(place.area));
  const center = centroid(home.length ? home : sights);
  const near = (place) => hav(center, place) <= 3.2;
  const sightPool = sights
    .filter((place) => near(place) && (wantsNight || !place.nightOnly))
    .sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0))
    .slice(0, 55);
  const rankDining = (place) => (place.dining?.pop === "high" ? 2 : 0) + (place.dining?.hot === "surge" || place.dining?.hot === "rising" ? 1 : 0) + (place.savedBy ?? 0) / 2000;
  const diningNear = dining.filter(near);
  const pick = (category, n) => diningNear.filter((place) => place.category === category).sort((a, b) => rankDining(b) - rankDining(a)).slice(0, n);
  return { center, places: [...sightPool, ...pick("식당", 28), ...pick("카페", 16), ...(wantsNight ? pick("술집", 10) : pick("술집", 3))] };
}

function candidateLine(place) {
  const parts = [
    place.id,
    place.name,
    place.category,
    place.area,
    `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`,
    place.durationMin ? `${place.durationMin}분` : place.duration,
    place.energy ? `에너지${place.energy}` : "",
    place.bestTime?.length ? place.bestTime.join("/") : "",
    place.hours && place.hours !== "정보 없음" ? `운영 ${place.hours}` : "",
    place.dining ? place.tags.join("·") : (place.tags ?? []).join("·"),
    (place.story || place.description || "").slice(0, 60),
  ];
  return parts.filter(Boolean).join(" | ");
}

// ---- steps -------------------------------------------------------------------------------------------------
const MODEL = "gemini-flash-latest";

function personaText(p) {
  return [
    `이름 없는 ${p.age}세 ${p.sex}, 직업 ${p.occupation}, 사는 곳 ${p.district}, 가구 ${p.family_type}, ${p.marital_status}, 학력 ${p.education_level}`,
    `소개: ${p.persona}`,
    `여행 취향: ${p.travel_persona}`,
    `음식 취향: ${p.culinary_persona}`,
    `가족: ${p.family_persona}`,
    `운동: ${p.sports_persona}`,
    `예술/문화: ${p.arts_persona}`,
    `취미: ${p.hobbies_and_interests_list}`,
  ].join("\n");
}

const BRIEF_SYSTEM = `너는 아래 인물 그 자신이야. 서울에서 하루를 보내기로 했어(다른 지역에 살면 놀러 온 거고, 수도권에 살면 쉬는 날 나온 거야). 이 사람이라면 어떻게 하루를 계획할지, 인물 설정에 충실하게 정해. 인물 설정에 없는 것을 억지로 만들지 말고, 몸 상태·돈·가족·성격이 하루에 주는 제약도 반영해.
- party: 누구와 가는지(혼자, 배우자, 아이와, 부모님 등)
- occasion: 오늘의 계기 한 문장
- startTime: 시작 시각 HH:MM, endTime: 마치는 시각 HH:MM
- districts: 오늘 주로 움직일 서울의 구 1~2곳(아래 목록에서만, 서로 가까운 구)
- wants: 오늘 하루에 꼭 있었으면 하는 것 4~6개(구체적인 경험, 예: "고즈넉한 길을 천천히 걷기", "점심은 줄 안 서는 한식")
- avoid: 피하고 싶은 것 2~3개
- traits: 이 사람의 여행 성향을 나타내는 짧은 키워드 3개
서울은 구마다 분위기가 아주 달라. 종로·중구가 서울의 전부가 아니니, 이 사람 취향에 가장 맞는 동네를 서울 전체에서 골라. 구별로 알려진 곳:
${DISTRICT_SUMMARY}`;

const BRIEF_SCHEMA = {
  type: "OBJECT",
  properties: {
    party: { type: "STRING" },
    occasion: { type: "STRING" },
    startTime: { type: "STRING" },
    endTime: { type: "STRING" },
    districts: { type: "ARRAY", items: { type: "STRING", enum: DISTRICTS } },
    wants: { type: "ARRAY", items: { type: "STRING" } },
    avoid: { type: "ARRAY", items: { type: "STRING" } },
    traits: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["party", "occasion", "startTime", "endTime", "districts", "wants", "avoid", "traits"],
};

const PLAN_SYSTEM = `너는 아래 인물 그 자신이고, 오늘 서울에서 보낼 하루의 코스를 직접 짜고 있어. 후보 장소 목록(좌표, 운영시간, 어울리는 시간대, 이야기 포함)이 있어. 이 중에서 5~6곳을 골라 실제로 그날 움직이는 것처럼 시간표를 만들어.
머릿속으로 그날을 그대로 걸어 봐: 몇 시에 어디서 출발해서, 어디를 지나, 어디서 밥을 먹고, 언제 쉬고, 어떻게 끝나는지. 지도(좌표)를 보고 이동이 자연스러운지, 시간대와 운영시간이 맞는지, 몸이 힘들지 않은지, 같이 가는 사람이 지루하지 않을지를 사람처럼 따져서 골라. 목록에서 제일 유명한 곳이 아니라 이 사람의 하루에 맞는 곳을 골라.
- 식사를 하는 시간에는 식당을 넣고, 이 사람의 하루에 맞으면 카페나 술집도 넣어.
- stops의 id는 반드시 후보 목록에 있는 값만 써. 시간표는 시간 순서여야 해.
- role: 이 장소가 하필 이 시간에 이 순서로 들어간 이유를 이 사람의 입장에서 한 문장으로.
- title: 코스 이름, 한국어 12~20자, 장소 이름을 나열하지 말고 이 하루의 분위기를 담은 한 구절. 따옴표와 마침표는 쓰지 마.
- description: 이 코스를 소개하는 한두 문장(제3자 시점).
- voice: 이 사람이 직접 말하듯 이 하루를 이렇게 짠 이유 두세 문장.
- gaveUp: 이 코스를 위해 포기한 것 한 가지.`;

const PLAN_SCHEMA = {
  type: "OBJECT",
  properties: {
    title: { type: "STRING" },
    description: { type: "STRING" },
    voice: { type: "STRING" },
    gaveUp: { type: "STRING" },
    stops: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: { id: { type: "STRING" }, time: { type: "STRING" }, stayMin: { type: "INTEGER" }, role: { type: "STRING" } },
        required: ["id", "time", "stayMin", "role"],
      },
    },
  },
  required: ["title", "description", "voice", "gaveUp", "stops"],
};

const TRANSLATE_SCHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries(
    ["en", "ja", "zh"].map((lang) => [lang, { type: "OBJECT", properties: { title: { type: "STRING" }, description: { type: "STRING" } }, required: ["title", "description"] }]),
  ),
  required: ["en", "ja", "zh"],
};

function hourOf(time) {
  const [h] = String(time).split(":").map(Number);
  return Number.isFinite(h) ? h : 10;
}

async function planPersona(persona, index) {
  const text = personaText(persona);
  const brief = await gemini(MODEL, BRIEF_SYSTEM, text, BRIEF_SCHEMA);
  const { center, places } = candidatePool(brief.districts, hourOf(brief.startTime));
  const user =
    `${text}\n\n[오늘의 계획]\n함께 가는 사람: ${brief.party}\n계기: ${brief.occasion}\n시간: ${brief.startTime} ~ ${brief.endTime}\n원하는 것: ${brief.wants.join(" / ")}\n피하고 싶은 것: ${brief.avoid.join(" / ")}\n\n` +
    `[후보 장소] id | 이름 | 종류 | 구 | 위도,경도 | 체류 | 에너지 | 어울리는 시간 | 운영 | 태그 | 한 줄\n` +
    places.map(candidateLine).join("\n");
  const validIds = places.map((place) => place.id);
  const schema = JSON.parse(JSON.stringify(PLAN_SCHEMA));
  schema.properties.stops.items.properties.id = { type: "STRING", enum: validIds };
  const plan = await gemini(MODEL, PLAN_SYSTEM, user, schema);

  const stops = plan.stops.filter((stop, i, all) => byId.has(stop.id) && all.findIndex((other) => other.id === stop.id) === i);
  const route = stops.map((stop) => byId.get(stop.id));
  const km = route.reduce((sum, place, i) => (i ? sum + hav(route[i - 1], place) : 0), 0);
  const span = Math.max(0, ...route.flatMap((a) => route.map((b) => hav(a, b))));
  const translations = await gemini("gemini-flash-lite-latest", "한국어 여행 코스의 제목과 소개를 en, ja, zh로 자연스럽게 옮겨. 장소 이름은 널리 쓰이는 표기로. 번역에 한글을 남기지 마.", JSON.stringify({ title: plan.title, description: plan.description }), TRANSLATE_SCHEMA);

  console.log(`#${index + 1} ${persona.age}${persona.sex[0]} ${brief.districts.join("+")} ${stops.length}곳 ${km.toFixed(1)}km span ${span.toFixed(1)}km — ${plan.title}`);
  return {
    n: index + 1,
    persona: {
      age: persona.age,
      sex: persona.sex,
      occupation: persona.occupation,
      residence: persona.district,
      family: persona.family_type,
      marital: persona.marital_status,
      party: brief.party,
      occasion: brief.occasion,
      traits: brief.traits,
    },
    brief,
    plan: { ...plan, stops: stops.map((stop) => ({ ...stop, name: byId.get(stop.id).name, category: byId.get(stop.id).category, area: byId.get(stop.id).area })) },
    metrics: { stops: stops.length, walkingKm: Number(km.toFixed(2)), spanKm: Number(span.toFixed(2)), center },
    translations,
  };
}

// ---- run ---------------------------------------------------------------------------------------------------
const personas = JSON.parse(readFileSync(path.join(CACHE, "personas-selected.json"), "utf8"));
mkdirSync(CACHE, { recursive: true });
const done = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : [];
const results = new Map(done.map((entry) => [entry.n, entry]));

const todo = personas.map((persona, index) => ({ persona, index })).filter(({ index }) => (ONLY ? ONLY.has(index + 1) : !results.has(index + 1)));
const CONCURRENCY = 4;
let cursor = 0;
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < todo.length && !stopped) {
      const { persona, index } = todo[cursor++];
      try {
        results.set(index + 1, await planPersona(persona, index));
        writeFileSync(OUT, JSON.stringify([...results.values()].sort((a, b) => a.n - b.n), null, 1));
      } catch (error) {
        console.log(`#${index + 1} failed: ${error instanceof Error ? error.message : error}`);
      }
    }
  }),
);

const all = [...results.values()].sort((a, b) => a.n - b.n);
console.log(`${all.length}/${personas.length} personas planned.`);

if (WRITE) {
  const courses = all.map((entry) => ({
    title: entry.plan.title,
    description: entry.plan.description,
    translations: entry.translations,
    placeIds: entry.plan.stops.map((stop) => stop.id),
    persona: { ...entry.persona, voice: entry.plan.voice },
  }));
  writeFileSync(path.join(DATA, "sample-courses.json"), JSON.stringify(courses, null, 2));
  console.log(`wrote ${courses.length} courses to src/features/mobile/sample-courses.json`);
}
