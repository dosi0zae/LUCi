import districtCodes from "./dining-data/districts.json";
import type { MobilePlace } from "@/features/mobile/mobile-data";

// Dining stops live in one JSON file per district (dining-data/<code>.json), loaded only when a
// course, a saved trip or a share link actually needs them, instead of bundling every district
// into the app up front. A dining id is `dining-<code>-<kakaoId>`, so the district file to load is
// readable straight from the id.
//
// This module must not import mobile-data at runtime (mobile-data imports it).

const loadedPlaces = new Map<string, MobilePlace>();
const loadedDistricts = new Set<string>();
const pending = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

const ID_PATTERN = /^dining-([a-z]+)-/;

const ALL_CODES = Object.values(districtCodes as Record<string, string>);

export function diningDistrictCodeOf(id: string): string | null {
  return ID_PATTERN.exec(id)?.[1] ?? null;
}

export function isDiningId(id: string): boolean {
  return ID_PATTERN.test(id);
}

export function getLoadedDiningPlace(id: string): MobilePlace | undefined {
  return loadedPlaces.get(id);
}

export function getLoadedDiningPlaces(): MobilePlace[] {
  return [...loadedPlaces.values()];
}

// Calls back after a district finishes loading, so the UI can re-read places it asked for earlier.
export function subscribeDining(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function loadDistrict(code: string): Promise<void> {
  if (loadedDistricts.has(code)) {
    return;
  }
  let inflight = pending.get(code);
  if (!inflight) {
    inflight = (async () => {
      try {
        const loaded = (await import(`./dining-data/${code}.json`)) as { default: MobilePlace[] };
        for (const place of loaded.default) {
          loadedPlaces.set(place.id, place);
        }
        loadedDistricts.add(code);
        listeners.forEach((listener) => listener());
      } catch {
        // A district whose data hasn't been exported yet (or an unknown code): treat as empty.
      } finally {
        pending.delete(code);
      }
    })();
    pending.set(code, inflight);
  }
  await inflight;
}

// Loads the districts that the dining ids among `ids` belong to. Non-dining ids are ignored.
export async function ensureDiningLoadedForIds(ids: Iterable<string>): Promise<void> {
  const codes = new Set<string>();
  for (const id of ids) {
    const code = diningDistrictCodeOf(id);
    if (code && !loadedDistricts.has(code)) {
      codes.add(code);
    }
  }
  await Promise.all([...codes].map(loadDistrict));
}

// Server-side recommendation needs the whole pool at once.
export async function ensureAllDiningLoaded(): Promise<void> {
  await Promise.all(ALL_CODES.map(loadDistrict));
}
