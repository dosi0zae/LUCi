"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookmarkIcon, CheckIcon, CloseIcon, PlaylistAddIcon } from "@/components/layout/app-icons";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { localizePlace, type MobilePlace } from "@/features/mobile/mobile-data";
import { getGoogleMapsUrl, getKakaoMapUrl, getNaverMapUrl } from "@/features/mobile/map-links";
import { useCategoryLabel, useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

const CLOSE_ANIMATION_MS = 200;
const SUMMARY_CACHE_KEY = "tripchain:placeSummaries";

function readSummaryCache(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(SUMMARY_CACHE_KEY) ?? "{}");
  } catch {
    return {};
  }
}

function writeSummaryToCache(cacheKey: string, summary: string) {
  try {
    const current = readSummaryCache();
    current[cacheKey] = summary;
    window.localStorage.setItem(SUMMARY_CACHE_KEY, JSON.stringify(current));
  } catch {
    // Storage may be unavailable (private mode, quota) — the cache is best-effort; the
    // summary still rendered for this view, it just won't be remembered for next time.
  }
}

// Seasonal hours are synced as one run-on string, one "[범위] 시간 (설명)" segment per
// season back to back with no separator (e.g. "[1월~2월] 09:00~17:00 (입장마감 16:00)
// [3월~5월] ..."). Splitting right before each "[" turns that into one line per season
// instead of a single paragraph long enough to squeeze its neighbor into a 1-char-wide
// column. A plain string with no brackets at all (e.g. "상시 개방") is already one line.
function splitHoursLines(hours: string): string[] {
  if (!hours.includes("[")) {
    return [hours];
  }
  return hours
    .split(/(?=\[)/)
    .map((line) => line.trim())
    .filter(Boolean);
}

type PlaceSheetProps = {
  place: MobilePlace;
  isInChain: boolean;
  isBookmarked: boolean;
  onAddToChain: (place: MobilePlace) => void;
  onToggleBookmark: (id: string) => void;
  onClose: () => void;
};

export function PlaceSheet({
  isInChain,
  isBookmarked,
  onAddToChain,
  onClose,
  onToggleBookmark,
  place,
}: PlaceSheetProps) {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const localizedPlace = localizePlace(place, locale);
  const [isClosing, setIsClosing] = useState(false);
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [reservationMessage, setReservationMessage] = useState<string | null>(null);
  // Below this length a summary wouldn't actually shorten anything, so skip it entirely
  // (no API call, no toggle) and just show the full text like always.
  const isDescLong = localizedPlace.description.length > 90;
  const description = localizedPlace.description;
  const hoursLines = splitHoursLines(localizedPlace.hours);
  const isShowingSummary = !isDescExpanded && Boolean(summary);

  useEffect(() => {
    // PlaceSheet always remounts fresh for a new place (it's conditionally rendered off
    // a single selected-place id in the parent), so `summary` already starts at null —
    // nothing to reset here for the short-description case, just nothing to fetch.
    if (!isDescLong) {
      return;
    }

    const cacheKey = `${locale}:${place.id}`;
    const cached = readSummaryCache()[cacheKey];
    // Reading a cached summary from localStorage (or clearing a stale one from a
    // previous place/locale before fetching a new one) is a one-time sync per place
    // change, not a reactive loop — same exception already used for the profile
    // localStorage hydration in mobile-app-shell.tsx.
    /* eslint-disable react-hooks/set-state-in-effect */
    if (cached) {
      setSummary(cached);
      return;
    }

    setSummary(null);
    /* eslint-enable react-hooks/set-state-in-effect */
    let cancelled = false;

    fetch("/api/summarize-place", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, locale }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (cancelled || typeof data.summary !== "string" || !data.summary) {
          return;
        }
        setSummary(data.summary);
        writeSummaryToCache(cacheKey, data.summary);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, [place.id, locale, isDescLong, description]);
  // Checked against the raw (Korean) place, not localizedPlace — fee/hours text gets
  // machine-translated per locale, and this substring match only works on the original.
  const needsReservation = (place.fee !== "무료" && place.fee !== "정보 없음") || place.hours.includes("예약");

  function handleReserve() {
    // No real ticketing/booking data source exists yet (see PROJECT_CHECKLIST Mobile
    // Phase AB) — this is an honest placeholder, not a stub that pretends to book
    // anything, so it says "coming soon" rather than faking a confirmation.
    setReservationMessage(t("reservationComingSoon"));
    window.setTimeout(() => setReservationMessage(null), 2200);
  }

  function handleClose() {
    setIsClosing(true);
    window.setTimeout(onClose, CLOSE_ANIMATION_MS);
  }

  // Adding hands off after the sheet has finished sliding away, so the course's new card
  // (which glows and scrolls into view) is what the user sees next — not a sheet vanishing.
  function handleAdd() {
    setIsClosing(true);
    window.setTimeout(() => onAddToChain(localizedPlace), CLOSE_ANIMATION_MS);
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
          <div className="flex shrink-0 items-center gap-1">
            <button
              aria-label={isBookmarked ? t("bookmarkedPlaceAria") : t("bookmarkPlaceAria")}
              className={cn(
                "grid h-8 w-8 place-items-center rounded-full transition-colors hover:bg-surface-muted",
                isBookmarked ? "text-primary" : "text-muted hover:text-foreground",
              )}
              onClick={() => onToggleBookmark(place.id)}
              type="button"
            >
              <BookmarkIcon className="h-4.5 w-4.5" />
            </button>
            <button
              aria-label={t("placeDetailCloseAria")}
              className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              onClick={handleClose}
              type="button"
            >
              <CloseIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        </div>

        {isShowingSummary && (
          <span className="mt-3 inline-flex w-fit items-center gap-1 rounded-xs border border-primary bg-white px-1.5 py-0.5 text-[10px] font-bold text-primary">
            {t("aiSummaryBadge")}
          </span>
        )}
        <p
          className={cn(
            "text-sm leading-6 text-muted-strong text-pretty",
            isShowingSummary ? "mt-1.5" : "mt-3",
            // While the summary is still loading, the full text is shown clamped as a
            // placeholder — once it arrives, the (already short) summary needs no clamp.
            !isDescExpanded && isDescLong && !summary && "line-clamp-3",
          )}
        >
          {isDescExpanded ? description : (summary ?? description)}
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

        <div className="mt-3 rounded-sm border border-border bg-surface/76 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-muted">{t("statHours")}</p>
            <p className="shrink-0 text-xs font-semibold text-muted">
              {t("savedByCount", { count: place.savedBy.toLocaleString() })}
            </p>
          </div>
          <div className="mt-1 grid gap-0.5">
            {hoursLines.map((line) => (
              <p className="text-sm font-semibold" key={line}>
                {line}
              </p>
            ))}
          </div>
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

        <div className={cn("mt-4 grid gap-2", needsReservation && "grid-cols-[1fr_1.5fr]")}>
          {needsReservation && (
            <div className="relative">
              <Button className="h-12 w-full" onClick={handleReserve} variant="secondary">
                {t("reserveButton")}
              </Button>
              {reservationMessage && (
                <p
                  className="share-toast pointer-events-none absolute inset-x-0 bottom-full mb-2 rounded-full border border-border bg-white px-4 py-2 text-center text-xs font-semibold text-primary shadow-soft"
                  key={reservationMessage}
                >
                  {reservationMessage}
                </p>
              )}
            </div>
          )}

          {isInChain ? (
            <div
              className="inline-flex h-12 items-center justify-center gap-2 rounded-sm border border-primary bg-primary/10 text-sm font-semibold text-primary"
              role="status"
            >
              <CheckIcon className="h-4 w-4" />
              {t("addedToChain")}
            </div>
          ) : (
            <Button className="h-12 w-full active:scale-[0.98]" onClick={handleAdd}>
              <PlaylistAddIcon className="h-4.5 w-4.5" />
              {t("addToChain")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
