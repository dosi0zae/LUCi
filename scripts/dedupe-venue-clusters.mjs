// One-off/refreshable cleanup, run after sync-seoul-places.mjs (and ideally after
// enrich-place-fame.mjs, so the "best" pick below is fame-informed):
//
// 1. Drops places with invalid (0,0) coordinates — a handful of heritage API entries
//    never got geocoded, so they'd sit on "null island" on the map and distort any
//    distance math that touches them.
// 2. Collapses "venue clusters" — 3+ places sharing the exact same lat/lng — down to a
//    single representative. The heritage sync pulls 국보 (KDCD 11) as one entry PER
//    ARTIFACT, so 서울 국립중앙박물관's address alone was backing 29 separate "places"
//    (a bronze mirror, a celadon jar, a Buddha statue, ...) that are really one indoor
//    museum visit, not 29 distinct, walkable chain stops. A course that picked 3-4 of
//    them read as nonsense (e.g. "핫플레이스" pulling in three random museum artifacts
//    housed in the same building as its "lively" recommendation). Keeping the
//    highest-fameScore item per cluster preserves one genuine, well-known representative
//    (e.g. 훈민정음 for 간송미술관) instead of deleting the venue from the data outright.
//
// Run with: node scripts/dedupe-venue-clusters.mjs

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIN_CLUSTER_SIZE = 3;

// Second pass: the heritage API geocodes each artifact to its own precise pin within a
// museum's grounds (different hall, different spot in a sculpture garden, ...), so several
// of its "같은 건물" duplicates survive the coordinate-exact-match pass above with
// coordinates a few hundred meters apart, and their address strings aren't byte-identical
// either ("서울특별시 용산구 ... (용산동6가, 국립중앙박물관)" vs "서울 용산구 ..., 국립중앙박물관
// (용산동6가)"). Matching on the venue name embedded in the address catches these where
// exact coordinate/address matching doesn't. Restricted to 문화재 (heritage) — that's the
// category where "one venue, many catalogued pieces" happens; a historic building that
// happens to now house a museum (e.g. 구 벨기에영사관, now a 서울시립미술관 branch) is a
// singleton under its own venue name, so it's untouched.
const VENUE_NAME_PATTERN = /([가-힣A-Za-z·]+(?:박물관|미술관))/;

function main() {
  const dataPath = path.join(ROOT, "src", "features", "mobile", "seoul-places.json");
  const places = JSON.parse(readFileSync(dataPath, "utf8"));

  const withCoords = places.filter((place) => !(place.lat === 0 && place.lng === 0));
  const droppedZeroCoord = places.length - withCoords.length;

  const byCoord = new Map();
  for (const place of withCoords) {
    const key = `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`;
    if (!byCoord.has(key)) byCoord.set(key, []);
    byCoord.get(key).push(place);
  }

  const kept = [];
  let droppedClusterDuplicates = 0;

  for (const cluster of byCoord.values()) {
    // Only collapse when every place in the cluster is the SAME category (문화재 in
    // practice) — that's the actual signature of "one museum, many catalogued artifacts".
    // A cluster mixing categories at one coordinate (e.g. a district office hosting an
    // art hall plus two unrelated festivals) is genuinely distinct content that just
    // happens to share a geocoded address, and must not be collapsed.
    const sameCategory = cluster.every((place) => place.category === cluster[0].category);
    if (cluster.length < MIN_CLUSTER_SIZE || !sameCategory) {
      kept.push(...cluster);
      continue;
    }
    const sorted = [...cluster].sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0));
    kept.push(sorted[0]);
    droppedClusterDuplicates += cluster.length - 1;
    console.log(
      `Collapsed ${cluster.length} ${cluster[0].category} places at ${cluster[0].address} -> kept "${sorted[0].name}" (fame ${sorted[0].fameScore ?? "n/a"})`,
    );
  }

  // Second pass, by venue name extracted from the address — only within 문화재, only
  // groups of 2+ (these are smaller than the coordinate clusters above since they're the
  // ones that pass had already missed).
  const byVenue = new Map();
  const rest = [];
  for (const place of kept) {
    const match = place.category === "문화재" ? place.address.match(VENUE_NAME_PATTERN) : null;
    if (!match) {
      rest.push(place);
      continue;
    }
    const key = match[1];
    if (!byVenue.has(key)) byVenue.set(key, []);
    byVenue.get(key).push(place);
  }

  const keptFinal = [...rest];
  let droppedVenueNameDuplicates = 0;

  for (const [venue, cluster] of byVenue.entries()) {
    if (cluster.length < 2) {
      keptFinal.push(...cluster);
      continue;
    }
    const sorted = [...cluster].sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0));
    keptFinal.push(sorted[0]);
    droppedVenueNameDuplicates += cluster.length - 1;
    console.log(`Collapsed ${cluster.length} 문화재 places at "${venue}" -> kept "${sorted[0].name}" (fame ${sorted[0].fameScore ?? "n/a"})`);
  }

  writeFileSync(dataPath, JSON.stringify(keptFinal, null, 2), "utf8");
  console.log(
    `Dropped ${droppedZeroCoord} invalid-coordinate place(s), ${droppedClusterDuplicates} coordinate-cluster duplicate(s), and ${droppedVenueNameDuplicates} venue-name duplicate(s).`,
  );
  console.log(`Wrote ${keptFinal.length} places (was ${places.length}) to ${path.relative(ROOT, dataPath)}`);
}

main();
