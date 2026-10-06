import { haversineKm, places, type MobilePlace, type PlaceCategory } from "@/features/mobile/mobile-data";

export const ATTRIBUTE_TAXONOMY = [
  "실내",
  "실외",
  "무료",
  "도보코스",
  "혼자",
  "친구모임",
  "가족동반",
  "역사탐방",
  "전통문화",
  "체험형",
  "포토존",
  "야경",
  "조용함",
  "활기참",
  "휴식",
] as const;

export const CATEGORY_TAXONOMY: PlaceCategory[] = ["문화재", "관광지", "문화시설", "축제행사"];

// Derived from the actual data rather than hardcoded, so it can't drift out of sync —
// used to let the AI intent parser name a specific district (e.g. "용산구") and have
// that reliably match a real value instead of a fuzzy/geocoded guess.
export const SEOUL_DISTRICTS: string[] = [...new Set(places.map((place) => place.area))].sort();

const DEFAULT_CATEGORY_ORDER: PlaceCategory[] = ["관광지", "문화재", "문화시설", "축제행사"];

// `intent.areaFilter` is always the Korean district name (that's the ground-truth key
// used to filter `places`) — this looks up how any place in that district spells it in
// another locale, reusing the same per-place translations already synced into the data,
// rather than hand-maintaining a separate district-name translation table that could
// drift out of sync with it.
export function localizeDistrictName(area: string | null, locale: string): string | null {
  if (!area || locale === "ko") {
    return area;
  }
  const example = places.find((place) => place.area === area);
  const translated = example?.translations?.[locale as "en" | "ja" | "zh"]?.area;
  return translated ?? area;
}

// The "wider/narrower" control steps through these; a course stays walkable by default
// (1km) instead of spanning distant districts, but the user can loosen that per search.
export const RADIUS_STEPS_KM = [0.5, 1, 2, 4, 8, 15] as const;
export const DEFAULT_RADIUS_KM: (typeof RADIUS_STEPS_KM)[number] = 1;

const MIN_POOL_SIZE = 6;

export type RecommendIntent = {
  categories: PlaceCategory[];
  attributes: string[];
  placeCount: number;
  // A district name the prompt explicitly named (must match SEOUL_DISTRICTS exactly).
  // When set, this takes over anchoring entirely — the pool is places.area === this,
  // not a radius around some other point — since it's ground truth, not a guess.
  areaFilter?: string | null;
  // Real device location (from the "내 주변" button, or the default current-location
  // anchor when the prompt doesn't name a specific area) or a caller-supplied anchor.
  // When absent, buildChain anchors on its own top-scored place instead.
  anchor?: { lat: number; lng: number } | null;
  // How far from the anchor a course is allowed to span. Defaults to DEFAULT_RADIUS_KM.
  radiusKm?: number;
  // When true, never widen past radiusKm to backfill a sparse area — used by the
  // wider/narrower control so it adjusts scope within the same area rather than
  // silently relocating the course somewhere else entirely.
  strictRadius?: boolean;
  // Inferred from the user's own bookmarked places (see derivePreference), not typed by
  // them — so these nudge scoring rather than filter the pool the way explicit
  // categories/attributes do. Absent for a signed-out user or one with no bookmarks yet.
  preferredCategories?: PlaceCategory[];
  preferredTags?: string[];
  // Set when the prompt asks generically for Seoul's landmarks (no specific district or
  // place named) — routes the pool to SEOUL_LANDMARK_PLACE_IDS instead of the default
  // top-scored-place fallback, since `savedBy` doesn't track real-world fame (see that
  // constant's comment).
  landmarkOnly?: boolean;
  // Set when the prompt names the Han River itself (it's not a SEOUL_DISTRICTS match —
  // the river crosses many districts). Routes the pool to SEOUL_HANGANG_PLACE_IDS instead
  // of anchoring on a single point: see that constant's comment for why.
  hangangOnly?: boolean;
};

