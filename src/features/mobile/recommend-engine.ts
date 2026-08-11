import {
  inferArea,
  placesByArea,
  type AreaId,
  type MobilePlace,
  type PlaceCategory,
} from "@/features/mobile/mobile-data";

export const ATTRIBUTE_TAXONOMY = [
  "실내",
  "실외",
  "테라스",
  "데이트",
  "혼자",
  "친구모임",
  "가족동반",
  "반려동반",
  "조용함",
  "활기참",
  "감성적",
  "고급스러운",
  "캐주얼",
  "한적함",
  "포토존",
  "휴식",
  "체험형",
  "쇼핑",
] as const;

export const CATEGORY_TAXONOMY: PlaceCategory[] = ["전시", "카페", "팝업", "산책"];

const DEFAULT_CATEGORY_ORDER: PlaceCategory[] = ["카페", "팝업", "전시", "산책"];

export type RecommendIntent = {
  areaId: AreaId | null;
  categories: PlaceCategory[];
  attributes: string[];
  placeCount: number;
};

export type RecommendResult = {
  areaId: AreaId;
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

function haversineKm(a: MobilePlace, b: MobilePlace): number {
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
// picks across more of the area's place pool over repeated generations.
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

export function buildChain(intent: RecommendIntent): RecommendResult {
  const areaId = intent.areaId ?? "seongsu";
  const places = placesByArea[areaId];
  const scored = places
    .map((place) => ({ place, score: scorePlace(place, intent) }))
    .sort((a, b) => b.score - a.score);

  const categoryOrder = intent.categories.length > 0 ? intent.categories : DEFAULT_CATEGORY_ORDER;
  const count = Math.min(Math.max(Math.round(intent.placeCount) || 4, 2), 6);

  const used = new Set<string>();
  const picked: MobilePlace[] = [];
  let round = 0;
  let safety = 0;

  while (picked.length < count && used.size < places.length && safety < count * 6) {
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
    areaId,
    placeIds: orderByRoute(picked).map((place) => place.id),
  };
}

export function fallbackIntent(prompt: string): RecommendIntent {
  return {
    areaId: inferArea(prompt),
    categories: [],
    attributes: [],
    placeCount: 4,
  };
}
