"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { getCafeMenu, type MobilePlace } from "@/features/mobile/mobile-data";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 200;

type PlaceSheetProps = {
  place: MobilePlace;
  isInChain: boolean;
  likedMenuIds: Set<string>;
  onAddToChain: (place: MobilePlace) => void;
  onClose: () => void;
  onToggleMenuLike: (key: string) => void;
};

export function PlaceSheet({
  isInChain,
  likedMenuIds,
  onAddToChain,
  onClose,
  onToggleMenuLike,
  place,
}: PlaceSheetProps) {
  const [isClosing, setIsClosing] = useState(false);
  const menuItems =
    place.category === "카페"
      ? [...getCafeMenu(place)].sort((a, b) => {
          const likesA = a.baseLikes + (likedMenuIds.has(`${place.id}:${a.name}`) ? 1 : 0);
          const likesB = b.baseLikes + (likedMenuIds.has(`${place.id}:${b.name}`) ? 1 : 0);
          return likesB - likesA;
        })
      : [];

  function handleClose() {
    setIsClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  return (
    <div
      className={cn(
        "absolute inset-0 z-30 flex items-end justify-center bg-black/35",
        isClosing ? "sheet-backdrop-out" : "sheet-backdrop",
      )}
      onClick={handleClose}
    >
      <div
        className={cn(
          "glass-panel max-h-[85vh] w-full overflow-y-auto rounded-t-xl p-5 pb-6",
          isClosing ? "sheet-panel-out" : "sheet-panel",
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={`${place.name} 상세 정보`}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PlaceThumb category={place.category} size="lg" />
            <div className="min-w-0 pt-0.5">
              <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                {place.category}
              </p>
              <h2 className="mt-1 truncate text-xl font-extrabold">{place.name}</h2>
              <p className="mt-1 text-xs text-muted">{place.address}</p>
            </div>
          </div>
          <button
            aria-label="장소 상세 닫기"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-muted hover:text-foreground"
            onClick={handleClose}
            type="button"
          >
            ×
          </button>
        </div>

        <p className="mt-3 text-sm leading-6 text-muted-strong">{place.description}</p>

        <dl className="mt-4 grid grid-cols-3 gap-2">
          {[
            ["거리", place.distance],
            ["시간", place.duration],
            ["예산", place.price],
          ].map(([label, value]) => (
            <div className="rounded-sm border border-border bg-surface/80 p-2.5" key={label}>
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="mt-1 text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {place.tags.map((tag) => (
            <span
              className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-semibold text-muted-strong"
              key={tag}
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-sm border border-border bg-surface/76 p-3">
          <p className="text-sm font-semibold">{place.hours}</p>
          <p className="text-xs font-semibold text-muted">{place.savedBy.toLocaleString()}명이 저장</p>
        </div>

        {menuItems.length > 0 && (
          <div className="mt-3">
            <h3 className="text-sm font-extrabold">메뉴</h3>
            <div className="mt-2 grid gap-1.5">
              {menuItems.map((item, index) => {
                const key = `${place.id}:${item.name}`;
                const isLiked = likedMenuIds.has(key);
                const likeCount = item.baseLikes + (isLiked ? 1 : 0);

                return (
                  <div
                    className="flex items-center gap-2 rounded-sm border border-border bg-surface/78 px-3 py-2"
                    key={item.name}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-bold">
                        {item.name}
                        {index === 0 && (
                          <span className="shrink-0 rounded-xs bg-primary-soft px-1.5 py-0.5 text-[10px] font-extrabold text-primary-strong">
                            인기
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted">{item.price}</p>
                    </div>
                    <button
                      aria-label={isLiked ? `${item.name} 좋아요 취소` : `${item.name} 좋아요`}
                      className={cn(
                        "flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold transition",
                        isLiked ? "bg-primary-soft text-primary-strong" : "bg-surface-muted text-muted-strong",
                      )}
                      onClick={() => onToggleMenuLike(key)}
                      type="button"
                    >
                      {isLiked ? "♥" : "♡"} {likeCount}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <Button
          className="mt-4 w-full"
          disabled={isInChain}
          onClick={() => onAddToChain(place)}
        >
          {isInChain ? "코스에 추가됨" : "코스에 추가"}
        </Button>
      </div>
    </div>
  );
}
