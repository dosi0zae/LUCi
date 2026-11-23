import seoulPlacesData from "./seoul-places.json";
import enrichmentData from "./place-enrichment.json";
import sampleCourses from "./sample-courses.json";
import { getLoadedDiningPlace } from "./dining-store";
import { getCustomPlace } from "./custom-places";
import { diningTagLabel, localizeMinutes } from "./dining-tags";
import { attributeLabel, localizeFee, localizeHours } from "./attribute-labels";
import type { Locale } from "@/features/mobile/i18n/translations";

// 문화재/관광지/문화시설/축제행사 are destinations. 식당/카페/술집 are dining stops: they can sit in a
// course but are never picked as a course's destinations (`places` below holds destinations only).
export type PlaceCategory = "문화재" | "관광지" | "문화시설" | "축제행사" | "식당" | "카페" | "술집";

export const DINING_CATEGORIES: PlaceCategory[] = ["식당", "카페", "술집"];

export function isDiningCategory(category: PlaceCategory): boolean {
  return DINING_CATEGORIES.includes(category);
}

type LocalizedPlaceFields = {
  name: string;
  description: string;
  area: string;
  tags: string[];
  fee: string;
  hours: string;
  duration: string;
};

export type MobilePlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  area: string;
  address: string;
  description: string;
  duration: string;
  fee: string;
  tags: string[];
  hours: string;
  savedBy: number;
  // 0-100, how well-known a place is to an average Seoul visitor, rated once offline by
  // Gemini (scripts/enrich-place-fame.mjs) — unlike savedBy (a deterministic hash of the
  // id, not real popularity), this tracks actual fame. Optional: places added by hand or
  // before a given enrichment run may not have it yet.
  fameScore?: number;
  // Optional recommendation signals, written by scripts/enrich-places.mjs into
  // place-enrichment.json (an overlay merged in below, so replacing seoul-places.json never
  // loses them). Every one is optional; the engine uses whichever a place has.
  // moods: ids from attribute-vocab.json; energy: 1 restful … 3 a lot of walking/standing;
  // bestTime: parts of the day it is at its best; durationMin: realistic visit length;
  // story: one line on why it is worth going (Korean; handed to Gemini, not shown yet).
  moods?: string[];
  energy?: 1 | 2 | 3;
  bestTime?: ("morning" | "afternoon" | "evening" | "night")[];
  durationMin?: number;
  story?: string;
  lat: number;
  lng: number;
  image?: string;
  // Who the photo is from and under which licence ("한국관광공사 · 공공누리 제1유형", "Name · CC BY-SA 4.0 · Wikimedia Commons"): shown
  // with the photo where it is shown large. Only the photos from sources that require naming have one.
  photoCredit?: string;
  translations?: Partial<Record<"en" | "ja" | "zh", Partial<LocalizedPlaceFields>>>;
  // Which pipeline this place came from — absent for the original TourAPI/문화재청 sync
  // (sync-seoul-places.mjs; their id prefix, tour-/heritage-, already tells them apart).
  // "kakao" marks places dug up from the Kakao Local API (scripts/dig-kakao-places.mjs)
  // to fill gaps that sync left (실제 한강공원 지점들, 이태원/북촌 같은 동네 등) — Kakao
  // gives no description/fee/hours, so those fields are Gemini-written or "정보 없음".
  // A place found on the map screen whose kind we cannot tell (a subway exit, an office): it is shown without one of
  // our categories (category holds a stand-in only so the type is complete).
  uncategorized?: boolean;
  // "custom" = found on the map screen and not in our data (custom-places.ts).
  source?: "kakao" | "dining" | "sights" | "custom";
  // A place only worth a visit at night (a club, a live house): left out of every course unless
  // the request asks for the night (see getScoredPool).
  nightOnly?: boolean;
  // Only dining stops (scripts/build-food-pool.mjs --stage export): tag ids from our closed
  // vocabulary, our own popularity band, the "hot" label from search trends, and the Kakao
  // place page. No ratings or post text are stored.
  dining?: {
    tagIds: string[];
    pop: "high" | "mid";
    hot: "surge" | "rising" | "steady" | "falling" | null;
    kakaoUrl: string;
  };
};

