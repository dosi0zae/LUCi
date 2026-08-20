"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkIcon, DownloadIcon, HeartIcon, MapPinIcon, ShareIcon } from "@/components/layout/app-icons";
import { ConstellationCard } from "@/features/mobile/constellation-card";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import {
  getPlacesByIds,
  getTotalMinutes,
  localizePlace,
  localizeTrip,
  type FeedTrip,
  type MobilePlace,
} from "@/features/mobile/mobile-data";
import { useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import type { TranslationKey } from "@/features/mobile/i18n/translations";

type TripDetailSheetProps = {
  trip: FeedTrip;
  isLiked: boolean;
  isSaved: boolean;
  onClose: () => void;
  onLoadToChain: (trip: FeedTrip) => void;
  onOpenAuthor: (handle: string) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

const visibilityLabelKey: Record<FeedTrip["visibility"], TranslationKey> = {
  public: "visibilityPublic",
  link: "visibilityLink",
  private: "visibilityPrivate",
};

const CARD_SIZE = 1080;
const CARD_PADDING = 110;
const CARD_ROUTE_TOP = 480;
const CARD_ROUTE_HEIGHT = 380;

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

// Single uniform scale (not one scale per axis) plus a cos(latitude) correction on
// longitude, so the route's shape matches the real map instead of being stretched to
// fill the card. Mirrors the projection in constellation-card.tsx.
function getCardPoints(places: MobilePlace[]) {
  const lats = places.map((place) => place.lat);
  const lngs = places.map((place) => place.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const lngCorrection = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const latRange = maxLat - minLat || 0.0005;
  const lngRange = (maxLng - minLng) * lngCorrection || 0.0005;

  const availableWidth = CARD_SIZE - CARD_PADDING * 2;
  const scale = Math.min(availableWidth / lngRange, CARD_ROUTE_HEIGHT / latRange);

  const contentWidth = lngRange * scale;
  const contentHeight = latRange * scale;
  const offsetX = CARD_PADDING + (availableWidth - contentWidth) / 2;
  const offsetY = CARD_ROUTE_TOP + (CARD_ROUTE_HEIGHT - contentHeight) / 2;

  return places.map((place, index) => ({
    label: String(index + 1),
    x: offsetX + (place.lng - minLng) * lngCorrection * scale,
    y: offsetY + contentHeight - (place.lat - minLat) * scale,
  }));
}

export function TripDetailSheet({
  isLiked,
  isSaved,
  onClose,
  onLoadToChain,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  trip,
}: TripDetailSheetProps) {
  const t = useT();
  const { locale } = useLocale();
  const [shareMessage, setShareMessage] = useState("");
  const places = getPlacesByIds(trip.placeIds);
  const localizedPlaces = places.map((place) => localizePlace(place, locale));
  const localizedTrip = localizeTrip(trip, locale);
  const totalMinutes = getTotalMinutes(places);

  // Renders the same branded "constellation" card shown in the trip detail view to an
  // off-DOM canvas, shared by both the download button and the image-share flow below so
  // there's only one place that defines what the exported card looks like.
  async function renderShareCardCanvas(): Promise<HTMLCanvasElement | null> {
    if (places.length < 2) {
      setShareMessage(t("shareImageNeedsTwo"));
      return null;
    }

    const points = getCardPoints(places);
    const pathPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
    const title = escapeXml(localizedTrip.title);
    const meta = escapeXml(`${localizedPlaces[0]?.area ?? t("seoulWide")} · ${trip.authorName}`);
    const summary = escapeXml(`${t("placesCount", { count: places.length })} · ${t("minutesCount", { count: totalMinutes })}`);
    // Shown as a watermark so a viewer who sees the card on Instagram/X/Threads (where
    // the image itself can't carry a real tappable link) still knows where to find it.
    const siteHandle = escapeXml(window.location.host);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${CARD_SIZE}" height="${CARD_SIZE}" viewBox="0 0 ${CARD_SIZE} ${CARD_SIZE}">
        <defs>
          <radialGradient id="blue" cx="25%" cy="15%" r="60%">
            <stop offset="0%" stop-color="#4f8df7" stop-opacity="0.6"/>
            <stop offset="65%" stop-color="#15213a" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="lime" cx="80%" cy="80%" r="55%">
            <stop offset="0%" stop-color="#b7e86b" stop-opacity="0.45"/>
            <stop offset="65%" stop-color="#0b1220" stop-opacity="0"/>
          </radialGradient>
          <pattern id="stars" width="40" height="40" patternUnits="userSpaceOnUse">
            <circle cx="6" cy="6" r="1.8" fill="rgba(255,255,255,0.3)"/>
          </pattern>
          <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="#0b1220"/>
        <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#blue)"/>
        <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#lime)"/>
        <rect width="${CARD_SIZE}" height="${CARD_SIZE}" fill="url(#stars)" opacity="0.85"/>
        <text x="90" y="130" fill="rgba(255,255,255,0.4)" font-family="Arial, sans-serif" font-size="26" font-weight="800" letter-spacing="8">TRIP CHAIN</text>
        <text x="990" y="130" text-anchor="end" fill="rgba(255,255,255,0.4)" font-family="Arial, sans-serif" font-size="26" font-weight="700">${siteHandle}</text>
        <text x="90" y="228" fill="#ffffff" font-family="Arial, sans-serif" font-size="54" font-weight="900">${title}</text>
        <text x="90" y="280" fill="rgba(255,255,255,0.72)" font-family="Arial, sans-serif" font-size="28" font-weight="700">${meta}</text>
        <polyline points="${pathPoints}" fill="none" stroke="#b7e86b" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" filter="url(#glow)"/>
        ${points
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="42" fill="#b7e86b" opacity="0.18"/>
              <circle cx="${point.x}" cy="${point.y}" r="22" fill="#b7e86b"/>
              <text x="${point.x}" y="${point.y + 9}" text-anchor="middle" fill="#0b1220" font-family="Arial, sans-serif" font-size="24" font-weight="900">${point.label}</text>
            `,
          )
          .join("")}
        <rect x="70" y="900" width="940" height="120" rx="24" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)"/>
        <text x="105" y="962" fill="#ffffff" font-family="Arial, sans-serif" font-size="32" font-weight="900">${summary}</text>
      </svg>`;

    const cardImage = new Image();
    const logoImage = new Image();

    try {
      await Promise.all([
        new Promise<void>((resolve, reject) => {
          cardImage.onload = () => resolve();
          cardImage.onerror = () => reject(new Error("card image failed"));
          cardImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        }),
        new Promise<void>((resolve, reject) => {
          logoImage.onload = () => resolve();
          logoImage.onerror = () => reject(new Error("logo image failed"));
          logoImage.src = "/tripchain-logo.svg";
        }),
      ]);
    } catch {
      setShareMessage(t("shareImageFailed"));
      return null;
    }

    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    canvas.width = CARD_SIZE;
    canvas.height = CARD_SIZE;

    if (!context) {
      setShareMessage(t("shareImageFailed"));
      return null;
    }

    context.drawImage(cardImage, 0, 0);
    context.globalAlpha = 0.7;
    context.drawImage(logoImage, 890, 925, 100, 70);
    context.globalAlpha = 1;

    return canvas;
  }

  function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  // The card image is the primary thing being shared (like sharing a music card to
  // Instagram Story) — text/url-only sharing is only a fallback for browsers that can't
  // share files (e.g. desktop). There's no server-side trip storage yet (see
  // mobile-app-shell's localStorage-only publish flow), so the link always points at the
  // app itself rather than a per-trip page that wouldn't resolve for anyone else.
  async function shareTrip() {
    const shareText = `${localizedTrip.title} · ${t("placesCount", { count: places.length })} · ${t("minutesCount", { count: totalMinutes })}`;
    const shareUrl = `${window.location.origin}/mobile`;

    const canvas = await renderShareCardCanvas();
    const blob = canvas ? await canvasToPngBlob(canvas) : null;

    if (blob) {
      const file = new File([blob], `${localizedTrip.title.replace(/[\\/:*?"<>|]/g, "-")}-tripchain.png`, {
        type: "image/png",
      });

      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: localizedTrip.title, text: shareText, url: shareUrl });
          setShareMessage(t("shareDone"));
        } catch {
          // Share sheet was dismissed by the user — nothing to report.
        }
        return;
      }
    }

    if (navigator.share) {
      try {
        await navigator.share({ title: localizedTrip.title, text: shareText, url: shareUrl });
        setShareMessage(t("shareDone"));
      } catch {
        // Share sheet was dismissed by the user — nothing to report.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage(t("shareLinkCopied"));
    } catch {
      setShareMessage(t("shareLinkFailed"));
    }
  }

  async function downloadShareCard() {
    const canvas = await renderShareCardCanvas();
    if (!canvas) {
      return;
    }

    const link = document.createElement("a");
    link.download = `${localizedTrip.title.replace(/[\\/:*?"<>|]/g, "-")}-tripchain.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    setShareMessage(t("shareImageSaved"));
  }

  return (
    <div className="detail-page absolute inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <button
          className="text-sm font-bold text-muted-strong"
          onClick={onClose}
          type="button"
        >
          {t("back")}
        </button>
        {trip.isMine && <Badge tone="blue">{t("myCourseBadge")}</Badge>}
      </header>

      <div className="app-scroll-area min-w-0 flex-1 overflow-y-auto px-5 py-4">
        <Badge tone="neutral">{localizedPlaces[0]?.area ?? t("seoulWide")}</Badge>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight text-balance">{localizedTrip.title}</h1>
        <p className="mt-1 text-xs font-semibold text-muted">
          <button
            className="font-bold text-foreground hover:underline"
            onClick={() => onOpenAuthor(trip.authorHandle)}
            type="button"
          >
            {trip.authorName}
          </button>{" "}
          · {t(visibilityLabelKey[trip.visibility])}
        </p>
        {localizedTrip.description && (
          <p className="mt-3 text-sm leading-6 text-muted-strong text-pretty">{localizedTrip.description}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">{t("statPlaces")}</p>
            <p className="mt-1 text-sm font-extrabold">{t("placesCount", { count: places.length })}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">{t("statDurationTotal")}</p>
            <p className="mt-1 text-sm font-extrabold">{t("minutesCount", { count: totalMinutes })}</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">{t("statSaved")}</p>
            <p className="mt-1 text-sm font-extrabold">{trip.saved.toLocaleString()}</p>
          </div>
        </div>

        {places.length >= 2 && (
          <div className="mt-4">
            <ConstellationCard places={places} />
          </div>
        )}

        <div className="mt-5 grid gap-2">
          {localizedPlaces.map((place, index) => (
            <article className="rounded-lg border border-border bg-surface p-3 shadow-soft" key={place.id}>
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-white">
                  {index + 1}
                </span>
                <PlaceThumb category={place.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-extrabold">{place.name}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {place.area} · {place.duration} · {place.fee}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <footer className="border-t border-border px-5 py-3">
        <div className="grid grid-cols-5 gap-2">
          <Button aria-label={t("loadToChainButton")} onClick={() => onLoadToChain(trip)} variant="gradient">
            <MapPinIcon className="h-4 w-4" />
          </Button>
          <Button
            aria-label={t("likeButton", { count: (trip.likes + (isLiked ? 1 : 0)).toLocaleString() })}
            onClick={() => onToggleLike(trip.id)}
            variant={isLiked ? "primary" : "secondary"}
          >
            <HeartIcon className="h-4 w-4" filled={isLiked} />
          </Button>
          <Button
            aria-label={isSaved ? t("savedButton") : t("saveButton")}
            onClick={() => onToggleSave(trip.id)}
            variant={isSaved ? "primary" : "secondary"}
          >
            <BookmarkIcon className="h-4 w-4" />
          </Button>
          <Button aria-label={t("shareButton")} onClick={() => void shareTrip()} variant="secondary">
            <ShareIcon className="h-4 w-4" />
          </Button>
          <Button aria-label={t("saveImageButton")} onClick={() => void downloadShareCard()} variant="secondary">
            <DownloadIcon className="h-4 w-4" />
          </Button>
        </div>
        {shareMessage && (
          <p className="mt-2 text-center text-xs font-semibold text-muted-strong">{shareMessage}</p>
        )}
      </footer>
    </div>
  );
}
