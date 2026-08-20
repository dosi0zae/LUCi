import seoulPlacesData from "./seoul-places.json";
import type { Locale } from "@/features/mobile/i18n/translations";

export type PlaceCategory = "문화재" | "관광지" | "문화시설" | "축제행사";

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
  lat: number;
  lng: number;
  image?: string;
  translations?: Partial<Record<"en" | "ja" | "zh", LocalizedPlaceFields>>;
};

// The address stays in Korean regardless of locale — it's what a taxi driver or map
// app needs, and machine-translating it risks steering someone to the wrong building.
export function localizePlace(place: MobilePlace, locale: Locale): MobilePlace {
  if (locale === "ko") {
    return place;
  }

  const translated = place.translations?.[locale];
  if (!translated) {
    return place;
  }

  return { ...place, ...translated };
}

export type TripVisibility = "public" | "link" | "private";

type LocalizedTripFields = {
  title: string;
  description: string;
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
export const places: MobilePlace[] = (seoulPlacesData as MobilePlace[]).filter(
  (place) => !isExpiredFestival(place),
);

export const categoryTone: Record<PlaceCategory, string> = {
  문화재: "#b0742f",
  관광지: "#2f9f8f",
  문화시설: "#7c6cf2",
  축제행사: "#e87957",
};

export function getPlaceImageUrl(id: string, width = 240, height = 320): string {
  const place = getPlaceById(id);
  if (place?.image) {
    return place.image;
  }
  return `https://picsum.photos/seed/${id}/${width}/${height}`;
}

export function getPlaceById(id: string): MobilePlace | undefined {
  return places.find((place) => place.id === id);
}

export function getPlacesByIds(ids: string[]): MobilePlace[] {
  return ids
    .map((id) => getPlaceById(id))
    .filter((place): place is MobilePlace => Boolean(place));
}

export function getTotalMinutes(places: MobilePlace[]): number {
  return places.reduce((total, place) => {
    const minutes = Number.parseInt(place.duration, 10);
    return Number.isNaN(minutes) ? total : total + minutes;
  }, 0);
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

type TripTheme = {
  title: string;
  description: string;
  categories: PlaceCategory[];
  translations: Partial<Record<Locale, LocalizedTripFields>>;
};

const TRIP_THEMES: TripTheme[] = [
  {
    title: "고궁과 박물관을 잇는 하루",
    description: "대표 고궁과 근처 박물관을 묶어 걷는 정통 코스.",
    categories: ["문화재", "문화시설", "문화재", "문화시설"],
    translations: {
      en: { title: "A Day Linking Palaces and Museums", description: "A classic route connecting a landmark palace with nearby museums." },
      ja: { title: "古宮と博物館をつなぐ一日", description: "代表的な古宮と近くの博物館を巡る定番コース。" },
      zh: { title: "串联古宫与博物馆的一天", description: "串联代表性古宫与附近博物馆的经典路线。" },
    },
  },
  {
    title: "역사 유적 탐방 코스",
    description: "국보와 사적 위주로 서울의 역사를 짚어보는 코스.",
    categories: ["문화재", "문화재", "관광지", "문화재"],
    translations: {
      en: { title: "Historic Landmarks Tour", description: "A course tracing Seoul's history through National Treasures and historic sites." },
      ja: { title: "史跡巡りコース", description: "国宝と史跡を中心にソウルの歴史をたどるコース。" },
      zh: { title: "历史古迹探访路线", description: "以国宝和史迹为主，回顾首尔历史的路线。" },
    },
  },
  {
    title: "지금 열리는 축제 나들이",
    description: "요즘 열리는 축제와 근처 명소를 함께 즐기는 코스.",
    categories: ["축제행사", "관광지", "축제행사", "문화시설"],
    translations: {
      en: { title: "Festivals Happening Now", description: "Enjoy a current festival alongside nearby attractions." },
      ja: { title: "今開催中の祭りめぐり", description: "今開催中の祭りと近くの名所を一緒に楽しむコース。" },
      zh: { title: "正在举行的节庆之旅", description: "一起享受近期节庆活动与附近景点的路线。" },
    },
  },
  {
    title: "전통과 현대가 만나는 코스",
    description: "옛 유산과 요즘 전시 공간을 번갈아 즐기는 코스.",
    categories: ["문화재", "문화시설", "관광지", "문화시설"],
    translations: {
      en: { title: "Where Tradition Meets Today", description: "Alternate between old heritage and contemporary exhibition spaces." },
      ja: { title: "伝統と現代が出会うコース", description: "昔ながらの遺産と最近の展示空間を交互に楽しむコース。" },
      zh: { title: "传统与现代交融的路线", description: "在传统遗产与现代展览空间之间穿梭的路线。" },
    },
  },
  {
    title: "서울 대표 명소 도장깨기",
    description: "처음 서울에 왔다면 놓치기 아쉬운 핵심 코스.",
    categories: ["관광지", "문화재", "관광지", "문화시설"],
    translations: {
      en: { title: "Seoul's Must-See Highlights", description: "The essential route for first-time visitors to Seoul." },
      ja: { title: "ソウル代表スポット制覇", description: "初めてソウルに来たなら見逃せない定番コース。" },
      zh: { title: "首尔必游地标打卡", description: "首次来首尔不容错过的核心路线。" },
    },
  },
  {
    title: "조용한 박물관 투어",
    description: "사람 적은 시간에 천천히 둘러보기 좋은 실내 코스.",
    categories: ["문화시설", "문화시설", "문화재", "문화시설"],
    translations: {
      en: { title: "Quiet Museum Tour", description: "An indoor course best enjoyed slowly during off-peak hours." },
      ja: { title: "静かな博物館ツアー", description: "人が少ない時間帯にゆっくり回りたい屋内コース。" },
      zh: { title: "安静的博物馆之旅", description: "适合在人少时段慢慢参观的室内路线。" },
    },
  },
  {
    title: "주말 가족 나들이 코스",
    description: "아이와 함께 걷고 체험하기 좋은 코스.",
    categories: ["관광지", "축제행사", "문화시설", "관광지"],
    translations: {
      en: { title: "Weekend Family Outing", description: "A course great for walking and hands-on experiences with kids." },
      ja: { title: "週末家族お出かけコース", description: "子どもと一緒に歩いて体験できるコース。" },
      zh: { title: "周末家庭出游路线", description: "适合带孩子一起散步体验的路线。" },
    },
  },
  {
    title: "야경과 함께하는 저녁 코스",
    description: "해질녘부터 야경까지 이어보는 저녁 코스.",
    categories: ["문화재", "관광지", "문화시설", "문화재"],
    translations: {
      en: { title: "Evening Course With Night Views", description: "An evening route from sunset through the night skyline." },
      ja: { title: "夜景まで楽しむ夕方コース", description: "夕暮れから夜景まで続く夕方のコース。" },
      zh: { title: "夜景相伴的傍晚路线", description: "从日落到夜景相连的傍晚路线。" },
    },
  },
];

const VARIANTS_PER_THEME = 3;

function dateDaysBefore(anchor: string, days: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function nearestUnused(
  anchor: MobilePlace,
  category: PlaceCategory,
  used: Set<string>,
): MobilePlace | undefined {
  let best: MobilePlace | undefined;
  let bestDistance = Infinity;

  for (const place of places) {
    if (used.has(place.id) || place.category !== category) {
      continue;
    }
    const distance = haversineKm(anchor, place);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = place;
    }
  }

  return best;
}

// Seed trips are generated (not hand-written) by anchoring each theme at a spread of
// places across the flat Seoul pool, then greedily picking the nearest unused place per
// category — this keeps each generated "course" geographically walkable even without
// the old per-neighborhood buckets.
function generateSeedTrips(): FeedTrip[] {
  const trips: FeedTrip[] = [];

  TRIP_THEMES.forEach((theme, themeIndex) => {
    for (let variant = 0; variant < VARIANTS_PER_THEME; variant++) {
      const anchorIndex = (themeIndex * 37 + variant * 53) % places.length;
      const anchor = places[anchorIndex];
      const used = new Set<string>();
      const picked: MobilePlace[] = [];

      for (const category of theme.categories) {
        const next =
          nearestUnused(anchor, category, used) ??
          places.find((place) => place.category === category && !used.has(place.id));
        if (next) {
          used.add(next.id);
          picked.push(next);
        }
      }

      if (picked.length < 2) {
        continue;
      }

      const seed = (themeIndex * 31 + variant * 17 + 11) % 97;
      const author = TRIP_AUTHORS[(themeIndex * 3 + variant) % TRIP_AUTHORS.length];

      trips.push({
        id: `seed-${themeIndex}-${variant}`,
        title: theme.title,
        description: theme.description,
        translations: theme.translations,
        authorHandle: author.handle,
        authorName: author.name,
        visibility: "public",
        placeIds: picked.map((place) => place.id),
        likes: 120 + seed * 9,
        comments: 4 + (seed % 23),
        saved: 40 + ((seed * 3) % 180),
        rankScore: 55 + (seed % 40),
        isMine: false,
        publishedAt: dateDaysBefore("2026-08-13", themeIndex * 3 + variant),
      });
    }
  });

  return trips;
}

export const seedFeedTrips: FeedTrip[] = generateSeedTrips();
