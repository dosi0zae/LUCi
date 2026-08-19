"use client";

import { useState } from "react";
import { getPlaceImageUrl, localizePlace, type MobilePlace, type PlaceCategory } from "@/features/mobile/mobile-data";
import { useCategoryLabel, useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 200;

type CategorySheetProps = {
  category: PlaceCategory;
  areaName: string;
  places: MobilePlace[];
  onSelectPlace: (id: string) => void;
  onClose: () => void;
};

export function CategorySheet({ areaName, category, onClose, onSelectPlace, places }: CategorySheetProps) {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const [isClosing, setIsClosing] = useState(false);

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
          "glass-panel flex max-h-[82%] w-full flex-col rounded-t-xl p-5 pb-6",
          isClosing ? "sheet-panel-out" : "sheet-panel",
        )}
        aria-label={t("categoryListAria", { area: areaName, category: categoryLabel(category) })}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-border-strong" />

        <div className="flex shrink-0 items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
              {areaName}
            </p>
            <h2 className="mt-1 text-xl font-extrabold">{categoryLabel(category)}</h2>
          </div>
          <button
            aria-label={t("categoryListCloseAria")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-muted hover:text-foreground"
            onClick={handleClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="app-scroll-area mt-4 min-h-0 flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 gap-2.5">
            {places.map((place) => {
              const localizedPlace = localizePlace(place, locale);
              return (
              <button
                className="flex flex-col overflow-hidden rounded-lg border border-border bg-surface text-left"
                key={place.id}
                onClick={() => onSelectPlace(place.id)}
                type="button"
              >
                <span className="block h-24 w-full shrink-0 overflow-hidden bg-surface-muted">
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
        </div>
      </div>
    </div>
  );
}