// A small curated set of genuinely iconic, widely-recognized Seoul sites (the five grand
// palaces, 종묘, 숭례문, 명동성당, 성균관, 운현궁, 구 서울역사, 남산골한옥마을/남산공원) —
// used when a prompt asks generically for "landmarks" with no specific place or district
// named. `savedBy` can't stand in for this: it's close to random in this dataset (e.g. a
// minor independence-era statue outscores 경복궁), so the usual top-scored-place fallback
// picks obscure places instead of anything most people would call a landmark.
const SEOUL_LANDMARK_PLACE_IDS = new Set([
  "heritage-13-0001170000000", // 경복궁
  "heritage-13-0001220000000", // 창덕궁
  "heritage-13-0001230000000", // 창경궁
  "heritage-13-0001240000000", // 덕수궁
  "heritage-13-0002710000000", // 경희궁지
  "heritage-13-0001250000000", // 종묘
  "heritage-11-0000010000000", // 서울 숭례문
  "heritage-13-0002580000000", // 서울 명동성당
  "heritage-13-0001430000000", // 서울 문묘와 성균관
  "heritage-13-0002570000000", // 서울 운현궁
  "heritage-13-0002840000000", // 구 서울역사
  "tour-126747", // 남산골한옥마을
  "tour-126485", // 남산공원(서울)
]);

// The Han River runs ~40km across Seoul, through a dozen-plus districts — a single
// anchor point (what this used to be: one fixed coordinate near 이촌) can only ever
// surface whatever's within a small radius of that one spot, never the river's actual
// length. This curated set is every genuinely river-adjacent place in the dataset,
// spanning 10 different districts end to end. The named 한강공원 branches weren't in the
// original TourAPI sync at all (dug up separately via Kakao Local API — see
// scripts/dig-kakao-places.mjs, `source: "kakao"` on these entries).
const SEOUL_HANGANG_PLACE_IDS = new Set([
  "kakao-8142957", // 반포한강공원 (서초구)
  "kakao-10952963", // 여의도한강공원 (영등포구)
  "kakao-8136085", // 뚝섬한강공원 (광진구)
  "kakao-8625698", // 이촌한강공원 (용산구)
  "kakao-8126939", // 망원한강공원 (마포구)
  "tour-127859", // 난지한강공원 (마포구)
  "kakao-10952965", // 잠실한강공원 (송파구)
  "kakao-17384905", // 잠원한강공원 (강남구)
  "kakao-8143124", // 양화한강공원 (영등포구)
  "kakao-8631818", // 강서한강공원 (강서구)
  "tour-250252", // 광나루한강공원 (강동구)
  "kakao-8252248", // 노들섬 (용산구)
  "tour-2763685", // 노들나루공원 (동작구)
]);

export type RecommendResult = {
  placeIds: string[];
  // The anchor buildChain actually used (its own top-scored place when the caller
  // didn't supply one) — callers can reuse this for a later same-area radius change.
  anchor: { lat: number; lng: number } | null;
  // intent.placeCount after the same clamp applied internally — callers compare this
  // against placeIds.length to tell "asked for more than the available data/radius
  // could ever supply" apart from any other reason the count might come up short.
  requestedCount: number;
};

function scorePlace(place: MobilePlace, intent: RecommendIntent): number {
  let score = 0;

  if (intent.categories.length > 0 && intent.categories.includes(place.category)) {
    score += 50;
  }

  for (const attribute of intent.attributes) {
    if (place.tags.includes(attribute)) {
      score += 20;
    }
  }

  // savedBy is a deterministic hash of the place id (see sync-seoul-places.mjs's
  // seededSavedBy), not a real popularity signal, so it's close to random with respect to
  // actual fame — a top-savedBy place can be an obscure statue while 경복궁 scores low.
  // fameScore (scripts/enrich-place-fame.mjs, Gemini-rated once offline) tracks real fame,
  // so it gets most of the weight here; savedBy still contributes a little texture, and
  // is the sole signal for any place that hasn't been scored yet.
  const savedByScore = Math.min(20, place.savedBy / 100);
  const fameScore = typeof place.fameScore === "number" ? (place.fameScore / 100) * 20 : savedByScore;
  score += savedByScore * 0.3 + fameScore * 0.7;

  // Weighted well below an explicit category/attribute match (50 / 20) — this is a
  // guess inferred from past behavior, not something the user asked for right now, so
  // it should nudge the pick, not override what they actually typed.
  if (intent.preferredCategories?.includes(place.category)) {
    score += 12;
  }
  for (const tag of intent.preferredTags ?? []) {
    if (place.tags.includes(tag)) {
      score += 6;
    }
  }

  // Randomized per-request so identical prompts don't always return the identical chain.
  score += Math.random() * 14;

  return score;
}

