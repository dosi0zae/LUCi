import { places, type MobilePlace, type PlaceCategory } from "@/features/mobile/mobile-data";

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

  // Randomized per-request so identical prompts don't always return the identical chain.
  score += Math.random() * 14;

  return score;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
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

// Picks are capped at 6, so brute-forcing every ordering (<=720 permutations) finds the
// true shortest route instead of settling for a greedy nearest-neighbor approximation.
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