// The address stays in Korean regardless of locale — it's what a taxi driver or map
// app needs, and machine-translating it risks steering someone to the wrong building.
export function localizePlace(place: MobilePlace, locale: Locale): MobilePlace {
  if (locale === "ko") {
    return place;
  }

  // Dining stops carry no translations of their own: the name stays as written, while the
  // district, duration and tags come from shared tables.
  if (place.source === "dining" && place.dining) {
    const tags = place.dining.tagIds.map((id) => diningTagLabel(id, locale)).filter((label): label is string => Boolean(label));
    return {
      ...place,
      area: localizedDistrictName(place.area, locale),
      duration: localizeMinutes(place.duration, locale),
      tags: tags.slice(0, 3),
      description: tags.slice(0, 4).join(" · ") || place.description,
    };
  }

  const translated = place.translations?.[locale];
  // No full translation set (the sights found with the evidence pipeline carry at most a translated name and
  // line): district, length, tags, fee and hours come from the shared tables, the rest from `translated`.
  if (!translated?.area) {
    const shared = {
      ...place,
      area: localizedDistrictName(place.area, locale),
      duration: localizeMinutes(place.duration, locale),
      tags: place.tags.map((tag) => attributeLabel(tag, locale)),
      fee: localizeFee(place.fee, locale),
      hours: localizeHours(place.hours, locale),
    };
    return translated ? { ...shared, ...translated } : shared;
  }

  const localized = { ...place, ...translated };
  // A measured visit length beats the translated category default ("50 min" for every sight).
  return place.durationMin ? { ...localized, duration: localizeMinutes(place.duration, locale) } : localized;
}

export type TripVisibility = "public" | "link" | "private";

type LocalizedTripFields = {
  title: string;
  description: string;
};

export type TripComment = {
  id: string;
  authorName: string;
  text: string;
};

export type FeedTrip = {
  id: string;
  title: string;
  description: string;
  authorHandle: string;
  authorName: string;
  visibility: TripVisibility;
  placeIds: string[];
  likes: number;
  comments: number;
  saved: number;
  rankScore: number;
  isMine: boolean;
  publishedAt: string;
  // The spot whose photo represents the course in lists. Unset = the first spot that has
  // a real photo (see getTripCoverPlace).
  coverPlaceId?: string;
  // The author's own photo (a small JPEG as a data URL, see cover-image.ts): when set it is the cover, instead of a spot's photo.
  coverImage?: string;
  // Seed trips carry en/ja/zh from their theme text; published trips get theirs
  // asynchronously from /api/translate-trip after publish (see handlePublish).
  translations?: Partial<Record<Locale, LocalizedTripFields>>;
};

// Unlike localizePlace, a trip's own title/description isn't reliably Korean (a user
// may publish in any language), so — unlike places — a "ko" translation is used too
// when present instead of always falling back to the stored title/description.
export function localizeTrip(trip: FeedTrip, locale: Locale): FeedTrip {
  const translated = trip.translations?.[locale];
  if (!translated) {
    return trip;
  }
  return { ...trip, ...translated };
}

// Festival entries store their run as "YYYY.MM.DD - YYYY.MM.DD" in `hours` (see
// hoursFromIntro in the sync script). TourAPI's own date filter only bounds the start
// date, so a sync can still pull in festivals whose run already ended by the time the
// app is actually used — filter those out here rather than only at sync time, since
// this list can go stale for a while between syncs.
const FESTIVAL_DATE_RANGE = /^(\d{4})\.(\d{2})\.(\d{2}) - (\d{4})\.(\d{2})\.(\d{2})$/;

function isExpiredFestival(place: MobilePlace): boolean {
  if (place.category !== "축제행사") {
    return false;
  }
  const match = FESTIVAL_DATE_RANGE.exec(place.hours);
  if (!match) {
    return false;
  }
  const [, , , , endYear, endMonth, endDay] = match;
  const end = new Date(Number(endYear), Number(endMonth) - 1, Number(endDay));
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  return end < todayMidnight;
}

// Real, Seoul-wide POI data synced from TourAPI (관광지/문화시설/축제행사) and the
// national heritage open API (문화재) — see scripts/sync-seoul-places.mjs.
// place-enrichment.json (id → optional recommendation signals) is merged over the base data.
type Enrichment = Pick<MobilePlace, "moods" | "energy" | "bestTime" | "durationMin" | "story">;
const enrichment = enrichmentData as Record<string, Enrichment>;

function withEnrichment(place: MobilePlace): MobilePlace {
  const extra = enrichment[place.id];
  if (!extra) {
    return place;
  }
  return {
    ...place,
    ...extra,
    // The category default ("50분") gives way to a measured length.
    duration: extra.durationMin ? `${extra.durationMin}분` : place.duration,
  };
}

export const places: MobilePlace[] = (seoulPlacesData as MobilePlace[])
  .filter((place) => !isExpiredFestival(place))
  .map(withEnrichment);

// Dining stops are not in `places` and not bundled here: they sit in per-district files that
// dining-store loads on demand (see dining-store.ts). getPlaceById finds them once loaded.
const placeLookup = new Map<string, MobilePlace>();
for (const place of places) {
  placeLookup.set(place.id, place);
}

