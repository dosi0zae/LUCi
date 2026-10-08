import { getPlacesByIds, type FeedTrip, type MobilePlace } from "@/features/mobile/mobile-data";

// "나의 취향" for ordering the Explore feed, learned only from what the user has done on this
// device: places they saved, courses they saved, and courses they liked. Each signal votes for
// the categories, districts and tags of the places involved (a saved place counts most).
const WEIGHT_SAVED_PLACE = 2;
const WEIGHT_SAVED_TRIP = 1.5;
const WEIGHT_LIKED_TRIP = 1;

export type TasteProfile = {
  category: Map<string, number>;
  area: Map<string, number>;
  tag: Map<string, number>;
  savedPlaceIds: Set<string>;
  // Sum of all vote weights; 0 means there is nothing to personalize from yet.
  total: number;
};

function vote(map: Map<string, number>, key: string, weight: number) {
  map.set(key, (map.get(key) ?? 0) + weight);
}

export function buildTasteProfile(input: {
  likedTrips: FeedTrip[];
  savedTrips: FeedTrip[];
  savedPlaces: MobilePlace[];
}): TasteProfile {
  const profile: TasteProfile = {
    category: new Map(),
    area: new Map(),
    tag: new Map(),
    savedPlaceIds: new Set(input.savedPlaces.map((place) => place.id)),
    total: 0,
  };

  function addPlace(place: MobilePlace, weight: number) {
    vote(profile.category, place.category, weight);
    vote(profile.area, place.area, weight);
    for (const tag of place.tags) {
      vote(profile.tag, tag, weight * 0.5);
    }
    profile.total += weight;
  }

  for (const place of input.savedPlaces) {
    addPlace(place, WEIGHT_SAVED_PLACE);
  }
  for (const trip of input.savedTrips) {
    for (const place of getPlacesByIds(trip.placeIds)) {
      addPlace(place, WEIGHT_SAVED_TRIP);
    }
  }
  for (const trip of input.likedTrips) {
    for (const place of getPlacesByIds(trip.placeIds)) {
      addPlace(place, WEIGHT_LIKED_TRIP);
    }
  }
  return profile;
}

// How well a course fits the taste profile: the average, over its places, of how much of the
// user's votes went to that place's category, district and tags — plus a bonus for places
// the user already saved, and a small nudge from general popularity so equally good fits
// still show the better-loved one first.
export function tasteScore(trip: FeedTrip, taste: TasteProfile): number {
  const popularity = (trip.rankScore / 100) * 0.25;
  if (taste.total === 0) {
    return popularity;
  }
  const tripPlaces = getPlacesByIds(trip.placeIds);
  if (tripPlaces.length === 0) {
    return popularity;
  }

  let fit = 0;
  let savedHits = 0;
  for (const place of tripPlaces) {
    const tagFit = place.tags.length
      ? place.tags.reduce((sum, tag) => sum + (taste.tag.get(tag) ?? 0), 0) / place.tags.length
      : 0;
    fit +=
      (taste.category.get(place.category) ?? 0) / taste.total +
      (taste.area.get(place.area) ?? 0) / taste.total +
      tagFit / taste.total;
    if (taste.savedPlaceIds.has(place.id)) {
      savedHits += 1;
    }
  }
  return fit / tripPlaces.length + (savedHits / tripPlaces.length) * 1.5 + popularity;
}
