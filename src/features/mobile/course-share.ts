import { isDiningId } from "@/features/mobile/dining-store";
import { getPlaceById } from "@/features/mobile/mobile-data";

// Every place id is static (bundled with the client, synced from TourAPI/heritage data),
// so a link naming them is fully self-contained — no backend needed to resolve it, unlike
// a link to a *published* trip (which today only ever exists in the publisher's own
// localStorage, so sharing `origin/mobile` alone silently drops the actual course).
const COURSE_PARAM = "course";
const TITLE_PARAM = "title";

// `lang` is only for the preview a chat app builds from the link (its text and picture follow the sharer's language).
export function buildCourseShareUrl(origin: string, placeIds: string[], title: string, lang?: string): string {
  const params = new URLSearchParams();
  params.set(COURSE_PARAM, placeIds.join(","));
  params.set(TITLE_PARAM, title);
  if (lang) {
    params.set("lang", lang);
  }
  return `${origin}/mobile?${params.toString()}`;
}

// The picture shown under a shared link (drawn by src/app/og/route.tsx from the same values).
export function buildCoursePreviewImageUrl(origin: string, placeIds: string[], title: string, lang: string): string {
  const params = new URLSearchParams({ course: placeIds.join(","), title, lang });
  return `${origin}/og?${params.toString()}`;
}

export function decodeCourseFromLocation(search: string): { placeIds: string[]; title: string | null } | null {
  const params = new URLSearchParams(search);
  const raw = params.get(COURSE_PARAM);
  if (!raw) {
    return null;
  }

  // Dining stops load per district on demand (dining-store), so they can't be looked up yet
  // here; the app loads their district right after and drops any id that still doesn't resolve.
  const placeIds = raw.split(",").filter((id) => isDiningId(id) || getPlaceById(id) !== undefined);

  if (placeIds.length < 2) {
    return null;
  }

  return { placeIds, title: params.get(TITLE_PARAM) };
}
