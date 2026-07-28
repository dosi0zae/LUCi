"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkIcon } from "@/components/layout/app-icons";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { areaMeta, getPlacesByIds, getTotalMinutes, type FeedTrip } from "@/features/mobile/mobile-data";

type TripDetailSheetProps = {
  trip: FeedTrip;
  isLiked: boolean;
  isSaved: boolean;
  onClose: () => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

const visibilityLabel: Record<FeedTrip["visibility"], string> = {
  public: "전체 공개",
  link: "링크 공유",
  private: "비공개",
};

export function TripDetailSheet({
  isLiked,
  isSaved,
  onClose,
  onToggleLike,
  onToggleSave,
  trip,
}: TripDetailSheetProps) {
  const places = getPlacesByIds(trip.placeIds);
  const totalMinutes = getTotalMinutes(places);

  return (
    <div className="detail-page absolute inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <button
          className="text-sm font-bold text-muted-strong"
          onClick={onClose}
          type="button"
        >
          ← 뒤로
        </button>
        {trip.isMine && <Badge tone="blue">내 코스</Badge>}
      </header>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
        <Badge tone="neutral">{areaMeta[trip.areaId].name}</Badge>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight">{trip.title}</h1>
        <p className="mt-1 text-xs font-semibold text-muted">
          {trip.authorName} · {visibilityLabel[trip.visibility]}
        </p>
        {trip.description && (
          <p className="mt-3 text-sm leading-6 text-muted-strong">{trip.description}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">장소</p>
            <p className="mt-1 text-sm font-extrabold">{places.length}곳</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">예상 시간</p>
            <p className="mt-1 text-sm font-extrabold">{totalMinutes}분</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">저장</p>
            <p className="mt-1 text-sm font-extrabold">{trip.saved.toLocaleString()}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          {places.map((place, index) => (
            <article className="rounded-lg border border-border bg-surface p-3 shadow-soft" key={place.id}>
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-white">
                  {index + 1}
                </span>
                <PlaceThumb category={place.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-extrabold">{place.name}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {place.area} · {place.duration} · {place.price}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <footer className="grid grid-cols-2 gap-2 border-t border-border px-5 py-3">
        <Button
          onClick={() => onToggleLike(trip.id)}
          variant={isLiked ? "primary" : "secondary"}
        >
          ♥ 좋아요 {(trip.likes + (isLiked ? 1 : 0)).toLocaleString()}
        </Button>
        <Button
          onClick={() => onToggleSave(trip.id)}
          variant={isSaved ? "primary" : "secondary"}
        >
          <BookmarkIcon className="h-4 w-4" />
          {isSaved ? "저장됨" : "저장하기"}
        </Button>
      </footer>
    </div>
  );
}