const MAX_PREFERRED_CATEGORIES = 2;
const MAX_PREFERRED_TAGS = 5;

// Turns a user's bookmarked places into a lightweight taste profile: their most-tagged
// categories/attributes, capped so a handful of bookmarks can't already dominate every
// future recommendation. Pure function of place data, so it runs the same way in the
// browser (the plain, non-AI course path) and in the /api/recommend server route (the
// client sends bookmarked ids in the request body, since that route has no access to
// the browser's localStorage).
export function derivePreference(bookmarkedPlaceIds: string[]): {
  preferredCategories: PlaceCategory[];
  preferredTags: string[];
} {
  const bookmarked = places.filter((place) => bookmarkedPlaceIds.includes(place.id));

  const categoryCounts = new Map<PlaceCategory, number>();
  const tagCounts = new Map<string, number>();

  for (const place of bookmarked) {
    categoryCounts.set(place.category, (categoryCounts.get(place.category) ?? 0) + 1);
    for (const tag of place.tags) {
      tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }

  const preferredCategories = [...categoryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PREFERRED_CATEGORIES)
    .map(([category]) => category);

  const preferredTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_PREFERRED_TAGS)
    .map(([tag]) => tag);

  return { preferredCategories, preferredTags };
}

function routeDistance(places: MobilePlace[]): number {
  let total = 0;
  for (let i = 0; i < places.length - 1; i++) {
    total += haversineKm(places[i], places[i + 1]);
  }
  return total;
}

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) {
    return [items];
  }

  return items.flatMap((item, index) => {
    const rest = [...items.slice(0, index), ...items.slice(index + 1)];
    return permutations(rest).map((rest2) => [item, ...rest2]);
  });
}

// A freshly generated course is capped at 6 stops, so brute-forcing every ordering
// (<=720 permutations) finds the true shortest route instead of settling for a greedy
// nearest-neighbor approximation. Only safe up to a handful of stops — factorial growth
// makes this unusable well before EXACT_ROUTE_MAX (see optimizeRoute, which callers with
// a possibly-larger or user-edited chain should use instead of calling this directly).
function orderByRoute(places: MobilePlace[]): MobilePlace[] {
  if (places.length <= 2) {
    return places;
  }

  let best = places;
  let bestDistance = Infinity;

  for (const candidate of permutations(places)) {
    const distance = routeDistance(candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = candidate;
    }
  }

  return best;
}

