"use client";

import { Badge } from "@/components/ui/badge";
import { BookmarkIcon } from "@/components/layout/app-icons";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { getPlaceById, localizePlace, localizeTrip, type FeedTrip } from "@/features/mobile/mobile-data";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

type TripFeedListProps = {
  trips: FeedTrip[];
  mode: "explore" | "ranking";
  likedIds: Set<string>;
  savedIds: Set<string>;
  onOpenTrip: (trip: FeedTrip) => void;
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
  const orderedTrips = trips;

  if (orderedTrips.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-surface/60 p-6 text-center text-sm text-muted">
        {emptyLabel}
      </p>
    );
  }

  return (
    <div className="grid gap-2.5">
      {orderedTrips.map((trip, index) => {
        const isLiked = likedIds.has(trip.id);
        const isSaved = savedIds.has(trip.id);
        const rawCoverPlace = getPlaceById(trip.placeIds[0]);
        const coverPlace = rawCoverPlace ? localizePlace(rawCoverPlace, locale) : undefined;
        const localizedTrip = localizeTrip(trip, locale);

        return (
          <article
            className="min-w-0 rounded-lg border border-border bg-surface p-3.5 shadow-soft"
            key={trip.id}
          >
            <button
              className="block w-full text-left"
              onClick={() => onOpenTrip(trip)}
              type="button"
            >
              <div className="flex items-start gap-3">
                {coverPlace && (
                  <span className="relative shrink-0">
                    <PlaceThumb category={coverPlace.category} size="lg" />
                    {mode === "ranking" && (
                      <span
                        className={cn(
                          "absolute -bottom-1 -left-1 grid h-5 w-5 place-items-center rounded-full text-[10px] font-extrabold text-white ring-2 ring-background",
                          index === 0 ? "bg-primary" : "bg-muted",
                        )}
                      >
                        {index + 1}
                      </span>
                    )}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {coverPlace && <Badge tone="neutral">{coverPlace.area}</Badge>}
                    {trip.isMine && <Badge tone="blue">{t("myCourseBadge")}</Badge>}
                  </div>
                  <h3 className="mt-1.5 truncate text-base font-extrabold">{localizedTrip.title}</h3>
                  <p className="mt-1 truncate text-xs text-muted">
                    {trip.authorName} · {t("placesCount", { count: trip.placeIds.length })}
                  </p>
                </div>
              </div>
            </button>

            <div className="mt-3 flex items-center gap-3 text-xs font-semibold text-muted-strong">
              <button
                className={cn("flex items-center gap-1", isLiked && "text-primary")}
                onClick={() => onToggleLike(trip.id)}
                type="button"
              >
                ♥ {(trip.likes + (isLiked ? 1 : 0)).toLocaleString()}
              </button>
              <span>💬 {trip.comments.toLocaleString()}</span>
              <button
                className={cn("ml-auto flex items-center gap-1", isSaved && "text-primary")}
                onClick={() => onToggleSave(trip.id)}
                type="button"
              >
                <BookmarkIcon className="h-3.5 w-3.5" />
                {(trip.saved + (isSaved ? 1 : 0)).toLocaleString()}
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