// District name in the UI language, borrowed from the translations the sights already carry.
const districtNames = new Map<string, Partial<Record<"en" | "ja" | "zh", string>>>();
for (const place of places) {
  if (place.translations && !districtNames.has(place.area)) {
    districtNames.set(place.area, {
      en: place.translations.en?.area,
      ja: place.translations.ja?.area,
      zh: place.translations.zh?.area,
    });
  }
}

function localizedDistrictName(area: string, locale: Locale): string {
  return locale === "ko" ? area : (districtNames.get(area)?.[locale] ?? area);
}

export const categoryTone: Record<PlaceCategory, string> = {
  문화재: "#b0742f",
  관광지: "#2f9f8f",
  문화시설: "#7c6cf2",
  축제행사: "#e87957",
  식당: "#d9634a",
  카페: "#a67c52",
  술집: "#5d6bb5",
};

// The app is served over https, and a browser may block or refuse an http:// image on such a page
// (mixed content). These hosts serve the same files over https, so their addresses are upgraded;
// any other host is left as it is (an https page cannot be sure the host answers on https).
const HTTPS_IMAGE_HOSTS = new Set(["tong.visitkorea.or.kr", "www.khs.go.kr", "t1.daumcdn.net", "t1.kakaocdn.net"]);

export function secureImageUrl(url: string): string {
  if (!url.startsWith("http://")) {
    return url;
  }
  const host = url.slice("http://".length).split("/")[0];
  return HTTPS_IMAGE_HOSTS.has(host) ? `https://${url.slice("http://".length)}` : url;
}

// A place's own photo, or null. There is deliberately no stock-photo stand-in: a random picture of
// somewhere else would mislead (and a stand-in service that is down shows a broken image), so
// callers show the category icon tile instead.
export function getPlaceImageUrl(id: string): string | null {
  const place = getPlaceById(id);
  return place?.image ? secureImageUrl(place.image) : null;
}

export function getPlaceById(id: string): MobilePlace | undefined {
  return placeLookup.get(id) ?? getLoadedDiningPlace(id) ?? getCustomPlace(id);
}

// The place whose photo stands for a course: the one the author picked, otherwise the first
// spot with a real photo, otherwise simply the first spot.
export function getTripCoverPlace(trip: Pick<FeedTrip, "placeIds" | "coverPlaceId">): MobilePlace | undefined {
  const tripPlaces = getPlacesByIds(trip.placeIds);
  return (
    tripPlaces.find((place) => place.id === trip.coverPlaceId) ??
    tripPlaces.find((place) => Boolean(place.image)) ??
    tripPlaces[0]
  );
}

export function getPlacesByIds(ids: string[]): MobilePlace[] {
  return ids
    .map((id) => getPlaceById(id))
    .filter((place): place is MobilePlace => Boolean(place));
}

// Minutes to get from one stop to the next. There is no routing service behind this, so it is an estimate from the straight
// line: streets are about 1.3 times longer than it, and up to 1.5 km of street it is a walk at 4.5 km/h; further than that
// the person takes a bus or the subway, about 10 minutes of waiting and getting there plus 3 minutes per km.
const STREET_FACTOR = 1.3;
const WALK_KMH = 4.5;
const MAX_WALK_KM = 1.5;

export function estimateLegMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }): number {
  const streetKm = haversineKm(from, to) * STREET_FACTOR;
  if (streetKm < 0.05) {
    return 0;
  }
  return streetKm <= MAX_WALK_KM ? Math.max(1, Math.round((streetKm / WALK_KMH) * 60)) : Math.round(10 + streetKm * 3);
}

// The time of the course: what is spent at every stop, plus getting from each stop to the next.
export function getTotalMinutes(places: MobilePlace[]): number {
  const visits = places.reduce((total, place) => {
    const minutes = Number.parseInt(place.duration, 10);
    return Number.isNaN(minutes) ? total : total + minutes;
  }, 0);
  let travel = 0;
  for (let index = 1; index < places.length; index += 1) {
    travel += estimateLegMinutes(places[index - 1], places[index]);
  }
  return visits + travel;
}

export function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.asin(Math.sqrt(h));
}

const TRIP_AUTHORS: { handle: string; name: string }[] = [
  { handle: "mina.route", name: "Mina" },
  { handle: "walk.seoul", name: "Walk Seoul" },
  { handle: "festival.finder", name: "Festival Finder" },
  { handle: "museum.hopper", name: "박물관홀릭" },
  { handle: "seoul.dailytrip", name: "서울일상여행" },
  { handle: "heritage.lover", name: "문화재러버" },
  { handle: "night.walker", name: "밤산책러" },
  { handle: "history.buff", name: "역사덕후" },
  { handle: "local.guide", name: "동네가이드" },
  { handle: "photo.spot", name: "포토스팟헌터" },
  { handle: "family.planner", name: "가족나들이" },
  { handle: "weekend.list", name: "주말리스트" },
];

