"use client";

import { Badge } from "@/components/ui/badge";
import { BookmarkIcon } from "@/components/layout/app-icons";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { areaMeta, getPlaceById, type FeedTrip } from "@/features/mobile/mobile-data";
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
  const orderedTrips =
    mode === "ranking" ? [...trips].sort((a, b) => b.rankScore - a.rankScore) : trips;

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
        const coverPlace = getPlaceById(trip.placeIds[0]);

        return (
          <article
            className="rounded-lg border border-border bg-surface p-3.5 shadow-soft"
            key={trip.id}
          >
            <button
              className="block w-full text-left"
              onClick={() => onOpenTrip(trip)}
              type="button"
            >
              <div className="flex items-start gap-3">
                {mode === "ranking" && (
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-sm text-xs font-extrabold text-white",
                      index === 0 ? "bg-primary" : "bg-muted",
                    )}
                  >
                    {index + 1}
                  </span>
                )}
                {coverPlace && <PlaceThumb category={coverPlace.category} size="lg" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <Badge tone="neutral">{areaMeta[trip.areaId].name}</Badge>
                    {trip.isMine && <Badge tone="blue">내 코스</Badge>}
                  </div>
                  <h3 className="mt-1.5 truncate text-base font-extrabold">{trip.title}</h3>
                  <p className="mt-1 truncate text-xs text-muted">
                    {trip.authorName} · {trip.placeIds.length}곳
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
