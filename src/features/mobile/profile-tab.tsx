"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookmarkIcon, EyeIcon, HeartIcon, SlidersIcon, UserIcon } from "@/components/layout/app-icons";
import { loadGoogleScript, requestGoogleAccessToken, type GoogleAccount } from "@/features/mobile/google-auth";
import { SlidingTabs } from "@/features/mobile/sliding-tabs";
import { useHorizontalSwipe } from "@/features/mobile/use-swipe";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { localizePlace, type FeedTrip, type MobilePlace } from "@/features/mobile/mobile-data";
import { PlacePhoto } from "@/features/mobile/place-photo";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { cn } from "@/lib/utils";

type ProfileTabProps = {
  isSignedIn: boolean;
  onToggleSignIn: () => void;
  // The signed-in Google account (name, email, photo), when the person signed in with Google.
  account: GoogleAccount | null;
  // True when NEXT_PUBLIC_GOOGLE_CLIENT_ID is set; otherwise the mock sign-in button is shown.
  googleEnabled: boolean;
  signInError: string | null;
  onGoogleToken: (accessToken: string) => Promise<void>;
  onGoogleError: () => void;
  myTrips: FeedTrip[];
  savedTrips: FeedTrip[];
  likedTrips: FeedTrip[];
  recentlyViewedTrips: FeedTrip[];
  bookmarkedPlaces: MobilePlace[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  onOpenTrip: (trip: FeedTrip, origin?: DOMRect, photo?: DOMRect) => void;
  onSelectPlace: (id: string) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

type ProfileSubTab = "mine" | "saved" | "liked" | "recent" | "settings";
const PROFILE_SUB_TAB_ORDER: ProfileSubTab[] = ["mine", "saved", "liked", "recent", "settings"];

// The official multicolour "G" (Google's brand rules: it sits on white, in its own colours).
function GoogleG({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 48 48">
      <path
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
        fill="#EA4335"
      />
      <path
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
        fill="#4285F4"
      />
      <path
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
        fill="#FBBC05"
      />
      <path
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
        fill="#34A853"
      />
    </svg>
  );
}

// Tapping opens Google's account chooser (a popup); what comes back goes to `onToken`. The script is
// fetched when the screen appears so the popup can open straight from the tap.
function GoogleSignInButton({
  onError,
  onToken,
}: {
  onError: () => void;
  onToken: (accessToken: string) => Promise<void>;
}) {
  const t = useT();
  const [isReady, setIsReady] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleScript()
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          onError();
        }
      });
    return () => {
      cancelled = true;
    };
    // The error callback is only used if the script cannot be fetched.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleClick() {
    setIsBusy(true);
    try {
      // Called synchronously from the tap, so the browser lets the popup open.
      const accessToken = await requestGoogleAccessToken();
      await onToken(accessToken);
    } catch (error) {
      if (!(error instanceof Error && error.message === "popup_closed")) {
        onError();
      }
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <button
      className="ios-glass flex h-14 w-full max-w-[18rem] items-center justify-center gap-3 rounded-full px-6 text-[1.0625rem] font-semibold text-foreground shadow-[0_10px_28px_rgba(15,23,42,0.14)] disabled:opacity-60"
      disabled={!isReady || isBusy}
      onClick={() => void handleClick()}
      type="button"
    >
      {isBusy ? (
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
      ) : (
        <GoogleG className="h-5 w-5 shrink-0" />
      )}
      {t("googleContinue")}
    </button>
  );
}

function LanguageSwitcher() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <div>
      <p className="text-sm font-bold text-muted-strong">{t("languageSetting")}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {SUPPORTED_LOCALES.map((option) => (
          <button
            className={cn(
              "rounded-full px-4 py-2 text-sm font-extrabold transition",
              locale === option ? "bg-primary text-white" : "ios-btn",
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
  account,
  bookmarkedPlaces,
  googleEnabled,
  isSignedIn,
  likedIds,
  likedTrips,
  myTrips,
  onOpenTrip,
  onSelectPlace,
  onToggleLike,
  onToggleSave,
  onGoogleError,
  onGoogleToken,
  onToggleSignIn,
  recentlyViewedTrips,
  savedIds,
  savedTrips,
  signInError,
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
        <span className="ios-glass grid h-16 w-16 place-items-center rounded-full text-muted">
          <UserIcon className="h-8 w-8" />
        </span>
        <h2 className="break-keep text-xl font-extrabold text-balance">{t("signInHeading")}</h2>
        <p className="max-w-[20rem] whitespace-pre-line break-keep text-[0.9375rem] leading-6 text-muted text-balance">
          {googleEnabled ? t("signInSubtitleGoogle") : t("signInSubtitle")}
        </p>
        {googleEnabled ? (
          <div className="mt-2">
            <GoogleSignInButton onError={onGoogleError} onToken={onGoogleToken} />
          </div>
        ) : (
          <Button className="mt-2 h-14 px-8 text-[1.0625rem] shadow-[0_10px_28px_rgba(47,111,228,0.32)]" onClick={onToggleSignIn} shape="pill">
            {t("signInButton")}
          </Button>
        )}
        {signInError && <p className="text-sm font-semibold text-danger">{signInError}</p>}
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
        {account?.picture ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt=""
            className="h-16 w-16 shrink-0 rounded-full object-cover"
            referrerPolicy="no-referrer"
            src={account.picture}
          />
        ) : (
          <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
            <UserIcon className="h-8 w-8" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-xl font-extrabold">{account?.name ?? t("travelerName")}</h2>
          <p className="truncate text-sm text-muted">{account?.email ?? "@trip.chain.user"}</p>
        </div>
        <Button className="ml-auto" onClick={onToggleSignIn} shape="pill" size="sm" variant="secondary">
          {t("signOut")}
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        {[
          { label: t("tabMine"), value: myTrips.length, onClick: () => selectSubTab("mine") },
          { label: t("statSaved"), value: savedCount, onClick: () => selectSubTab("saved") },
          { label: t("statFollowers"), value: 12, onClick: undefined },
        ].map(({ label, onClick, value }) => (
          <button
            className="ios-row px-2 py-3.5 text-center transition active:scale-[0.97]"
            disabled={!onClick}
            key={label}
            onClick={onClick}
            type="button"
          >
            <p className="text-xl font-extrabold">{value}</p>
            <p className="mt-0.5 text-sm text-muted">{label}</p>
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
                  <h3 className="text-lg font-extrabold">{t("savedPlacesHeading")}</h3>
                  {bookmarkedPlaces.length === 0 ? (
                    <p className="mt-2 text-sm leading-5 text-muted">{t("emptySavedPlaces")}</p>
                  ) : (
                    <div className="place-list-scroll -mx-3 -mb-6 mt-0 flex gap-3 overflow-x-auto px-3 pb-6 pt-2">
                      {bookmarkedPlaces.map((place) => {
                        const localizedPlace = localizePlace(place, locale);
                        return (
                          <button
                            className="ios-row ios-row-strip flex w-36 shrink-0 flex-col overflow-hidden text-left"
                            key={place.id}
                            onClick={() => onSelectPlace(place.id)}
                            type="button"
                          >
                            <span className="block h-36 w-full shrink-0 overflow-hidden bg-surface-muted">
                              <PlacePhoto className="h-full w-full" place={place} />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-3">
                              <span className="truncate text-[0.9375rem] font-bold">{localizedPlace.name}</span>
                              <span className="truncate text-xs text-muted">{localizedPlace.area}</span>
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
