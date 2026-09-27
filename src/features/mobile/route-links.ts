// Multi-stop walking-route deep links for the two map apps most likely to be useful to
// this app's users: Kakao Map (the standard in Korea) and Google Maps (what most
// visitors from outside Korea already have on their phone).

// Kakao Map's public "길찾기" web link: one path segment per stop (`name,lat,lng`),
// walking mode. Kakao's own servers handle opening the installed app vs. falling back
// to the web map, so no app-scheme/install-detection hack is needed.
// Format confirmed via https://apis.map.kakao.com/web/guide/ — up to 5 via points
// between the start and end stop (7 stops total); buildChain already caps a course at
// 6 stops, so the slice below is just a defensive ceiling, not something courses hit.
const MAX_KAKAO_ROUTE_STOPS = 7;

export function buildKakaoWalkingRouteUrl(places: { name: string; lat: number; lng: number }[]): string {
  const segments = places
    .slice(0, MAX_KAKAO_ROUTE_STOPS)
    .map((place) => `${encodeURIComponent(place.name)},${place.lat},${place.lng}`);

  return `https://map.kakao.com/link/by/walk/${segments.join("/")}`;
}

// Google's public Directions URL API: origin/destination are required, up to 9
// intermediate stops go in a pipe-separated `waypoints` param. No API key needed for this
// consumer-facing link (it just opens Google Maps, same as clicking a share link).
const MAX_GOOGLE_ROUTE_STOPS = 11;

export function buildGoogleMapsWalkingRouteUrl(places: { lat: number; lng: number }[]): string {
  const stops = places.slice(0, MAX_GOOGLE_ROUTE_STOPS);
  const origin = stops[0];
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(1, -1);

  const params = new URLSearchParams({
    api: "1",
    travelmode: "walking",
    origin: `${origin.lat},${origin.lng}`,
    destination: `${destination.lat},${destination.lng}`,
  });

  if (waypoints.length > 0) {
    params.set("waypoints", waypoints.map((place) => `${place.lat},${place.lng}`).join("|"));
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
