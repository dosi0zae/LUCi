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

const DEFAULT_CATEGORY_ORDER: PlaceCategory[] = ["관광지", "문화재", "문화시설", "축제행사"];

// Places beyond this radius of the chain's anchor point are excluded first; only if that
// leaves too few candidates do we widen the search, so a generated course stays walkable
// across the flat, city-wide place pool instead of jumping between distant districts.
const NEARBY_RADIUS_KM = 6;
const WIDE_RADIUS_KM = 14;
const MIN_POOL_SIZE = 6;

export type RecommendIntent = {
  categories: PlaceCategory[];
  attributes: string[];
  placeCount: number;
  // Real device location (from the "내 주변" button) or a caller-supplied anchor. When
  // absent, buildChain anchors on its own top-scored place instead.
  anchor?: { lat: number; lng: number } | null;
};

export type RecommendResult = {
  placeIds: string[];
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

function poolNear(anchor: { lat: number; lng: number }): MobilePlace[] {
  const nearby = places.filter((place) => haversineKm(anchor, place) <= NEARBY_RADIUS_KM);
  if (nearby.length >= MIN_POOL_SIZE) {
    return nearby;
  }

  const wide = places.filter((place) => haversineKm(anchor, place) <= WIDE_RADIUS_KM);
  return wide.length >= MIN_POOL_SIZE ? wide : places;
}

export function buildChain(intent: RecommendIntent): RecommendResult {
  const scoredAll = places
    .map((place) => ({ place, score: scorePlace(place, intent) }))
    .sort((a, b) => b.score - a.score);

  const anchor = intent.anchor ?? scoredAll[0]?.place ?? null;
  const pool = anchor ? poolNear(anchor) : places;
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
