"use client";

import { Button } from "@/components/ui/button";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import type { MobilePlace } from "@/features/mobile/mobile-data";

type PlaceSheetProps = {
  place: MobilePlace;
  isInChain: boolean;
  onAddToChain: (place: MobilePlace) => void;
  onClose: () => void;
};

export function PlaceSheet({ isInChain, onAddToChain, onClose, place }: PlaceSheetProps) {
  return (
    <div className="sheet-backdrop absolute inset-0 z-30 flex items-end justify-center bg-black/35">
      <div
        className="glass-panel sheet-panel w-full rounded-t-xl p-5 pb-6"
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
            onClick={onClose}
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