// Greedy nearest-neighbor fallback for chains too long to brute-force: keeps the first
// stop fixed (it's usually where the user actually is, or intentionally chose to start),
// then repeatedly walks to whichever remaining stop is closest. Not guaranteed optimal,
// but a reasonable approximation and O(n^2) instead of O(n!).
function nearestNeighborOrder(places: MobilePlace[]): MobilePlace[] {
  if (places.length <= 2) {
    return places;
  }

  const remaining = [...places];
  const route = [remaining.shift() as MobilePlace];

  while (remaining.length > 0) {
    const last = route[route.length - 1];
    let nearestIndex = 0;
    let nearestDistance = Infinity;

    remaining.forEach((place, index) => {
      const distance = haversineKm(last, place);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    route.push(remaining.splice(nearestIndex, 1)[0]);
  }

  return route;
}

// A chain a user has manually built (via repeated "add to chain") or loaded from a
// shared link has no upper bound the way a freshly generated course does, and its order
// reflects insertion/edit history rather than an actual shortest route — this is the
// public entry point for "reorder my current stops for the shortest walk", used by the
// route-optimize button. EXACT_ROUTE_MAX=7 (5,040 permutations) is comfortably instant;
// beyond it, nearestNeighborOrder trades optimality for staying fast.
export const EXACT_ROUTE_MAX = 7;

export function optimizeRoute(places: MobilePlace[]): MobilePlace[] {
  return places.length <= EXACT_ROUTE_MAX ? orderByRoute(places) : nearestNeighborOrder(places);
}

// Same as optimizeRoute, but a pinned stop keeps its exact position in the list — only
// the unpinned stops get reshuffled, and they're slotted into the remaining positions so
// the whole walk (pinned stops included as fixed waypoints) is as short as possible.
// Brute-forces the unpinned ordering when there are few enough of them, otherwise falls
// back to optimizing them on their own and filling the free slots in that order.
export function optimizeRoutePreservingPins(places: MobilePlace[], pinnedIds: Set<string>): MobilePlace[] {
  const pinnedSlots = places.flatMap((place, index) => (pinnedIds.has(place.id) ? [index] : []));
  if (pinnedSlots.length === 0) {
    return optimizeRoute(places);
  }

  const free = places.filter((place) => !pinnedIds.has(place.id));
  if (free.length < 2) {
    return places;
  }

  function fill(order: MobilePlace[]): MobilePlace[] {
    const next = [...places];
    let cursor = 0;
    for (let i = 0; i < next.length; i++) {
      if (!pinnedIds.has(places[i].id)) {
        next[i] = order[cursor++];
      }
    }
    return next;
  }

  if (free.length > EXACT_ROUTE_MAX) {
    return fill(optimizeRoute(free));
  }

  let best = places;
  let bestDistance = Infinity;
  for (const candidate of permutations(free)) {
    const filled = fill(candidate);
    const distance = routeDistance(filled);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = filled;
    }
  }
  return best;
}

// Swap one stop for a fresh alternative without touching the rest of the chain. Favors
// places near the one being replaced (so the walk still hangs together), of the same
// category, and better known — then picks randomly among the top few so pressing swap
// repeatedly cycles through different options instead of ping-ponging between two.
// `excludeIds` is for places the user has already swapped away from in this course.
export function pickReplacementStop(
  chain: MobilePlace[],
  index: number,
  options: { areaFilter?: string | null; excludeIds?: Set<string> } = {},
): MobilePlace | null {
  const current = chain[index];
  if (!current) {
    return null;
  }

  const chainIds = new Set(chain.map((place) => place.id));
  const usedCoords = new Set(
    chain.filter((_, i) => i !== index).map((place) => `${place.lat.toFixed(4)},${place.lng.toFixed(4)}`),
  );
  const anchor = [chain[index - 1], chain[index + 1]].filter(Boolean);
  const reference = anchor.length > 0 ? centroid(anchor as MobilePlace[]) : current;

  const ranked = places
    .filter(
      (place) =>
        !chainIds.has(place.id) &&
        !usedCoords.has(`${place.lat.toFixed(4)},${place.lng.toFixed(4)}`) &&
        (!options.areaFilter || place.area === options.areaFilter),
    )
    .map((place) => ({
      place,
      score:
        -haversineKm(reference, place) -
        haversineKm(current, place) * 0.5 +
        (place.fameScore ?? 40) / 40 +
        (place.category === current.category ? 1.5 : 0) -
        (options.excludeIds?.has(place.id) ? 100 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);

  if (ranked.length === 0) {
    return null;
  }
  return ranked[Math.floor(Math.random() * ranked.length)].place;
}

// Sampling from the top few candidates (instead of always the single best) spreads
// picks across more of the pool over repeated generations.
const CANDIDATE_POOL_SIZE = 6;

function pickCandidate(
  scored: { place: MobilePlace; score: number }[],
  used: Set<string>,
  predicate: (place: MobilePlace) => boolean,
): MobilePlace | undefined {
  const candidates = scored
    .filter((entry) => !used.has(entry.place.id) && predicate(entry.place))
    .slice(0, CANDIDATE_POOL_SIZE);

  if (candidates.length === 0) {
    return undefined;
  }

  return candidates[Math.floor(Math.random() * candidates.length)].place;
}

// Respects the user's chosen radius first; only widens past it as a resilience fallback
// when that radius genuinely doesn't have enough places to build a course from (sparse
// area), rather than silently ignoring what they picked. `strict` skips that fallback
// entirely — used when the caller (the wider/narrower control) needs to know whether
// the same area can actually support the requested radius, rather than being quietly
// relocated somewhere else. `candidates` bounds every fallback step, including the final
// "just use everything" one — passing the global `places` list allows spilling anywhere
// in Seoul, while passing a single district's places (see buildChain) means widening can
// never escape that district, no matter how large the radius gets.
function poolNear(
  candidates: MobilePlace[],
  anchor: { lat: number; lng: number },
  radiusKm: number,
  strict: boolean,
): MobilePlace[] {
  const primary = candidates.filter((place) => haversineKm(anchor, place) <= radiusKm);
  if (strict || primary.length >= MIN_POOL_SIZE) {
    return primary;
  }

  for (const fallbackRadius of [radiusKm * 3, radiusKm * 8, 30]) {
    const pool = candidates.filter((place) => haversineKm(anchor, place) <= fallbackRadius);
    if (pool.length >= MIN_POOL_SIZE) {
      return pool;
    }
  }

  return candidates;
}

function centroid(list: MobilePlace[]): { lat: number; lng: number } {
  return {
    lat: list.reduce((sum, place) => sum + place.lat, 0) / list.length,
    lng: list.reduce((sum, place) => sum + place.lng, 0) / list.length,
  };
}

// The geographic/scoring half of building a chain — everything buildChain() does before
// it gets to actually PICKING stops. Factored out so a caller (the /api/recommend route)
// can run its own selection step (e.g. asking Gemini to choose a more thematically
// coherent subset) against the exact same, already-correctly-filtered candidate pool,
// instead of duplicating this logic or risking a selection that violates a district/
// landmark/한강 boundary this function already enforces.
export function getScoredPool(intent: RecommendIntent): {
  scored: { place: MobilePlace; score: number }[];
  anchor: { lat: number; lng: number } | null;
} {
  const scoredAll = places
    .map((place) => ({ place, score: scorePlace(place, intent) }))
    .sort((a, b) => b.score - a.score);

  const areaPlaces = intent.areaFilter ? places.filter((place) => place.area === intent.areaFilter) : null;
  const hangangPlaces = intent.hangangOnly
    ? places.filter((place) => SEOUL_HANGANG_PLACE_IDS.has(place.id))
    : null;
  const landmarkPlaces = intent.landmarkOnly
    ? places.filter((place) => SEOUL_LANDMARK_PLACE_IDS.has(place.id))
    : null;

  let anchor: { lat: number; lng: number } | null;
  let pool: MobilePlace[];

  if (areaPlaces && areaPlaces.length > 0) {
    // The named district is ground truth for WHICH area, but radius still controls HOW
    // MUCH of it is used — poolNear's candidate list here is areaPlaces, not the global
    // places list, so even its widest resilience fallback can never spill into a
    // neighboring district the way the plain radius path below can.
    anchor = centroid(areaPlaces);
    const radiusKm = intent.radiusKm ?? DEFAULT_RADIUS_KM;
    pool = poolNear(areaPlaces, anchor, radiusKm, intent.strictRadius ?? false);
  } else if (hangangPlaces && hangangPlaces.length > 0) {
    // Same shape again, candidates is the curated Han River list. With only 3 entries
    // (all below MIN_POOL_SIZE), poolNear's own fallback ladder always bottoms out at
    // "return candidates" — so this reliably returns all 3, spanning real districts,
    // regardless of radius — never the single-point-radius cluster this used to be.
    anchor = centroid(hangangPlaces);
    const radiusKm = intent.radiusKm ?? DEFAULT_RADIUS_KM;
    pool = poolNear(hangangPlaces, anchor, radiusKm, intent.strictRadius ?? false);
  } else if (landmarkPlaces && landmarkPlaces.length > 0) {
    // Same shape as the areaPlaces branch above, but candidates is the curated landmark
    // list instead of a district — radius still narrows/widens within it.
    anchor = centroid(landmarkPlaces);
    const radiusKm = intent.radiusKm ?? DEFAULT_RADIUS_KM;
    pool = poolNear(landmarkPlaces, anchor, radiusKm, intent.strictRadius ?? false);
  } else {
    anchor = intent.anchor ?? scoredAll[0]?.place ?? null;
    const radiusKm = intent.radiusKm ?? DEFAULT_RADIUS_KM;
    pool = anchor ? poolNear(places, anchor, radiusKm, intent.strictRadius ?? false) : places;
  }

  const poolIds = new Set(pool.map((place) => place.id));
  const scored = scoredAll.filter((entry) => poolIds.has(entry.place.id));

  return { scored, anchor };
}

export function buildChain(intent: RecommendIntent): RecommendResult {
  const { scored, anchor } = getScoredPool(intent);

  const categoryOrder = intent.categories.length > 0 ? intent.categories : DEFAULT_CATEGORY_ORDER;
  const count = Math.min(Math.max(Math.round(intent.placeCount) || 4, 2), 6);

  const used = new Set<string>();
  // Some data sources (the heritage API's individually-catalogued museum artifacts, e.g.)
  // can still land several places on the exact same coordinate even after the
  // dedupe-venue-clusters.mjs cleanup — picking two of them into one chain would mean
  // "visit the same building twice" as separate stops. Block a second pick at a
  // coordinate already in the chain, independent of place id.
  const usedCoords = new Set<string>();
  const picked: MobilePlace[] = [];
  let round = 0;
  let safety = 0;

  while (picked.length < count && used.size < scored.length && safety < count * 6) {
    const category = categoryOrder[round % categoryOrder.length];
    const notAtUsedCoord = (place: MobilePlace) => !usedCoords.has(`${place.lat.toFixed(4)},${place.lng.toFixed(4)}`);
    const next =
      pickCandidate(scored, used, (place) => place.category === category && notAtUsedCoord(place)) ??
      pickCandidate(scored, used, notAtUsedCoord) ??
      pickCandidate(scored, used, () => true);

    if (next) {
      picked.push(next);
      used.add(next.id);
      usedCoords.add(`${next.lat.toFixed(4)},${next.lng.toFixed(4)}`);
    }

    round++;
    safety++;
  }

  return {
    placeIds: orderByRoute(picked).map((place) => place.id),
    anchor,
    requestedCount: count,
  };
}

// Cheapest-insertion heuristic: finds the position in an existing (already-ordered)
// route that adds the least total distance when a new stop is dropped in — rather than
// always appending at the end. Only decides where the NEW stop goes; every other stop's
// relative order is left untouched, so a later manual drag-reorder is never re-optimized
// away by this or by a future call to it.
export function findBestInsertionIndex(existingPlaces: MobilePlace[], newPlace: MobilePlace): number {
  if (existingPlaces.length === 0) {
    return 0;
  }

  let bestIndex = existingPlaces.length;
  let bestCost = haversineKm(existingPlaces[existingPlaces.length - 1], newPlace);

  const startCost = haversineKm(newPlace, existingPlaces[0]);
  if (startCost < bestCost) {
    bestCost = startCost;
    bestIndex = 0;
  }

  for (let i = 0; i < existingPlaces.length - 1; i++) {
    const added =
      haversineKm(existingPlaces[i], newPlace) +
      haversineKm(newPlace, existingPlaces[i + 1]) -
      haversineKm(existingPlaces[i], existingPlaces[i + 1]);

    if (added < bestCost) {
      bestCost = added;
      bestIndex = i + 1;
    }
  }

  return bestIndex;
}

export function fallbackIntent(): RecommendIntent {
  return {
    categories: [],
    attributes: [],
    placeCount: 4,
  };
}
