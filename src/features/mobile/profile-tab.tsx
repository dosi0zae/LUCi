"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserIcon } from "@/components/layout/app-icons";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import type { FeedTrip } from "@/features/mobile/mobile-data";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { SUPPORTED_LOCALES, localeLabel } from "@/features/mobile/i18n/translations";
import { cn } from "@/lib/utils";

type ProfileTabProps = {
  isSignedIn: boolean;
  onToggleSignIn: () => void;
  myTrips: FeedTrip[];
  savedTrips: FeedTrip[];
  recentlyViewedTrips: FeedTrip[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  onOpenTrip: (trip: FeedTrip) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

type ProfileSubTab = "mine" | "saved" | "recent";

function LanguageSwitcher() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <div className="mt-6">
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
  isSignedIn,
  likedIds,
  myTrips,
  onOpenTrip,
  onToggleLike,
  onToggleSave,
  onToggleSignIn,
  recentlyViewedTrips,
  savedIds,
  savedTrips,
}: ProfileTabProps) {
  const t = useT();
  const [subTab, setSubTab] = useState<ProfileSubTab>("mine");

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

  const subTabs: { id: ProfileSubTab; label: string; trips: FeedTrip[]; emptyLabel: string }[] = [
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
      id: "recent",
      label: t("tabRecent"),
      trips: recentlyViewedTrips,
      emptyLabel: t("emptyRecent"),
    },
  ];
  const activeSubTab = subTabs.find((tab) => tab.id === subTab) ?? subTabs[0];

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
        <Button className="ml-auto" onClick={onToggleSignIn} size="sm" variant="secondary">
          {t("signOut")}
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: t("tabMine"), value: myTrips.length, onClick: () => setSubTab("mine") },
          { label: t("statSaved"), value: savedTrips.length, onClick: () => setSubTab("saved") },
          { label: t("statFollowers"), value: 12, onClick: undefined },
        ].map(({ label, onClick, value }) => (
          <button
            className="rounded-sm border border-border bg-surface p-3 text-center transition hover:border-primary"
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

      <div className="mt-6 flex gap-1.5">
        {subTabs.map((tab) => (
          <button
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-extrabold transition",
              tab.id === subTab
                ? "bg-primary text-white"
                : "border border-border bg-surface text-muted-strong",
            )}
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <TripFeedList
          emptyLabel={activeSubTab.emptyLabel}
          likedIds={likedIds}
          mode="explore"
          onOpenTrip={onOpenTrip}
          onToggleLike={onToggleLike}
          onToggleSave={onToggleSave}
          savedIds={savedIds}
          trips={activeSubTab.trips}
        />
      </div>

      <LanguageSwitcher />
    </div>
  );
}
