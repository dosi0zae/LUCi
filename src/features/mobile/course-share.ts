import { customPlaceToShared, getCustomPlace, placeFromShared, registerCustomPlace } from "@/features/mobile/custom-places";
import { isDiningId } from "@/features/mobile/dining-store";
import { getPlaceById } from "@/features/mobile/mobile-data";

// Every place id is static (bundled with the client, synced from TourAPI/heritage data),
// so a link naming them is fully self-contained — no backend needed to resolve it, unlike
// a link to a *published* trip (which today only ever exists in the publisher's own
// localStorage, so sharing `origin/mobile` alone silently drops the actual course).
const COURSE_PARAM = "course";
// Places the sharer found on the map screen (not in our data) ride along in the link, see custom-places.ts.
const CUSTOM_PARAM = "cp";
const MAX_CUSTOM = 20;
const TITLE_PARAM = "title";

// The address a shared link points to. On the live site that is simply the address the page is on. On this PC (localhost) or
// a phone reaching it over the Wi-Fi (192.168.x.x and the like) it would be an address nobody else can open, so the link
// points at the deployed site instead (NEXT_PUBLIC_SHARE_ORIGIN, otherwise trip-chain.com).
const PUBLIC_ORIGIN = process.env.NEXT_PUBLIC_SHARE_ORIGIN ?? "https://trip-chain.com";
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\]|.*\.local$|.*\.localhost$)/i;

export function shareOrigin(): string {
  const { hostname, origin } = window.location;
  return PRIVATE_HOST.test(hostname) ? PUBLIC_ORIGIN : origin;
}

// `lang` is only for the preview a chat app builds from the link (its text and picture follow the sharer's language).
export function buildCourseShareUrl(origin: string, placeIds: string[], title: string, lang?: string): string {
  const params = new URLSearchParams();
  params.set(COURSE_PARAM, placeIds.join(","));
  params.set(TITLE_PARAM, title);
  if (lang) {
    params.set("lang", lang);
  }
  const custom = placeIds.flatMap((id) => {
    const place = getCustomPlace(id);
    return place ? [customPlaceToShared(place)] : [];
  });
  if (custom.length > 0) {
    params.set(CUSTOM_PARAM, JSON.stringify(custom));
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

  // The places that are not in our data come first, so the ids below find them.
  const rawCustom = params.get(CUSTOM_PARAM);
  if (rawCustom) {
    try {
      const list: unknown = JSON.parse(rawCustom);
      if (Array.isArray(list)) {
        for (const entry of list.slice(0, MAX_CUSTOM)) {
          const place = placeFromShared(entry);
          if (place) {
            registerCustomPlace(place);
          }
        }
      }
    } catch {
      // A damaged link: the rest of the course still opens.
    }
  }

  // Dining stops load per district on demand (dining-store), so they can't be looked up yet
  // here; the app loads their district right after and drops any id that still doesn't resolve.
  const placeIds = raw.split(",").filter((id) => isDiningId(id) || getPlaceById(id) !== undefined);

  if (placeIds.length < 2) {
    return null;
  }

  return { placeIds, title: params.get(TITLE_PARAM) };
}
