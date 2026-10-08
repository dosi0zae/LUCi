"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { BookmarkIcon, EyeIcon, HeartIcon, SlidersIcon, UserIcon } from "@/components/layout/app-icons";
import { SlidingTabs } from "@/features/mobile/sliding-tabs";
import { useHorizontalSwipe } from "@/features/mobile/use-swipe";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { getPlaceImageUrl, localizePlace, type FeedTrip, type MobilePlace } from "@/features/mobile/mobile-data";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { cn } from "@/lib/utils";

type ProfileTabProps = {
  isSignedIn: boolean;
  onToggleSignIn: () => void;
  myTrips: FeedTrip[];
  savedTrips: FeedTrip[];
  likedTrips: FeedTrip[];
  recentlyViewedTrips: FeedTrip[];
  bookmarkedPlaces: MobilePlace[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  onOpenTrip: (trip: FeedTrip) => void;
  onSelectPlace: (id: string) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

type ProfileSubTab = "mine" | "saved" | "liked" | "recent" | "settings";
const PROFILE_SUB_TAB_ORDER: ProfileSubTab[] = ["mine", "saved", "liked", "recent", "settings"];

function LanguageSwitcher() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <div>
      <p className="text-xs font-bold text-muted-strong">{t("languageSetting")}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SUPPORTED_LOCALES.map((option) => (
          <button
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-extrabold transition",
              locale === option
                ? "bg-primary text-white"
                : "border border-border bg-surface text-muted-strong",
            )}
            key={option}
            onClick={() => setLocale(option)}
            type="button"
          >
            {localeLabel[option]}
          </button>
        ))}
      </div>
    </div>
  );
}

