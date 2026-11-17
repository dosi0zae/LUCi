// Runs the sights place-name discovery (scripts/discover-sights.mjs) for several districts in turn.
// Safe to run again: every stage resumes from its cache. Stops at once if a district fails, so a
// Naver quota stop (99 %) or the Gemini spend guard never goes on to the next district.
//
//   node scripts/run-sights-discover.mjs               # all 25 districts
//   node scripts/run-sights-discover.mjs 종로구 중구    # just these

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(here, "discover-sights.mjs");

const ALL = [
  "마포구", "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구",
  "도봉구", "노원구", "은평구", "서대문구", "양천구", "강서구", "구로구", "금천구", "영등포구",
  "동작구", "관악구", "서초구", "강남구", "송파구", "강동구",
];

const districts = process.argv.length > 2 ? process.argv.slice(2) : ALL;
for (const district of districts) {
  console.log(`\n===== ${district} =====`);
  const result = spawnSync(process.execPath, [script, "--district", district], { stdio: "inherit" });
  if (result.status !== 0) {
    console.log(`[sights-queue] ${district} stopped with exit code ${result.status}; not continuing.`);
    process.exit(result.status ?? 1);
  }
}
console.log("\n[sights-queue] all districts finished");
