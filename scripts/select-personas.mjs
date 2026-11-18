// Picks 20 personas from scripts/.cache/personas-raw.json: a fixed spread of age band × sex, and inside each
// slot the one that adds the most variety (a family type, a province, an occupation not yet taken).
// Writes scripts/.cache/personas-selected.json. A fixed seed keeps the selection repeatable.

import fs from "node:fs";
import path from "node:path";

const CACHE = path.join(process.cwd(), "scripts", ".cache");
const rows = JSON.parse(fs.readFileSync(path.join(CACHE, "personas-raw.json"), "utf8"));

let seed = 20261118;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

// [min age, max age, sex]
const SLOTS = [
  [20, 29, "여자"], [20, 29, "남자"], [20, 29, "여자"], [20, 29, "남자"],
  [30, 39, "여자"], [30, 39, "남자"], [30, 39, "여자"], [30, 39, "남자"],
  [40, 49, "여자"], [40, 49, "남자"], [40, 49, "여자"], [40, 49, "남자"],
  [50, 59, "여자"], [50, 59, "남자"], [50, 59, "남자"],
  [60, 69, "여자"], [60, 69, "남자"], [60, 69, "여자"],
  [70, 99, "남자"], [70, 99, "여자"],
];

const usedFamily = new Map();
const usedProvince = new Map();
const usedOccupation = new Set();
const chosen = [];

for (const [min, max, sex] of SLOTS) {
  const pool = rows.filter(
    (row) =>
      row.age >= min &&
      row.age <= max &&
      row.sex === sex &&
      row.travel_persona &&
      !chosen.some((other) => other.uuid === row.uuid),
  );
  if (pool.length === 0) {
    console.error(`no candidate for ${min}-${max} ${sex}`);
    continue;
  }
  const scored = pool
    .map((row) => ({
      row,
      score:
        -(usedFamily.get(row.family_type) ?? 0) * 2 -
        (usedProvince.get(row.province) ?? 0) -
        (usedOccupation.has(row.occupation) ? 2 : 0) +
        random(),
    }))
    .sort((a, b) => b.score - a.score);
  const pick = scored[0].row;
  chosen.push(pick);
  usedFamily.set(pick.family_type, (usedFamily.get(pick.family_type) ?? 0) + 1);
  usedProvince.set(pick.province, (usedProvince.get(pick.province) ?? 0) + 1);
  usedOccupation.add(pick.occupation);
}

fs.writeFileSync(path.join(CACHE, "personas-selected.json"), JSON.stringify(chosen, null, 1));
for (const [index, p] of chosen.entries()) {
  console.log(`${index + 1}. ${p.age}세 ${p.sex} · ${p.occupation} · ${p.district} · ${p.family_type} · ${p.marital_status}`);
}
