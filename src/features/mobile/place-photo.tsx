"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CloseIcon } from "@/components/layout/app-icons";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { getPlaceImageUrl, type MobilePlace } from "@/features/mobile/mobile-data";
import { useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

const SIZES = {
  sm: "h-10 w-10 rounded-sm",
  lg: "h-16 w-16 rounded-lg",
};

type PlacePhotoThumbProps = {
  place: MobilePlace;
  // Localized name, used as the accessible label.
  label: string;
  size: keyof typeof SIZES;
  // Tapping the photo opens it large; if the photo can't load, the usual category icon is
  // shown instead and a tap falls back to `onFallback` (e.g. open the place detail).
  onOpenPhoto: () => void;
  onFallback?: () => void;
  // Small overlay anchored to the corner, e.g. the stop number on a course card.
  badge?: ReactNode;
};

export function PlacePhotoThumb({ badge, label, onFallback, onOpenPhoto, place, size }: PlacePhotoThumbProps) {
  const [failed, setFailed] = useState(false);

  return (
    <button
      aria-label={label}
      className="relative shrink-0"
      onClick={failed ? onFallback : onOpenPhoto}
      type="button"
    >
      {failed ? (
        <PlaceThumb category={place.category} size={size} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          alt=""
          className={cn("block bg-surface-muted object-cover", SIZES[size])}
          loading="lazy"
          onError={() => setFailed(true)}
          src={getPlaceImageUrl(place.id)}
        />
      )}
      {badge}
    </button>
  );
}

type PhotoLightboxProps = {
  place: MobilePlace;
  name: string;
  onClose: () => void;
};

// The photo at full size over a dimmed backdrop. Tap anywhere, the close button, or press
// Escape to dismiss.
export function PhotoLightbox({ name, onClose, place }: PhotoLightboxProps) {
  const t = useT();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <div
      aria-label={name}
      aria-modal="true"
      className="sheet-backdrop absolute inset-0 z-[60] grid place-items-center bg-black/85 p-5"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
      role="dialog"
    >
      <button
        aria-label={t("photoCloseAria")}
        className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 [top:calc(1rem+env(safe-area-inset-top))]"
        type="button"
      >
        <CloseIcon className="h-5 w-5" />
      </button>
      <figure className="sheet-panel flex max-h-full w-full flex-col items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt={name}
          className="max-h-[75vh] max-w-full rounded-lg object-contain"
          src={getPlaceImageUrl(place.id)}
        />
        <figcaption className="text-sm font-bold text-white">{name}</figcaption>
      </figure>
    </div>
  );
}

// A plain (non-interactive) square photo of a place for use inside a button or link; shows
// the category icon tile if the image can't load.
export function PlacePhoto({ className, place }: { place: MobilePlace; className: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className={cn("grid shrink-0 place-items-center overflow-hidden", className)}>
        <PlaceThumb category={place.category} size="lg" />
      </span>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={cn("block shrink-0 bg-surface-muted object-cover", className)}
      loading="lazy"
      onError={() => setFailed(true)}
      src={getPlaceImageUrl(place.id)}
    />
  );
}
