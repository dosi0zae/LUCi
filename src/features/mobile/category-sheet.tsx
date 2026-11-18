"use client";

import { isDiningCategory, localizePlace, type MobilePlace } from "@/features/mobile/mobile-data";
import { CloseIcon } from "@/components/layout/app-icons";
import { PlacePhoto } from "@/features/mobile/place-photo";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { useSheetDismiss } from "@/features/mobile/use-sheet-dismiss";
import { cn } from "@/lib/utils";

export type PlaceBadgeKind = "near" | "popular" | "recommended";

const BADGE_LABEL_KEY: Record<PlaceBadgeKind, "placeBadgeNear" | "placeBadgePopular" | "placeBadgeRecommended"> = {
  near: "placeBadgeNear",
  popular: "placeBadgePopular",
  recommended: "placeBadgeRecommended",
};

type CategorySheetProps = {
  // The group's name in the user's language (a kind of place, or "명소" for all the sights together).
  label: string;
  areaName: string;
  places: MobilePlace[];
  badges: Map<string, PlaceBadgeKind>;
  onSelectPlace: (id: string) => void;
  onClose: () => void;
};

export function CategorySheet({ areaName, badges, label, onClose, onSelectPlace, places }: CategorySheetProps) {
  const t = useT();
  const { locale } = useLocale();
  const { close: handleClose, grabProps, isClosing, panelClass, panelRef, panelStyle, scrollRef } = useSheetDismiss(onClose);

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
          "glass-panel flex max-h-[82%] w-full flex-col rounded-t-[2rem] p-5 pb-6",
          panelClass,
        )}
        aria-label={t("categoryListAria", { area: areaName, category: label })}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        style={panelStyle}
      >
        {/* Grab handle: drag it (or the list, from its top) down to dismiss. */}
        <div
          className="-mx-5 -mt-5 shrink-0 px-5 pb-3 pt-3 flex cursor-grab touch-none justify-center active:cursor-grabbing"
          {...grabProps}
        >
          <span className="h-1.5 w-11 rounded-full bg-border-strong" />
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3">
          <div>
            <p className="text-sm font-bold" style={{ color: "var(--primary)" }}>
              {areaName}
            </p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{label}</h2>
          </div>
          <button
            aria-label={t("categoryListCloseAria")}
            className="ios-btn grid h-10 w-10 shrink-0 place-items-center rounded-full"
            onClick={handleClose}
            type="button"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Runs down to the sheet's bottom edge (the panel's own bottom padding is taken back) and fades out over its last
            2 rem, so the list goes under the edge softly instead of being cut off by a band of white. */}
        <div
          className="app-scroll-area -mb-6 mt-4 min-h-0 flex-1 overflow-y-auto pb-10 [-webkit-mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)]"
          ref={scrollRef}
        >
          <div className="grid grid-cols-2 gap-3 pb-2">
            {places.map((place) => {
              const localizedPlace = localizePlace(place, locale);
              const badge = badges.get(place.id);
              return (
              <button
                className="ios-row flex flex-col overflow-hidden text-left"
                key={place.id}
                onClick={() => onSelectPlace(place.id)}
                type="button"
              >
                <span className="relative block h-32 w-full shrink-0 overflow-hidden bg-surface-muted">
                  {isDiningCategory(place.category) ? (
                    <span className="grid h-full w-full place-items-center">
                      <PlaceThumb category={place.category} size="lg" />
                    </span>
                  ) : (
                    <PlacePhoto className="h-full w-full" place={place} />
                  )}
                  {badge && (
                    <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2.5 py-1 text-xs font-bold text-primary shadow-sm">
                      {t(BADGE_LABEL_KEY[badge])}
                    </span>
                  )}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-3">
                  <span className="truncate text-[0.9375rem] font-bold">{localizedPlace.name}</span>
                  <span className="truncate text-xs text-muted">{localizedPlace.area}</span>
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
