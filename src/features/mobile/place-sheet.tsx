"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  BookmarkIcon,
  CheckIcon,
  CloseIcon,
  MapPinIcon,
  PlaylistAddIcon,
  AiSparklesIcon,
} from "@/components/layout/app-icons";
import { NaverIcon } from "@/features/mobile/brand-icons";
import { PhotoLightbox, PlacePhotoThumb } from "@/features/mobile/place-photo";
import { localizePlace, type MobilePlace, type TripComment } from "@/features/mobile/mobile-data";
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
  comments: TripComment[];
  onAddComment: (text: string) => void;
  onAddToChain: (place: MobilePlace) => void;
  onToggleBookmark: (id: string) => void;
  onClose: () => void;
};

// Dragging the sheet down this far (or flicking it) dismisses it.
const DRAG_CLOSE_DISTANCE = 110;
const DRAG_CLOSE_VELOCITY = 0.6;

export function PlaceSheet({
  comments,
  isInChain,
  isBookmarked,
  onAddComment,
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
  const [isPhotoOpen, setIsPhotoOpen] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [reservationMessage, setReservationMessage] = useState<string | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [isMapMenuOpen, setIsMapMenuOpen] = useState(false);
  const mapMenuRef = useRef<HTMLDivElement>(null);
  // AI digest of the comments; remembered with the comment count it was made from so it
  // disappears (rather than going stale) once someone adds another comment.
  const [commentSummary, setCommentSummary] = useState<{ text: string; count: number } | null>(null);
  const [commentSummaryState, setCommentSummaryState] = useState<"idle" | "loading" | "failed">("idle");
  // Swipe-down-to-dismiss: how far the sheet is dragged, and whether that was a dismiss.
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [closedByDrag, setClosedByDrag] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; lastY: number; lastT: number; velocity: number } | null>(null);
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

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentDraft.trim()) {
      return;
    }
    onAddComment(commentDraft);
    setCommentDraft("");
  }

  async function summarizeComments() {
    setCommentSummaryState("loading");
    try {
      const response = await fetch("/api/summarize-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          placeName: localizedPlace.name,
          locale,
          comments: comments.map((comment) => comment.text),
        }),
      });
      const data = await response.json();
      if (response.ok && typeof data.summary === "string" && data.summary) {
        setCommentSummary({ text: data.summary, count: comments.length });
        setCommentSummaryState("idle");
        return;
      }
    } catch {
      // fall through to the failed state
    }
    setCommentSummaryState("failed");
  }

  useEffect(() => {
    if (!isMapMenuOpen) {
      return;
    }
    function closeOnOutsidePress(event: PointerEvent) {
      if (!mapMenuRef.current?.contains(event.target as Node)) {
        setIsMapMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [isMapMenuOpen]);

  // ---- swipe down to dismiss -------------------------------------------------------
  function beginDrag(clientY: number) {
    dragRef.current = { startY: clientY, lastY: clientY, lastT: performance.now(), velocity: 0 };
    setIsDragging(true);
  }

  function moveDrag(clientY: number) {
    const drag = dragRef.current;
    if (!drag) {
      return;
    }
    const now = performance.now();
    const elapsed = Math.max(1, now - drag.lastT);
    drag.velocity = (clientY - drag.lastY) / elapsed;
    drag.lastY = clientY;
    drag.lastT = now;
    setDragY(Math.max(0, clientY - drag.startY));
  }

  function endDrag() {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag) {
      return;
    }
    const distance = Math.max(0, drag.lastY - drag.startY);
    if (distance > DRAG_CLOSE_DISTANCE || (distance > 30 && drag.velocity > DRAG_CLOSE_VELOCITY)) {
      setClosedByDrag(true);
      setIsClosing(true);
      window.setTimeout(onClose, CLOSE_ANIMATION_MS);
    } else {
      setDragY(0);
    }
  }

  // Dragging the grab handle works with mouse and touch (pointer events). Dragging the
  // body also works on touch whenever the sheet is scrolled to its top: that needs
  // non-passive touch listeners so the browser's own overscroll can be cancelled.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) {
      return;
    }
    let tracking = false;

    function onTouchStart(event: TouchEvent) {
      if ((panelRef.current?.scrollTop ?? 1) > 0 || event.touches.length !== 1) {
        return;
      }
      tracking = false;
      dragRef.current = null;
      const startY = event.touches[0].clientY;
      // Start tracking, but only commit to a drag once the finger moves downward.
      dragRef.current = { startY, lastY: startY, lastT: performance.now(), velocity: 0 };
    }

    function onTouchMove(event: TouchEvent) {
      const drag = dragRef.current;
      if (!drag || event.touches.length !== 1) {
        return;
      }
      const y = event.touches[0].clientY;
      if (!tracking) {
        if (y - drag.startY > 6 && (panelRef.current?.scrollTop ?? 1) <= 0) {
          tracking = true;
          setIsDragging(true);
        } else {
          return;
        }
      }
      event.preventDefault();
      moveDrag(y);
    }

    function onTouchEnd() {
      if (tracking) {
        tracking = false;
        endDrag();
      } else {
        dragRef.current = null;
      }
    }

    panel.addEventListener("touchstart", onTouchStart, { passive: true });
    panel.addEventListener("touchmove", onTouchMove, { passive: false });
    panel.addEventListener("touchend", onTouchEnd);
    panel.addEventListener("touchcancel", onTouchEnd);
    return () => {
      panel.removeEventListener("touchstart", onTouchStart);
      panel.removeEventListener("touchmove", onTouchMove);
      panel.removeEventListener("touchend", onTouchEnd);
      panel.removeEventListener("touchcancel", onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleCommentSummary = commentSummary && commentSummary.count === comments.length ? commentSummary : null;

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
          "app-scroll-area glass-panel max-h-[85vh] w-full overflow-y-auto overscroll-contain rounded-t-xl px-5 pb-6",
          // Mid-drag the panel follows the finger directly; otherwise the open/close
          // animations run. A drag-dismiss slides on from where it was released.
          !isDragging && dragY === 0 && !closedByDrag && (isClosing ? "sheet-panel-out" : "sheet-panel"),
        )}
        onClick={(event) => event.stopPropagation()}
        ref={panelRef}
        role="dialog"
        aria-label={t("placeDetailAria", { name: localizedPlace.name })}
        style={
          closedByDrag
            ? { transform: "translateY(100%)", transition: `transform ${CLOSE_ANIMATION_MS}ms ease-in` }
            : dragY > 0 || isDragging
              ? {
                  transform: `translateY(${dragY}px)`,
                  transition: isDragging ? "none" : "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)",
                }
              : undefined
        }
      >
        {/* Grab handle: a generous touch target, draggable with mouse or finger. */}
        <div
          className="-mx-5 flex cursor-grab touch-none justify-center px-5 pb-3 pt-3 active:cursor-grabbing"
          onPointerCancel={endDrag}
          onPointerDown={(event) => {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Capture is only a nicety (keeps the drag going outside the handle).
            }
            beginDrag(event.clientY);
          }}
          onPointerMove={(event) => moveDrag(event.clientY)}
          onPointerUp={endDrag}
        >
          <span className="h-1 w-10 rounded-full bg-border-strong" />
        </div>

        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PlacePhotoThumb
              label={localizedPlace.name}
              onOpenPhoto={() => setIsPhotoOpen(true)}
              place={place}
              size="lg"
            />
            <div className="min-w-0">
              <p className="text-xs font-bold" style={{ color: "var(--primary)" }}>
                {categoryLabel(place.category)}
              </p>
              <div className="mt-0.5 flex items-start gap-2">
                <h2 className="line-clamp-2 min-w-0 text-lg font-extrabold leading-6">{localizedPlace.name}</h2>
                {/* One map pictogram beside the name; tapping it fans out the three map apps. */}
                <div className="relative shrink-0" ref={mapMenuRef}>
                  <button
                    aria-expanded={isMapMenuOpen}
                    aria-label={t("mapAppsHeading")}
                    className={cn(
                      "grid h-6 w-6 place-items-center rounded-full border transition-colors",
                      isMapMenuOpen
                        ? "border-primary bg-primary text-white"
                        : "border-border-strong text-muted-strong hover:border-primary hover:text-primary",
                    )}
                    onClick={() => setIsMapMenuOpen((open) => !open)}
                    title={t("mapAppsHeading")}
                    type="button"
                  >
                    <MapPinIcon className="h-3.5 w-3.5" />
                  </button>
                  {isMapMenuOpen && (
                    <div className="absolute right-0 top-full z-20 mt-2 flex items-center gap-1.5 rounded-full border border-border bg-surface p-1.5 shadow-soft">
                      <a
                        aria-label={t("mapKakao")}
                        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full transition hover:opacity-80"
                        href={getKakaoMapUrl(place)}
                        onClick={() => setIsMapMenuOpen(false)}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={t("mapKakao")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" className="h-full w-full object-cover" src="/map-icons/kakao-map-pin.png" />
                      </a>
                      <a
                        aria-label={t("mapNaver")}
                        className="grid h-9 w-9 place-items-center rounded-full bg-[#03C75A] text-white transition hover:opacity-80"
                        href={getNaverMapUrl(place)}
                        onClick={() => setIsMapMenuOpen(false)}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={t("mapNaver")}
                      >
                        <NaverIcon className="h-3.5 w-3.5" />
                      </a>
                      <a
                        aria-label={t("mapGoogle")}
                        className="grid h-9 w-9 place-items-center overflow-hidden rounded-full border border-border-strong bg-surface-muted transition hover:opacity-80"
                        href={getGoogleMapsUrl(place)}
                        onClick={() => setIsMapMenuOpen(false)}
                        rel="noopener noreferrer"
                        target="_blank"
                        title={t("mapGoogle")}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" className="h-full w-full scale-75 object-cover" src="/map-icons/google-maps-pin.jpg" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
              <p className="mt-0.5 truncate text-xs text-muted">{place.address}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-start gap-1">
            <div className="flex flex-col items-center">
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
              <span className="-mt-0.5 text-[11px] font-bold text-muted">{place.savedBy.toLocaleString()}</span>
            </div>
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

        <p
          className={cn(
            "mt-4 text-sm leading-6 text-muted-strong text-pretty",
            // While the summary is still loading, the full text is shown clamped as a
            // placeholder — once it arrives, the (already short) summary needs no clamp.
            !isDescExpanded && isDescLong && !summary && "line-clamp-3",
          )}
        >
          {isShowingSummary && (
            <AiSparklesIcon className="mr-1 inline-block h-3.5 w-3.5 -translate-y-px align-middle text-primary" />
          )}
          {isDescExpanded ? description : (summary ?? description)}
        </p>
        {isDescLong && (
          <button
            className="mt-1 text-primary"
            onClick={() => setIsDescExpanded((current) => !current)}
            type="button"
          >
            <span className="text-xs font-bold">
              {isDescExpanded ? t("descriptionCollapse") : t("descriptionExpand")}
            </span>
          </button>
        )}

        {/* The practical facts in quiet cells separated by hairlines (no cards). */}
        <div className="mt-5 border-y border-border text-sm">
          <dl className="grid grid-cols-2 divide-x divide-border">
            <div className="py-3 pr-4">
              <dt className="text-xs font-semibold text-muted">{t("statDuration")}</dt>
              <dd className="mt-0.5 font-bold">{localizedPlace.duration}</dd>
            </div>
            <div className="py-3 pl-4">
              <dt className="text-xs font-semibold text-muted">{t("statFee")}</dt>
              <dd className="mt-0.5 font-bold">{localizedPlace.fee}</dd>
            </div>
          </dl>
          <dl className="border-t border-border py-3">
            <dt className="text-xs font-semibold text-muted">{t("statHours")}</dt>
            <dd className="mt-0.5 grid gap-0.5 font-bold">
              {hoursLines.map((line) => (
                <span key={line}>{line}</span>
              ))}
            </dd>
          </dl>
        </div>

        {/* Comments about this place, and an AI digest of them. */}
        <section className="mt-5">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-extrabold">{t("commentsHeading", { count: comments.length })}</h3>
            {comments.length >= 2 && (
              <button
                className="inline-flex h-6 items-center gap-1 rounded-full border border-primary px-2.5 text-primary transition-colors hover:bg-primary hover:text-white disabled:opacity-60"
                disabled={commentSummaryState === "loading"}
                onClick={() => void summarizeComments()}
                type="button"
              >
                {commentSummaryState === "loading" ? (
                  <span className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                ) : (
                  <AiSparklesIcon className="h-3 w-3" />
                )}
                <span className="text-[11px] font-extrabold">
                  {commentSummaryState === "loading" ? t("commentSummaryLoading") : t("commentSummarizeButton")}
                </span>
              </button>
            )}
          </div>

          {visibleCommentSummary && (
            <p className="mt-3 rounded-lg bg-primary-soft px-3 py-2.5 text-sm leading-6 text-foreground text-pretty">
              <span className="mb-0.5 flex items-center gap-1 text-[11px] font-extrabold text-primary-strong">
                <AiSparklesIcon className="h-3 w-3" />
                {t("commentSummaryLabel")}
              </span>
              {visibleCommentSummary.text}
            </p>
          )}
          {commentSummaryState === "failed" && (
            <p className="mt-3 text-xs font-semibold text-danger">{t("commentSummaryFailed")}</p>
          )}

          {comments.length === 0 ? (
            <p className="mt-3 text-xs leading-5 text-muted">{t("commentEmpty")}</p>
          ) : (
            <ul className="mt-3 grid gap-3">
              {comments.map((comment) => (
                <li key={comment.id}>
                  <p className="text-xs font-bold">{comment.authorName}</p>
                  <p className="mt-0.5 text-sm leading-5 text-muted-strong text-pretty">{comment.text}</p>
                </li>
              ))}
            </ul>
          )}

          <form className="mt-3 flex items-center gap-2" onSubmit={submitComment}>
            <input
              className="min-w-0 flex-1 rounded-full border border-border bg-surface px-4 py-2.5 text-sm outline-none placeholder:text-muted focus:border-primary"
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={t("commentPlaceholder")}
              value={commentDraft}
            />
            <button
              aria-label={t("commentSubmitAria")}
              className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-strong disabled:opacity-50"
              disabled={!commentDraft.trim()}
              type="submit"
            >
              <ArrowRightIcon className="h-4 w-4" />
            </button>
          </form>
        </section>

        <div className={cn("mt-6 grid gap-2", needsReservation && "grid-cols-[1fr_1.5fr]")}>
          {needsReservation && (
            <div className="relative">
              <Button className="h-12 w-full" onClick={handleReserve} variant="secondary">
                <span className="text-sm font-semibold">{t("reserveButton")}</span>
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
              <span className="text-sm font-semibold">{t("addToChain")}</span>
            </Button>
          )}
        </div>
      </div>

      {isPhotoOpen && (
        <PhotoLightbox name={localizedPlace.name} onClose={() => setIsPhotoOpen(false)} place={place} />
      )}
    </div>
  );
}
