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
};

export type RecommendResult = {
  placeIds: string[];
  // The anchor buildChain actually used (its own top-scored place when the caller
  // didn't supply one) — callers can reuse this for a later same-area radius change.
  anchor: { lat: number; lng: number } | null;
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

  score += Math.min(20, place.savedBy / 100);

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
const EXACT_ROUTE_MAX = 7;

export function optimizeRoute(places: MobilePlace[]): MobilePlace[] {
  return places.length <= EXACT_ROUTE_MAX ? orderByRoute(places) : nearestNeighborOrder(places);
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
// relocated somewhere else.
function poolNear(anchor: { lat: number; lng: number }, radiusKm: number, strict: boolean): MobilePlace[] {
  const primary = places.filter((place) => haversineKm(anchor, place) <= radiusKm);
  if (strict || primary.length >= MIN_POOL_SIZE) {
    return primary;
  }

  for (const fallbackRadius of [radiusKm * 3, radiusKm * 8, 30]) {
    const pool = places.filter((place) => haversineKm(anchor, place) <= fallbackRadius);
    if (pool.length >= MIN_POOL_SIZE) {
      return pool;
    }
  }

  return places;
}

function centroid(list: MobilePlace[]): { lat: number; lng: number } {
  return {
    lat: list.reduce((sum, place) => sum + place.lat, 0) / list.length,
    lng: list.reduce((sum, place) => sum + place.lng, 0) / list.length,
  };
}

export function buildChain(intent: RecommendIntent): RecommendResult {
  const scoredAll = places
    .map((place) => ({ place, score: scorePlace(place, intent) }))
    .sort((a, b) => b.score - a.score);

  const areaPlaces = intent.areaFilter ? places.filter((place) => place.area === intent.areaFilter) : null;

  let anchor: { lat: number; lng: number } | null;
  let pool: MobilePlace[];

  if (areaPlaces && areaPlaces.length > 0) {
    // Ground truth beats a radius guess: the whole district is the pool, no distance
    // cutoff needed since every place in it already belongs to the named area.
    anchor = centroid(areaPlaces);
    pool = areaPlaces;
  } else {
    anchor = intent.anchor ?? scoredAll[0]?.place ?? null;
    const radiusKm = intent.radiusKm ?? DEFAULT_RADIUS_KM;
    pool = anchor ? poolNear(anchor, radiusKm, intent.strictRadius ?? false) : places;
  }

  const poolIds = new Set(pool.map((place) => place.id));
  const scored = scoredAll.filter((entry) => poolIds.has(entry.place.id));

  const categoryOrder = intent.categories.length > 0 ? intent.categories : DEFAULT_CATEGORY_ORDER;
  const count = Math.min(Math.max(Math.round(intent.placeCount) || 4, 2), 6);

  const used = new Set<string>();
  const picked: MobilePlace[] = [];
  let round = 0;
  let safety = 0;

  while (picked.length < count && used.size < scored.length && safety < count * 6) {
    const category = categoryOrder[round % categoryOrder.length];
    const next =
      pickCandidate(scored, used, (place) => place.category === category) ??
      pickCandidate(scored, used, () => true);

    if (next) {
      picked.push(next);
      used.add(next.id);
    }

    round++;
    safety++;
  }

  return {
    placeIds: orderByRoute(picked).map((place) => place.id),
    anchor,
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
