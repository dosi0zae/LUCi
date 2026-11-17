import type { Metadata } from "next";
import { MobileAppShell } from "@/components/layout/mobile-app-shell";
import { ensureDiningLoadedForIds } from "@/features/mobile/dining-store";
import { LocaleProvider } from "@/features/mobile/i18n/i18n-context";
import { dictionaries, SUPPORTED_LOCALES, type Locale } from "@/features/mobile/i18n/translations";
import { getPlacesByIds, getTotalMinutes, localizePlace } from "@/features/mobile/mobile-data";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// A link to a shared course (course-share.ts) carries the stops and title in the address, so the preview a chat
// app or social site builds for it (title, text and picture) is made here from those same values. Any other
// /mobile address keeps the site-wide preview from the root layout.
export async function generateMetadata({ searchParams }: { searchParams: SearchParams }): Promise<Metadata> {
  const params = await searchParams;
  const course = first(params.course);
  if (!course) {
    return {};
  }

  const lang = first(params.lang);
  const locale: Locale = (SUPPORTED_LOCALES as string[]).includes(lang ?? "") ? (lang as Locale) : "ko";
  const t = dictionaries[locale];
  const ids = course.split(",").filter(Boolean).slice(0, 12);
  await ensureDiningLoadedForIds(ids);
  const places = getPlacesByIds(ids);
  const title = (first(params.title) ?? "").slice(0, 80) || t.sharedCourseFallbackTitle;

  const stats = `${t.placesCount.replace("{count}", String(places.length))} · ${t.minutesCount.replace("{count}", String(getTotalMinutes(places)))}`;
  const names = places.slice(0, 4).map((place) => localizePlace(place, locale).name).join(" → ");
  const description = places.length ? `${stats} · ${names}${places.length > 4 ? " …" : ""}` : t.sharedCourseFallbackTitle;

  const imageParams = new URLSearchParams({ course: ids.join(","), title, lang: locale });
  const image = { url: `/og?${imageParams.toString()}`, width: 1200, height: 630, alt: title };

  return {
    title: `${title} | Trip Chain`,
    description,
    openGraph: { type: "website", siteName: "Trip Chain", title, description, images: [image] },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function MobilePreviewPage() {
  return (
    <LocaleProvider>
      <MobileAppShell />
    </LocaleProvider>
  );
}
