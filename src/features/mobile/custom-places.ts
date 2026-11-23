import type { MobilePlace, PlaceCategory } from "@/features/mobile/mobile-data";

// Places that are not in our own data: whatever the user finds on the map screen (a hotel, a corner shop, an address)
// and adds to a course. They are kept here (id `custom-<kakao id>`) so every lookup by id (getPlaceById) finds them
// like any other place, and in localStorage so a course that holds one still opens after a reload.
//
// This module must not import mobile-data at runtime (mobile-data imports it).

const STORAGE_KEY = "tripchain:custom-places";
const MAX_STORED = 150;

const places = new Map<string, MobilePlace>();
const listeners = new Set<() => void>();
let hydrated = false;

export function isCustomId(id: string): boolean {
  return id.startsWith("custom-");
}

function hydrate() {
  if (hydrated || typeof window === "undefined") {
    return;
  }
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as MobilePlace[]) : [];
    for (const place of parsed) {
      if (place && typeof place.id === "string" && isCustomId(place.id) && !places.has(place.id)) {
        places.set(place.id, place);
      }
    }
  } catch {
    // Unreadable storage: start with none.
  }
}

function persist() {
  try {
    // Oldest first in the map, so the newest ones survive the cut.
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...places.values()].slice(-MAX_STORED)));
  } catch {
    // Storage may be unavailable (private mode, quota) — best effort.
  }
}

export function getCustomPlace(id: string): MobilePlace | undefined {
  if (!isCustomId(id)) {
    return undefined;
  }
  hydrate();
  return places.get(id);
}

// Loads the saved ones (once) and tells listeners, so screens that read places while rendering look again.
export function loadCustomPlaces() {
  const before = places.size;
  hydrate();
  if (places.size !== before) {
    listeners.forEach((listener) => listener());
  }
}

export function registerCustomPlace(place: MobilePlace) {
  hydrate();
  places.delete(place.id);
  places.set(place.id, place);
  persist();
  listeners.forEach((listener) => listener());
}

export function subscribeCustomPlaces(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// ---- turning a map search result into a place ----------------------------------------------------------------

export type MapSearchResult = {
  // Kakao's place id for a place, or the coordinates for a bare address.
  id: string;
  name: string;
  address: string;
  // Kakao's category text ("음식점 > 카페 > 커피전문점") and group code ("CE7"), empty for an address.
  categoryName: string;
  categoryGroup: string;
  lat: number;
  lng: number;
  kind: "place" | "address";
};

// Our category for a search result, or null when it is none of them (a station, a shop, an address): those are not
// called sights just to fill the field.
export function categoryOfResult(result: Pick<MapSearchResult, "categoryName" | "categoryGroup">): PlaceCategory | null {
  const { categoryName, categoryGroup } = result;
  if (categoryGroup === "CE7" || /카페/.test(categoryName)) return "카페";
  if (/술집|바\(BAR\)|호프|주점|와인|칵테일|포장마차/.test(categoryName)) return "술집";
  if (categoryGroup === "FD6") return "식당";
  if (categoryGroup === "CT1") return "문화시설";
  if (categoryGroup === "AT4") return "관광지";
  return null;
}

// The words to show for a place's kind: our category, or Kakao's own wording for one we could not sort.
export function categoryText(place: MobilePlace, label: (category: PlaceCategory) => string): string {
  return place.uncategorized ? (place.tags[0] ?? "") : label(place.category);
}

const SEOUL_DISTRICT = /서울(?:특별시)?\s+(\S+?[구])(?:\s|$)/;

// A custom place as it travels in a shared link: the receiver does not have it (it lives in the sharer's localStorage),
// so the link carries what is needed to draw it. [id, name, lat, lng, address, category, kind text, uncategorized 0/1]
export type SharedCustomPlace = [string, string, number, number, string, string, string, number];

const CATEGORIES: PlaceCategory[] = ["문화재", "관광지", "문화시설", "축제행사", "식당", "카페", "술집"];

export function customPlaceToShared(place: MobilePlace): SharedCustomPlace {
  const round = (value: number) => Math.round(value * 1e5) / 1e5;
  return [place.id, place.name, round(place.lat), round(place.lng), place.address, place.category, place.tags[0] ?? "", place.uncategorized ? 1 : 0];
}

// The other way, for what a link holds: anything that is not well-formed is dropped (a link is text from anyone).
export function placeFromShared(entry: unknown): MobilePlace | null {
  if (!Array.isArray(entry) || entry.length < 8) {
    return null;
  }
  const [id, name, lat, lng, address, category, kind, uncategorized] = entry;
  if (
    typeof id !== "string" || !isCustomId(id) || id.length > 60 ||
    typeof name !== "string" || !name ||
    typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng) ||
    Math.abs(lat) > 90 || Math.abs(lng) > 180 ||
    typeof address !== "string" || typeof kind !== "string" ||
    typeof category !== "string" || !CATEGORIES.includes(category as PlaceCategory)
  ) {
    return null;
  }
  const isDining = category === "식당" || category === "카페" || category === "술집";
  const text = kind.slice(0, 40);
  return {
    id,
    name: name.slice(0, 80),
    category: category as PlaceCategory,
    area: SEOUL_DISTRICT.exec(address)?.[1] ?? "",
    address: address.slice(0, 160),
    description: text || address.slice(0, 160),
    duration: isDining ? "60분" : "45분",
    fee: "정보 없음",
    tags: text ? [text] : [],
    hours: "정보 없음",
    savedBy: 0,
    lat,
    lng,
    source: "custom",
    uncategorized: uncategorized === 1,
  };
}

export function placeFromResult(result: MapSearchResult): MobilePlace {
  const known = categoryOfResult(result);
  const category = known ?? "관광지";
  const isDining = category === "식당" || category === "카페" || category === "술집";
  const district = SEOUL_DISTRICT.exec(result.address)?.[1] ?? "";
  const kind = result.categoryName.split(">").map((part) => part.trim()).filter(Boolean).pop() ?? "";

  return {
    id: `custom-${result.id}`,
    name: result.name,
    category,
    area: district,
    address: result.address,
    description: result.kind === "address" ? result.address : kind || result.categoryName || result.address,
    duration: isDining ? "60분" : "45분",
    fee: "정보 없음",
    tags: kind ? [kind] : [],
    hours: "정보 없음",
    savedBy: 0,
    lat: result.lat,
    lng: result.lng,
    source: "custom",
    uncategorized: known === null,
  };
}