export function ProfileTab({
  bookmarkedPlaces,
  isSignedIn,
  likedIds,
  likedTrips,
  myTrips,
  onOpenTrip,
  onSelectPlace,
  onToggleLike,
  onToggleSave,
  onToggleSignIn,
  recentlyViewedTrips,
  savedIds,
  savedTrips,
}: ProfileTabProps) {
  const t = useT();
  const { locale } = useLocale();
  const [subTab, setSubTab] = useState<ProfileSubTab>("mine");
  // Which way the list below slides in when the sub-tab changes (null until the first change).
  const [slideClass, setSlideClass] = useState<string | null>(null);

  function selectSubTab(next: ProfileSubTab) {
    if (next === subTab) {
      return;
    }
    setSlideClass(
      PROFILE_SUB_TAB_ORDER.indexOf(next) > PROFILE_SUB_TAB_ORDER.indexOf(subTab)
        ? "tab-slide-in-right"
        : "tab-slide-in-left",
    );
    setSubTab(next);
  }

  // Swiping the content left/right moves to the next/previous section, like the tab bar.
  const swipe = useHorizontalSwipe((direction) => {
    const next = PROFILE_SUB_TAB_ORDER[PROFILE_SUB_TAB_ORDER.indexOf(subTab) + direction];
    if (next) {
      selectSubTab(next);
    }
  });

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-muted text-muted">
          <UserIcon className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-extrabold text-balance">{t("signInHeading")}</h2>
        <p className="max-w-[260px] break-keep text-sm text-muted text-balance">{t("signInSubtitle")}</p>
        <Button onClick={onToggleSignIn}>{t("signInButton")}</Button>
      </div>
    );
  }

  const courseTabs: { id: Exclude<ProfileSubTab, "settings">; label: string; trips: FeedTrip[]; emptyLabel: string }[] = [
    {
      id: "mine",
      label: t("tabMine"),
      trips: myTrips,
      emptyLabel: t("emptyMine"),
    },
    {
      id: "saved",
      label: t("tabSaved"),
      trips: savedTrips,
      emptyLabel: t("emptySaved"),
    },
    {
      id: "liked",
      label: t("tabLiked"),
      trips: likedTrips,
      emptyLabel: t("emptyLiked"),
    },
    {
      id: "recent",
      label: t("tabRecent"),
      trips: recentlyViewedTrips,
      emptyLabel: t("emptyRecent"),
    },
  ];
  const activeCourseTab = courseTabs.find((tab) => tab.id === subTab);
  // Saved courses and saved places live together under one "저장" tab.
  const savedCount = savedTrips.length + bookmarkedPlaces.length;

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary-strong">
          <UserIcon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-extrabold">{t("travelerName")}</h2>
          <p className="text-xs text-muted">@trip.chain.user</p>
        </div>
        <Button className="ml-auto" onClick={onToggleSignIn} shape="pill" size="sm" variant="secondary">
          {t("signOut")}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: t("tabMine"), value: myTrips.length, onClick: () => selectSubTab("mine") },
          { label: t("statSaved"), value: savedCount, onClick: () => selectSubTab("saved") },
          { label: t("statFollowers"), value: 12, onClick: undefined },
        ].map(({ label, onClick, value }) => (
          <button
            className="rounded-lg border border-border bg-surface p-3 text-center transition hover:border-primary"
            disabled={!onClick}
            key={label}
            onClick={onClick}
            type="button"
          >
            <p className="text-lg font-extrabold">{value}</p>
            <p className="mt-0.5 text-xs text-muted">{label}</p>
          </button>
        ))}
      </div>

      <div className="mt-6">
        <SlidingTabs
          fullWidth
          onChange={selectSubTab}
          options={PROFILE_SUB_TAB_ORDER.map((id) => ({
            value: id,
            ariaLabel: id === "settings" ? t("tabSettings") : courseTabs.find((tab) => tab.id === id)?.label,
            label: (
              <>
                {id === "mine" && <span className="text-sm font-extrabold leading-5">MY</span>}
                {id === "saved" && <BookmarkIcon className="h-5 w-5" />}
                {id === "liked" && <HeartIcon className="h-5 w-5" filled={id === subTab} />}
                {id === "recent" && <EyeIcon className="h-5 w-5" />}
                {id === "settings" && <SlidersIcon className="h-5 w-5" />}
              </>
            ),
          }))}
          value={subTab}
        />
      </div>

      <div className="min-h-[55vh]" {...swipe}>
      <div className={cn("mt-3", slideClass)} key={subTab}>
        {subTab === "settings" ? (
          <div className="px-1 pt-2">
            <LanguageSwitcher />
          </div>
        ) : (
          activeCourseTab && (
            <>
              <TripFeedList
                emptyLabel={activeCourseTab.emptyLabel}
                likedIds={likedIds}
                mode="explore"
                onOpenTrip={onOpenTrip}
                onToggleLike={onToggleLike}
                onToggleSave={onToggleSave}
                savedIds={savedIds}
                trips={activeCourseTab.trips}
              />

              {subTab === "saved" && (
                <div className="mt-6">
                  <h3 className="text-sm font-extrabold text-muted-strong">{t("savedPlacesHeading")}</h3>
                  {bookmarkedPlaces.length === 0 ? (
                    <p className="mt-2 text-xs leading-5 text-muted">{t("emptySavedPlaces")}</p>
                  ) : (
                    <div className="place-list-scroll mt-2.5 flex gap-2.5 overflow-x-auto">
                      {bookmarkedPlaces.map((place) => {
                        const localizedPlace = localizePlace(place, locale);
                        return (
                          <button
                            className="flex w-28 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface text-left"
                            key={place.id}
                            onClick={() => onSelectPlace(place.id)}
                            type="button"
                          >
                            <span className="block h-28 w-full shrink-0 overflow-hidden bg-surface-muted">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                                src={getPlaceImageUrl(place.id)}
                              />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-2">
                              <span className="truncate text-xs font-bold">{localizedPlace.name}</span>
                              <span className="truncate text-[11px] text-muted">{localizedPlace.area}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )
        )}
      </div>
      </div>
    </div>
  );
}
