// Regression check for how well /api/recommend understands a sentence. Run with the dev server up:
//   node scripts/check-recommend.mjs            (all cases)    node scripts/check-recommend.mjs 4시간   (cases whose prompt contains it)
// Every case lists what the answer must satisfy; a sentence that was misread in real use gets added here with the rule it broke,
// so the same mistake is caught the next time the prompt or the engine changes. It calls the real Gemini key (a few won in all).
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3002";
// The app merges place-enrichment.json (moods, energy…) over the base data, and the indoor rule reads those moods, so this does too.
const enrichment = JSON.parse(readFileSync("src/features/mobile/place-enrichment.json", "utf8"));
const places = JSON.parse(readFileSync("src/features/mobile/seoul-places.json", "utf8")).map((place) => ({ ...place, ...(enrichment[place.id] ?? {}) }));
const byId = new Map(places.map((place) => [place.id, place]));
const tagsOf = (place) => [...(place.tags ?? []), ...(place.moods ?? [])];
// The same rule as the engine's isIndoor: a place tagged indoor counts as indoor even when a mood also says outdoor.
const isIndoor = (place) => (tagsOf(place).includes("실내") ? true : tagsOf(place).includes("실외") ? false : null);
const sights = (ids) => ids.map((id) => byId.get(id)).filter(Boolean);

const CASES = [
  {
    prompt: "양재, 광운대역, 디지털미디어시티역에서 출발하는 사람들이 적절히 만날만한 위치의 저녁실내코스 4시간 이내",
    checks: {
      "not in 노원구 (the middle of the three, not one of them)": (r) => !sights(r.placeIds).some((p) => p.area === "노원구"),
      "every sight is indoor": (r) => sights(r.placeIds).every((p) => isIndoor(p) !== false),
      "at most 4 stops": (r) => r.placeIds.length <= 4,
      "the reply says it is the middle of them": (r) => /중간/.test(r.reason ?? ""),
    },
  },
  {
    prompt: "홍대에서 야외로만 산책 코스",
    checks: { "every sight is outdoor": (r) => sights(r.placeIds).every((p) => isIndoor(p) !== true), "in 마포구": (r) => sights(r.placeIds).every((p) => p.area === "마포구") },
  },
  {
    prompt: "종로구에서 두 시간 안에 볼 수 있는 곳",
    checks: { "at most 3 stops": (r) => r.placeIds.length <= 3, "in 종로구": (r) => sights(r.placeIds).every((p) => p.area === "종로구") },
  },
  {
    prompt: "비 오는 날 실내에서 데이트",
    checks: { "every sight is indoor": (r) => sights(r.placeIds).every((p) => isIndoor(p) !== false) },
  },
];

const filter = process.argv[2];
let failed = 0;
for (const testCase of CASES.filter((entry) => !filter || entry.prompt.includes(filter))) {
  const response = await fetch(`${BASE}/api/recommend`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: testCase.prompt, locale: "ko" }) });
  const result = await response.json();
  console.log(`\n${testCase.prompt}\n  -> ${result.title ?? "(no title)"} · AI ${result.usedAI ? "on" : "OFF"} · ${result.placeIds?.length ?? 0} stops`);
  for (const [name, check] of Object.entries(testCase.checks)) {
    let ok = false;
    try { ok = Boolean(check(result)); } catch { ok = false; }
    if (!ok) failed += 1;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  }
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
