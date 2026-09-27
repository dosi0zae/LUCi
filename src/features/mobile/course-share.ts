import { places } from "@/features/mobile/mobile-data";

// Every place id is static (bundled with the client, synced from TourAPI/heritage data),
// so a link naming them is fully self-contained — no backend needed to resolve it, unlike
// a link to a *published* trip (which today only ever exists in the publisher's own
// localStorage, so sharing `origin/mobile` alone silently drops the actual course).
const COURSE_PARAM = "course";
const TITLE_PARAM = "title";

export function buildCourseShareUrl(origin: string, placeIds: string[], title: string): string {
  const params = new URLSearchParams();
  params.set(COURSE_PARAM, placeIds.join(","));
  params.set(TITLE_PARAM, title);
  return `${origin}/mobile?${params.toString()}`;
}

export function decodeCourseFromLocation(search: string): { placeIds: string[]; title: string | null } | null {
  const params = new URLSearchParams(search);
  const raw = params.get(COURSE_PARAM);
  if (!raw) {
    return null;
  }

  const knownIds = new Set(places.map((place) => place.id));
  const placeIds = raw.split(",").filter((id) => knownIds.has(id));

  if (placeIds.length < 2) {
    return null;
  }

  return { placeIds, title: params.get(TITLE_PARAM) };
}
