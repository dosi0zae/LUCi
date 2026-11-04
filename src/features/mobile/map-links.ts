import type { MobilePlace } from "@/features/mobile/mobile-data";

// Deep-links into the three map apps Seoul visitors are most likely to already have —
// Kakao/Naver for domestic users, Google for foreign tourists — so a place can open in
// whichever app the viewer actually navigates with, independent of which map the app
// itself renders inline.
export function getGoogleMapsUrl(place: MobilePlace): string {
  const query = encodeURIComponent(`${place.name} ${place.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}

export function getNaverMapUrl(place: MobilePlace): string {
  const query = encodeURIComponent(place.name);
  return `https://map.naver.com/p/search/${query}?c=${place.lng},${place.lat},15,0,0,0,dh`;
}

export function getKakaoMapUrl(place: MobilePlace): string {
  const name = encodeURIComponent(place.name);
  return `https://map.kakao.com/link/map/${name},${place.lat},${place.lng}`;
}

export type NearbyKind = "food" | "cafe";

// "Find a restaurant / café near here" in the map app the visitor most likely uses: Naver Map
// for Korean, Google Maps for the other languages. Centered on the given point (the middle
// between two consecutive stops), so the results are what is actually on the way.
export function getNearbyUrl(kind: NearbyKind, center: { lat: number; lng: number }, locale: string): string {
  if (locale === "ko") {
    const query = encodeURIComponent(kind === "food" ? "맛집" : "카페");
    return `https://map.naver.com/p/search/${query}?c=${center.lng},${center.lat},16,0,0,0,dh`;
  }
  const query = encodeURIComponent(kind === "food" ? "restaurants" : "cafes");
  return `https://www.google.com/maps/search/${query}/@${center.lat},${center.lng},17z`;
}
