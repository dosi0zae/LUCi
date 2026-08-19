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
