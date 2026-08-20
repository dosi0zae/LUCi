"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { localizePlace, type MobilePlace } from "@/features/mobile/mobile-data";
import { getGoogleMapsUrl, getKakaoMapUrl, getNaverMapUrl } from "@/features/mobile/map-links";
import { useCategoryLabel, useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 200;

type PlaceSheetProps = {
  place: MobilePlace;
  isInChain: boolean;
  onAddToChain: (place: MobilePlace) => void;
  onClose: () => void;
};

export function PlaceSheet({ isInChain, onAddToChain, onClose, place }: PlaceSheetProps) {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const localizedPlace = localizePlace(place, locale);
  const [isClosing, setIsClosing] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  // Below this length a 3-line clamp wouldn't actually hide anything, so skip the toggle.
  const isDescLong = localizedPlace.description.length > 90;

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
          "app-scroll-area glass-panel max-h-[85vh] w-full overflow-y-auto rounded-t-xl p-5 pb-6",
          isClosing ? "sheet-panel-out" : "sheet-panel",
        )}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label={t("placeDetailAria", { name: localizedPlace.name })}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PlaceThumb category={place.category} size="lg" />
            <div className="min-w-0 pt-0.5">
              <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                {categoryLabel(place.category)}
              </p>
              <h2 className="mt-1 truncate text-xl font-extrabold">{localizedPlace.name}</h2>
              <p className="mt-1 text-xs text-muted">{place.address}</p>
            </div>
          </div>
          <button
            aria-label={t("placeDetailCloseAria")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-sm text-muted hover:bg-surface-muted hover:text-foreground"
            onClick={handleClose}
            type="button"
          >
            ×
          </button>
        </div>

        <p
          className={cn(
            "mt-3 text-sm leading-6 text-muted-strong text-pretty",
            !isDescExpanded && isDescLong && "line-clamp-3",
          )}
        >
          {localizedPlace.description}
        </p>
        {isDescLong && (
          <button
            className="mt-1 text-xs font-bold text-primary"
            onClick={() => setIsDescExpanded((current) => !current)}
            type="button"
          >
            {isDescExpanded ? t("descriptionCollapse") : t("descriptionExpand")}
          </button>
        )}

        <dl className="mt-4 grid grid-cols-2 gap-2">
          {[
            [t("statDuration"), localizedPlace.duration],
            [t("statFee"), localizedPlace.fee],
          ].map(([label, value]) => (
            <div className="rounded-sm border border-border bg-surface/80 p-2.5" key={label}>
              <dt className="text-xs font-semibold text-muted">{label}</dt>
              <dd className="mt-1 text-sm font-bold">{value}</dd>
            </div>
          ))}
        </dl>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {localizedPlace.tags.map((tag) => (
            <span
              className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-semibold text-muted-strong"
              key={tag}
            >
              #{tag}
            </span>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between rounded-sm border border-border bg-surface/76 p-3">
          <p className="text-sm font-semibold">{localizedPlace.hours}</p>
          <p className="text-xs font-semibold text-muted">
            {t("savedByCount", { count: place.savedBy.toLocaleString() })}
          </p>
        </div>

        <p className="mt-3 text-xs font-bold text-muted-strong">{t("mapAppsHeading")}</p>
        <div className="mt-1.5 grid grid-cols-3 gap-1.5">
          {[
            { label: t("mapKakao"), href: getKakaoMapUrl(place) },
            { label: t("mapNaver"), href: getNaverMapUrl(place) },
            { label: t("mapGoogle"), href: getGoogleMapsUrl(place) },
          ].map((link) => (
            <a
              className="rounded-sm border border-border bg-surface py-2 text-center text-xs font-bold text-muted-strong transition hover:border-primary hover:text-primary"
              href={link.href}
              key={link.label}
              rel="noopener noreferrer"
              target="_blank"
            >
              {link.label}
            </a>
          ))}
        </div>

        <Button
          className="mt-4 w-full"
          disabled={isInChain}
          onClick={() => onAddToChain(localizedPlace)}
        >
          {isInChain ? t("addedToChain") : t("addToChain")}
        </Button>
      </div>
    </div>
  );
}
