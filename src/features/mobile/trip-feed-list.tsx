"use client";

import { Badge } from "@/components/ui/badge";
import { BookmarkIcon, CommentIcon } from "@/components/layout/app-icons";
import { PopOnActive, RollingNumber } from "@/features/mobile/motion";
import { PlacePhoto } from "@/features/mobile/place-photo";
import { getTripCoverPlace, localizePlace, localizeTrip, type FeedTrip } from "@/features/mobile/mobile-data";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

type TripFeedListProps = {
  trips: FeedTrip[];
  mode: "explore" | "ranking";
  likedIds: Set<string>;
  savedIds: Set<string>;
  // The card's on-screen rectangle comes along so the course screen can grow out of it.
  onOpenTrip: (trip: FeedTrip, origin?: DOMRect, photo?: DOMRect) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
  emptyLabel: string;
};

export function TripFeedList({
  emptyLabel,
  likedIds,
  mode,
  onOpenTrip,
  onToggleLike,
  onToggleSave,
  savedIds,
  trips,
}: TripFeedListProps) {
  const t = useT();
  const { locale } = useLocale();

  if (trips.length === 0) {
    return (
      <p className="ios-row p-6 text-center text-[0.9375rem] text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      {trips.map((trip, index) => {
        const isLiked = likedIds.has(trip.id);
        const isSaved = savedIds.has(trip.id);
        const rawCoverPlace = getTripCoverPlace(trip);
        const coverPlace = rawCoverPlace ? localizePlace(rawCoverPlace, locale) : undefined;
        const localizedTrip = localizeTrip(trip, locale);

        return (
          <article
            className="ios-row relative min-w-0 p-4"
            key={trip.id}
          >
            {/* Pinned to the card's top-right, with the same inset as the content's left edge. */}
            {trip.isMine && (
              <span className="pointer-events-none absolute right-4 top-4">
                <Badge tone="blue">{t("myCourseBadge")}</Badge>
              </span>
            )}
            <button
              className="block w-full text-left"
              onClick={(event) => {
                const card = event.currentTarget.closest("article");
                onOpenTrip(trip, card?.getBoundingClientRect(), card?.querySelector("img")?.getBoundingClientRect());
              }}
              type="button"
            >
              <div className="flex items-start gap-3">
                {coverPlace && (
                  <span className="relative shrink-0">
                    <PlacePhoto className="h-24 w-24 rounded-2xl" place={coverPlace} />
                    {mode === "ranking" && (
                      <span
                        className={cn(
                          "absolute -bottom-1 -left-1 grid h-6 w-6 place-items-center rounded-full text-xs font-extrabold text-white ring-2 ring-background",
                          index === 0 ? "bg-primary" : "bg-muted",
                        )}
                      >
                        {index + 1}
                      </span>
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex h-7 items-center">
                    {coverPlace && (
                      <span className="text-sm font-semibold text-muted-strong">{coverPlace.area}</span>
                    )}
                  </div>
                  <h3 className="mt-1.5 line-clamp-2 break-keep text-[1.1875rem] font-extrabold leading-snug">{localizedTrip.title}</h3>
                  <p className="mt-1 truncate text-sm text-muted">
                    {trip.authorName} · {t("placesCount", { count: trip.placeIds.length })}
                  </p>
                </div>
              </div>
            </button>

            <div className="mt-3.5 flex items-center gap-4 text-sm font-semibold text-muted-strong">
              <button
                className={cn("flex items-center gap-1", isLiked && "text-primary")}
                onClick={() => onToggleLike(trip.id)}
                type="button"
              >
                <PopOnActive active={isLiked}>♥</PopOnActive>
                <RollingNumber value={(trip.likes + (isLiked ? 1 : 0)).toLocaleString()} />
              </button>
              <span className="flex items-center gap-1">
                <CommentIcon className="h-4 w-4" />
                {trip.comments.toLocaleString()}
              </span>
              <button
                className={cn("ml-auto flex items-center gap-1", isSaved && "text-primary")}
                onClick={() => onToggleSave(trip.id)}
                type="button"
              >
                <PopOnActive active={isSaved}>
                  <BookmarkIcon className="h-4 w-4" />
                </PopOnActive>
                <RollingNumber value={(trip.saved + (isSaved ? 1 : 0)).toLocaleString()} />
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
