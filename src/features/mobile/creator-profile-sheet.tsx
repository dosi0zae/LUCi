"use client";

import { TripFeedList } from "@/features/mobile/trip-feed-list";
import type { FeedTrip } from "@/features/mobile/mobile-data";
import { useT } from "@/features/mobile/i18n/i18n-context";

type CreatorProfileSheetProps = {
  authorHandle: string;
  authorName: string;
  trips: FeedTrip[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  onClose: () => void;
  onOpenTrip: (trip: FeedTrip) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

export function CreatorProfileSheet({
  authorHandle,
  authorName,
  likedIds,
  onClose,
  onOpenTrip,
  onToggleLike,
  onToggleSave,
  savedIds,
  trips,
}: CreatorProfileSheetProps) {
  const t = useT();
  const totalLikes = trips.reduce((sum, trip) => sum + trip.likes, 0);

  return (
    <div className="detail-page absolute inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center border-b border-border px-5 py-4">
        <button className="text-sm font-bold text-muted-strong" onClick={onClose} type="button">
          {t("back")}
        </button>
      </header>

      <div className="app-scroll-area min-w-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary-soft text-lg font-extrabold text-primary-strong">
            {authorName.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-extrabold">{authorName}</h1>
            <p className="text-xs text-muted">@{authorHandle}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-sm border border-border bg-surface p-3 text-center">
            <p className="text-lg font-extrabold">{trips.length}</p>
            <p className="mt-0.5 text-xs text-muted">{t("creatorMadeCourses")}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3 text-center">
            <p className="text-lg font-extrabold">{totalLikes.toLocaleString()}</p>
            <p className="mt-0.5 text-xs text-muted">{t("creatorReceivedLikes")}</p>
          </div>
        </div>

        <h2 className="mt-6 text-sm font-extrabold text-muted-strong">
          {t("creatorCoursesHeading", { name: authorName })}
        </h2>
        <div className="mt-2.5">
          <TripFeedList
            emptyLabel={t("creatorEmpty")}
            likedIds={likedIds}
            mode="explore"
            onOpenTrip={onOpenTrip}
            onToggleLike={onToggleLike}
            onToggleSave={onToggleSave}
            savedIds={savedIds}
            trips={trips}
          />
        </div>
      </div>
    </div>
  );
}