const COMMENT_AUTHORS = [
  "hyun.log",
  "seoulwalker",
  "mina_daily",
  "greentea.log",
  "juju.trip",
  "haneul92",
  "yeon.notes",
  "dabin.k",
  "urban.hiker",
  "cloudynoon",
];

const COMMENT_TEMPLATES = [
  "동선이 편해서 하루 코스로 딱 좋았어요!",
  "사진 찍기 좋은 곳들로 잘 짜여있네요.",
  "저장해뒀다가 이번 주말에 가보려고요.",
  "설명이 자세해서 계획 짜기 편했어요.",
  "장소 하나하나가 다 알차네요, 추천!",
  "혼자 다녀와도 좋을 것 같아요.",
  "다음에 가족이랑 같이 가봐야겠어요.",
  "생각보다 걷는 시간이 짧아서 여유롭게 다녀왔어요.",
  "이 코스 그대로 따라가봤는데 만족스러웠어요.",
  "이 근처 자주 가는데 이런 코스가 있는 줄 몰랐네요.",
];

// Small djb2-style hash — deterministic per trip id (no Math.random) so seed comments
// stay stable across renders and hydrate identically on server and client.
function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

// Only generated seed trips (id "seed-...") get sample comments — a freshly published
// user trip shouldn't already show comments from fake accounts. Picks 2 distinct
// templates/authors per trip by hash so the same trip always shows the same comments.
export function getSeedComments(tripId: string): TripComment[] {
  if (!tripId.startsWith("seed-")) {
    return [];
  }

  const hash = hashString(tripId);
  const firstTemplate = hash % COMMENT_TEMPLATES.length;
  const secondTemplate = (hash + 7) % COMMENT_TEMPLATES.length;
  const firstAuthor = hash % COMMENT_AUTHORS.length;
  const secondAuthor = (hash + 3) % COMMENT_AUTHORS.length;

  const picks =
    firstTemplate === secondTemplate
      ? [[firstTemplate, firstAuthor]]
      : [
          [firstTemplate, firstAuthor],
          [secondTemplate, secondAuthor],
        ];

  return picks.map(([templateIndex, authorIndex], index) => ({
    id: `${tripId}-seed-comment-${index}`,
    authorName: COMMENT_AUTHORS[authorIndex],
    text: COMMENT_TEMPLATES[templateIndex],
  }));
}

// The sample courses in 탐색 are curated, not generated: scripts/build-sample-courses.mjs picks named sights
// with a meal and a café near them, in the order that makes the walk shortest, and writes
// sample-courses.json (re-run it after the place data changes). Dining ids load lazily like any other.
type SampleCourse = {
  title: string;
  description: string;
  translations: Partial<Record<Locale, LocalizedTripFields>>;
  placeIds: string[];
};

function dateDaysBefore(anchor: string, days: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function generateSeedTrips(): FeedTrip[] {
  return (sampleCourses as SampleCourse[])
    .map((course, index): FeedTrip | null => {
      // Only the sights are in `places` at start-up (dining loads on demand); they carry the fame score.
      const sights = course.placeIds.map((id) => placeLookup.get(id)).filter((place): place is MobilePlace => Boolean(place));
      if (course.placeIds.length < 2 || sights.length === 0) {
        return null;
      }

      const seed = (index * 31 + 11) % 97;
      const author = TRIP_AUTHORS[index % TRIP_AUTHORS.length];

      // Engagement/rank numbers follow the sights' real fameScore (0-100 average) so a course of
      // well-known places plausibly ranks higher; `seed` adds a small jitter so similar courses differ.
      const avgFame = sights.reduce((sum, place) => sum + (place.fameScore ?? 50), 0) / sights.length;

      return {
        id: `seed-${index}`,
        title: course.title,
        description: course.description,
        translations: course.translations,
        authorHandle: author.handle,
        authorName: author.name,
        visibility: "public",
        placeIds: course.placeIds,
        likes: Math.round(80 + avgFame * 8 + (seed % 60)),
        comments: Math.round(3 + avgFame / 4 + (seed % 12)),
        saved: Math.round(30 + avgFame * 1.5 + (seed % 100)),
        rankScore: Math.round(avgFame + (seed % 15)),
        isMine: false,
        publishedAt: dateDaysBefore("2026-08-13", index),
      };
    })
    .filter((trip): trip is FeedTrip => trip !== null);
}

export const seedFeedTrips: FeedTrip[] = generateSeedTrips();
