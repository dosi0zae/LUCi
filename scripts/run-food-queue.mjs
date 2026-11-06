// Runs the food/café/bar pipeline for several districts in order, as far as today's Naver search
// quota allows. Safe to run again every day: each stage resumes from its cache, a finished stage
// costs nothing, and the Naver stage stops (exit code 2) at 99 % of the daily limit so the next
// stages never run on half-fetched data.
//
//   node scripts/run-food-queue.mjs 종로구 중구 용산구
//
// Stage order per district: candidates (skipped once cached) → naver → brands → trend →
// score → verify → score → tags (curated places) → score → export.

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const pipeline = path.join(here, "build-food-pool.mjs");
const cacheDir = path.join(here, ".cache");

const districts = process.argv.slice(2);
if (districts.length === 0) {
  console.error("usage: node scripts/run-food-queue.mjs <구> [<구> …]");
  process.exit(1);
}

const STAGES = [
  ["candidates"],
  ["naver", "--naver-max", "1000000"],
  ["brands"],
  ["trend"],
  ["score"],
  ["verify"],
  ["score"],
  ["tags", "--curated"],
  ["score"],
  ["export"],
];

function usageToday() {
  const file = path.join(cacheDir, "hub-usage.json");
  if (!existsSync(file)) return 0;
  const usage = JSON.parse(readFileSync(file, "utf8"));
  const today = new Date(Date.now() + 9 * 3_600_000).toISOString().slice(0, 10);
  return usage.date === today ? usage.calls : 0;
}

for (const district of districts) {
  console.log(`\n===== ${district} =====`);
  for (const [stage, ...extra] of STAGES) {
    if (stage === "candidates" && existsSync(path.join(cacheDir, `food-${district}-candidates.json`))) {
      console.log(`[queue] ${district}: candidates already collected`);
      continue;
    }
    console.log(`[queue] ${district}: ${stage} (Naver calls today so far: ${usageToday()})`);
    const result = spawnSync(process.execPath, [pipeline, "--district", district, "--stage", stage, ...extra], {
      stdio: "inherit",
    });
    if (result.status === 2 && (stage === "verify" || stage === "tags")) {
      // Gemini's daily quota ran out: save what exists (score + export), then stop; the rest resumes tomorrow.
      for (const finishing of ["score", "export"]) {
        spawnSync(process.execPath, [pipeline, "--district", district, "--stage", finishing], { stdio: "inherit" });
      }
      console.log(`
[queue] STOPPED in ${district} at "${stage}" — Gemini daily quota used up. Saved what exists; run the same command tomorrow.`);
      process.exit(2);
    }
    if (result.status === 2) {
      console.log(`\n[queue] STOPPED in ${district} at "${stage}" — Naver daily limit reached (${usageToday()} calls today). Run the same command tomorrow to continue.`);
      process.exit(2);
    }
    if (result.status !== 0) {
      console.log(`\n[queue] FAILED in ${district} at "${stage}" (exit ${result.status}).`);
      process.exit(1);
    }
  }
  console.log(`[queue] ${district}: finished`);
}
console.log("\n[queue] all districts finished");
