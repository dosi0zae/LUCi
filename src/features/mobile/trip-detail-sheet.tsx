"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from "react";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeftIcon,
  BookmarkIcon,
  DownloadIcon,
  HeartIcon,
  MapPlusIcon,
  MoreIcon,
  ShareIcon,
  TrashIcon,
  ImageIcon,
} from "@/components/layout/app-icons";
import { FacebookIcon, InstagramIcon, KakaoTalkIcon, WhatsAppIcon, XIcon } from "@/features/mobile/brand-icons";
import { ConstellationCard } from "@/features/mobile/constellation-card";
import { buildCourseShareUrl } from "@/features/mobile/course-share";
import { placeSubtitle } from "@/features/mobile/dining-tags";
import { shareToKakaoTalk } from "@/features/mobile/kakao-share";
import { buildFacebookShareUrl, buildTwitterShareUrl, buildWhatsAppShareUrl } from "@/features/mobile/sns-share";
import { PopOnActive, updateScrollSheen } from "@/features/mobile/motion";
import { PhotoLightbox, PlacePhotoThumb } from "@/features/mobile/place-photo";
import { PlaceSheet } from "@/features/mobile/place-sheet";
import {
  getPlacesByIds,
  getTotalMinutes,
  localizePlace,
  localizeTrip,
  type FeedTrip,
  type MobilePlace,
  type TripComment,
  getTripCoverPlace,
  getPlaceById,
  getPlaceImageUrl,
} from "@/features/mobile/mobile-data";
import { useCategoryLabel, useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import type { TranslationKey } from "@/features/mobile/i18n/translations";
import { cn } from "@/lib/utils";

// The detail sheet's floating action buttons: round, on the same white surface as the map
// controls; the pressed/active state fills with the primary color.
const FLOAT_BUTTON = "grid h-14 w-14 place-items-center rounded-full active:scale-95";
const FLOAT_BUTTON_IDLE = "ios-glass text-foreground";
const FLOAT_BUTTON_ACTIVE = "ios-btn-on shadow-[0_8px_24px_rgba(47,111,228,0.4)]";

// Where the card this screen grew out of sat, as distances in px from each edge of the app frame.
export type DetailOrigin = { top: number; right: number; bottom: number; left: number };

type TripDetailSheetProps = {
  trip: FeedTrip;
  origin?: DetailOrigin | null;
  // The on-screen rectangle of the card's photo: the cover photo here grows out of it.
  photoFrom?: DOMRect | null;
  comments: TripComment[];
  isLiked: boolean;
  isSaved: boolean;
  onAddComment: (text: string) => void;
  onClose: () => void;
  onDelete: (id: string) => void;
  onLoadToChain: (trip: FeedTrip) => void;
  onOpenAuthor: (handle: string) => void;
  onSetCover: (tripId: string, placeId: string) => void;
  // Tapping a spot opens its place sheet, which can bookmark it or add it to the user's course.
  bookmarkedPlaceIds: Set<string>;
  chainIds: string[];
  onAddPlaceComment: (placeId: string, text: string) => void;
  onAddPlaceToChain: (place: MobilePlace) => void;
  onToggleBookmarkPlace: (id: string) => void;
  placeComments: Record<string, TripComment[]>;
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

// tripchain-logo.svg's own viewBox (0 0 333.18 314.77) — used to size the watermark by
// its real aspect ratio instead of stretching it into a fixed box.
const LOGO_ASPECT = 333.18 / 314.77;
const LOGO_TARGET_HEIGHT = 70;
const LOGO_TARGET_RIGHT = 990;
const LOGO_TARGET_TOP = 925;

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
  origin,
  photoFrom,
  comments,
  isLiked,
  isSaved,
  onAddComment,
  onClose,
  onDelete,
  onLoadToChain,
  onOpenAuthor,
  onSetCover,
  bookmarkedPlaceIds,
  chainIds,
  onAddPlaceComment,
  onAddPlaceToChain,
  onToggleBookmarkPlace,
  placeComments,
  onToggleLike,
  onToggleSave,
  trip,
}: TripDetailSheetProps) {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const [shareMessage, setShareMessage] = useState("");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  // The stop whose photo is open full-size.
  const [photoPlaceId, setPhotoPlaceId] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  // Dragging in from the left edge slides the screen away (like the system back swipe).
  const [edgeDrag, setEdgeDrag] = useState<{ x: number; active: boolean; gone: boolean }>({ x: 0, active: false, gone: false });
  const edgeStartRef = useRef<{ x: number; t: number; v: number; lastX: number } | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const selectedPlace = selectedPlaceId ? getPlaceById(selectedPlaceId) : undefined;
  const coverPlaceId = getTripCoverPlace(trip)?.id;
  const coverSrc = coverPlaceId ? getPlaceImageUrl(coverPlaceId) : null;
  const [coverFailed, setCoverFailed] = useState(false);
  const coverRef = useRef<HTMLDivElement>(null);

  // Shared photo: the cover starts exactly over the card's photo (same size, same crop shape) and
  // eases to its place at the top while the screen opens around it.
  useLayoutEffect(() => {
    const cover = coverRef.current;
    if (!cover || !photoFrom || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }
    const to = cover.getBoundingClientRect();
    if (to.width === 0 || photoFrom.width === 0) {
      return;
    }
    // One uniform scale that makes the cover at least as big as the card's photo, then a clip that crops
    // it to the card photo's own shape (a square thumbnail out of a wide cover).
    const scale = Math.max(photoFrom.width / to.width, photoFrom.height / to.height);
    const dx = photoFrom.left + photoFrom.width / 2 - (to.left + to.width / 2);
    const dy = photoFrom.top + photoFrom.height / 2 - (to.top + to.height / 2);
    const cropX = Math.max(0, (to.width - photoFrom.width / scale) / 2);
    const cropY = Math.max(0, (to.height - photoFrom.height / scale) / 2);
    cover.animate(
      [
        {
          transform: `translate(${dx}px, ${dy}px) scale(${scale})`,
          clipPath: `inset(${cropY}px ${cropX}px ${cropY}px ${cropX}px round ${16 / scale}px)`,
        },
        { transform: "translate(0px, 0px) scale(1)", clipPath: "inset(0px 0px 0px 0px round 0px 0px 24px 24px)" },
      ],
      { duration: 540, easing: "cubic-bezier(0.22, 1, 0.36, 1)", fill: "backwards" },
    );
    // Runs once, when the screen opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleClose() {
    if (isClosing) {
      return;
    }
    setIsClosing(true);
    window.setTimeout(onClose, origin ? 340 : 240);
  }

  function beginEdgeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Capture only keeps the drag going outside the strip.
    }
    edgeStartRef.current = { x: event.clientX, t: performance.now(), v: 0, lastX: event.clientX };
    setEdgeDrag({ x: 0, active: true, gone: false });
  }

  function moveEdgeDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const start = edgeStartRef.current;
    if (!start) {
      return;
    }
    const now = performance.now();
    start.v = (event.clientX - start.lastX) / Math.max(1, now - start.t);
    start.lastX = event.clientX;
    start.t = now;
    setEdgeDrag({ x: Math.max(0, event.clientX - start.x), active: true, gone: false });
  }

  function endEdgeDrag() {
    const start = edgeStartRef.current;
    edgeStartRef.current = null;
    if (!start) {
      return;
    }
    const distance = Math.max(0, start.lastX - start.x);
    if (distance > 110 || (distance > 30 && start.v > 0.6)) {
      setEdgeDrag({ x: distance, active: false, gone: true });
      window.setTimeout(onClose, 230);
    } else {
      setEdgeDrag({ x: 0, active: false, gone: false });
    }
  }

  function submitComment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!commentDraft.trim()) {
      return;
    }
    onAddComment(commentDraft);
    setCommentDraft("");
  }

  function closeMenu() {
    setIsMenuOpen(false);
    setIsConfirmingDelete(false);
  }

  useEffect(() => {
    if (!shareMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => setShareMessage(""), 2400);
    return () => window.clearTimeout(timeoutId);
  }, [shareMessage]);

  const places = getPlacesByIds(trip.placeIds);
  const localizedPlaces = places.map((place) => localizePlace(place, locale));
  const localizedTrip = localizeTrip(trip, locale);
  const totalMinutes = getTotalMinutes(places);

  // Shared by every share handler below (Kakao, X, Facebook, WhatsApp, the OS share
  // sheet) — plain functions, not values computed at render time, since window.location
  // isn't available during server rendering and these must only run from a click handler.
  function getShareUrl() {
    return buildCourseShareUrl(window.location.origin, trip.placeIds, localizedTrip.title);
  }
  function getShareText() {
    return `${localizedTrip.title} · ${t("placesCount", { count: places.length })} · ${t("minutesCount", { count: totalMinutes })}`;
  }

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

    // The logo's own artwork is solid blue; recolor it to white on an offscreen canvas
    // (source-in keeps only the pixels the logo already drew, tinted white) rather than
    // stretching it into a fixed box, which was squashing its real proportions.
    const logoWidth = LOGO_TARGET_HEIGHT * LOGO_ASPECT;
    const whiteLogo = document.createElement("canvas");
    whiteLogo.width = logoWidth * 3;
    whiteLogo.height = LOGO_TARGET_HEIGHT * 3;
    const whiteLogoContext = whiteLogo.getContext("2d");

    if (whiteLogoContext) {
      whiteLogoContext.drawImage(logoImage, 0, 0, whiteLogo.width, whiteLogo.height);
      whiteLogoContext.globalCompositeOperation = "source-in";
      whiteLogoContext.fillStyle = "#ffffff";
      whiteLogoContext.fillRect(0, 0, whiteLogo.width, whiteLogo.height);

      context.globalAlpha = 0.7;
      context.drawImage(whiteLogo, LOGO_TARGET_RIGHT - logoWidth, LOGO_TARGET_TOP, logoWidth, LOGO_TARGET_HEIGHT);
      context.globalAlpha = 1;
    }

    return canvas;
  }

  function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
    return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  }

  // The card image is the primary thing being shared (like sharing a music card to
  // Instagram Story) — text/url-only sharing is only a fallback for browsers that can't
  // share files (e.g. desktop). The link encodes the course's place ids directly (see
  // course-share.ts) rather than pointing at a per-trip server page — there's no
  // server-side trip storage (mobile-app-shell's publish flow is localStorage-only), but
  // every place id is static bundled data, so the link resolves for anyone regardless.
  async function shareTrip() {
    const shareText = getShareText();
    const shareUrl = getShareUrl();

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

  async function shareToKakao() {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    if (!appKey) {
      setShareMessage(t("kakaoShareFailed"));
      return;
    }

    try {
      await shareToKakaoTalk({
        appKey,
        title: localizedTrip.title,
        description: localizedTrip.description || `${t("placesCount", { count: places.length })} · ${t("minutesCount", { count: totalMinutes })}`,
        imageUrl: `${window.location.origin}/apple-icon.png`,
        link: getShareUrl(),
        buttonLabel: t("loadToChainButton"),
      });
    } catch {
      setShareMessage(t("kakaoShareFailed"));
    }
  }

  // X, Facebook and WhatsApp all publish a real share-intent URL (unlike Instagram/TikTok,
  // which don't — see sns-share.ts), so these just open that link directly.
  function shareToTwitter() {
    window.open(buildTwitterShareUrl(getShareText(), getShareUrl()), "_blank", "noopener,noreferrer");
  }
  function shareToFacebook() {
    window.open(buildFacebookShareUrl(getShareUrl()), "_blank", "noopener,noreferrer");
  }
  function shareToWhatsApp() {
    window.open(buildWhatsAppShareUrl(getShareText(), getShareUrl()), "_blank", "noopener,noreferrer");
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
    <div
      className={cn(
        "absolute inset-0 z-40 flex flex-col bg-background",
        edgeDrag.active || edgeDrag.x > 0 || edgeDrag.gone
          ? ""
          : isClosing
            ? origin
              ? "detail-zoom-out"
              : "detail-page-out"
            : origin
              ? "detail-zoom"
              : "detail-page",
      )}
      style={
        {
          "--o-top": `${origin?.top ?? 0}px`,
          "--o-right": `${origin?.right ?? 0}px`,
          "--o-bottom": `${origin?.bottom ?? 0}px`,
          "--o-left": `${origin?.left ?? 0}px`,
          ...(edgeDrag.active || edgeDrag.x > 0 || edgeDrag.gone
            ? {
                transform: `translateX(${edgeDrag.gone ? "100%" : `${edgeDrag.x}px`})`,
                transition: edgeDrag.active ? "none" : "transform 230ms cubic-bezier(0.22, 1, 0.36, 1)",
                boxShadow: "-18px 0 48px rgba(15, 23, 42, 0.18)",
              }
            : {}),
        } as CSSProperties
      }
    >
      <div
        aria-hidden="true"
        className="absolute bottom-0 left-0 top-24 z-30 w-5 touch-none"
        onPointerCancel={endEdgeDrag}
        onPointerDown={beginEdgeDrag}
        onPointerMove={moveEdgeDrag}
        onPointerUp={endEdgeDrag}
      />
      {/* Floating back button (and "my course" tag) instead of a docked header; a white fade
          appears behind them once the page scrolls, like the other screens. */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 [height:calc(5.25rem+env(safe-area-inset-top))] transition-opacity duration-300",
          isScrolled ? "opacity-100" : "opacity-0",
        )}
        style={{
          background:
            "linear-gradient(to bottom, var(--background) 0%, var(--background) 66%, transparent 100%)",
        }}
      />
      <button
        aria-label={t("backAria")}
        className="ios-glass absolute left-4 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 grid h-11 w-11 place-items-center rounded-full text-muted-strong"
        onClick={handleClose}
        type="button"
      >
        <ArrowLeftIcon className="h-[1.375rem] w-[1.375rem]" />
      </button>
      {trip.isMine && (
        <span className="pointer-events-none absolute right-4 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 flex h-10 items-center">
          <Badge tone="blue">{t("myCourseBadge")}</Badge>
        </span>
      )}

      <div
        className="app-scroll-area min-w-0 flex-1 overflow-y-auto px-5 [padding-bottom:calc(6.5rem+env(safe-area-inset-bottom))] [padding-top:calc(4rem+env(safe-area-inset-top))]"
        onScroll={(event) => {
          updateScrollSheen(event.currentTarget);
          const scrolled = event.currentTarget.scrollTop > 8;
          setIsScrolled((current) => (current === scrolled ? current : scrolled));
        }}
      >
        {coverSrc && !coverFailed && (
          // Edge to edge and up under the status bar (the negative margins cancel the page's own padding);
          // the back button floats over it, with a faint shade behind so the white button never vanishes.
          <div
            className="relative -mx-5 mb-5 overflow-hidden rounded-b-3xl will-change-transform [margin-top:calc(-4rem-env(safe-area-inset-top))]"
            ref={coverRef}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              className="block w-full object-cover [height:calc(17rem+env(safe-area-inset-top))]"
              onError={() => setCoverFailed(true)}
              src={coverSrc}
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/35 to-transparent" />
          </div>
        )}
        <Badge tone="neutral">{localizedPlaces[0]?.area ?? t("seoulWide")}</Badge>
        <div className="mt-3 flex items-start justify-between gap-2">
          <h1 className="break-keep text-[1.75rem] font-extrabold leading-9 tracking-tight text-balance">{localizedTrip.title}</h1>
          {trip.isMine && (
            <div className="relative shrink-0">
              <button
                aria-label={t("moreOptionsAria")}
                className="ios-btn grid h-10 w-10 shrink-0 place-items-center rounded-full"
                onClick={() => setIsMenuOpen((open) => !open)}
                type="button"
              >
                <MoreIcon className="h-5 w-5" />
              </button>
              {isMenuOpen && (
                <>
                  <button
                    aria-hidden="true"
                    className="fixed inset-0 z-10 cursor-default"
                    onClick={closeMenu}
                    tabIndex={-1}
                  />
                  <div className="ios-menu absolute right-0 top-11 z-20 w-56 overflow-hidden p-1.5">
                    {!isConfirmingDelete ? (
                      <button
                        className="ios-menu-item flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[0.9375rem] font-semibold text-danger"
                        onClick={() => setIsConfirmingDelete(true)}
                        type="button"
                      >
                        <TrashIcon className="h-4 w-4" />
                        {t("deleteChainButton")}
                      </button>
                    ) : (
                      <div className="p-3">
                        <p className="text-sm font-bold text-foreground">{t("deleteChainConfirmTitle")}</p>
                        <p className="mt-1 text-sm text-muted">{t("deleteChainConfirmBody")}</p>
                        <div className="mt-3 grid grid-cols-2 gap-2">
                          <button
                            className="ios-btn rounded-full py-2.5 text-sm font-semibold"
                            onClick={closeMenu}
                            type="button"
                          >
                            {t("cancel")}
                          </button>
                          <button
                            className="rounded-full bg-danger py-2.5 text-sm font-bold text-white transition hover:opacity-90"
                            onClick={() => onDelete(trip.id)}
                            type="button"
                          >
                            {t("deleteButton")}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
        <p className="mt-1.5 text-sm font-semibold text-muted">
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
          <p className="mt-3 break-keep text-[0.9375rem] leading-7 text-muted-strong text-pretty">{localizedTrip.description}</p>
        )}

        <div className="mt-5 grid grid-cols-3 gap-3">
          <div className="ios-row p-3.5">
            <p className="text-sm font-semibold text-muted">{t("statPlaces")}</p>
            <p className="mt-1 text-base font-extrabold">{t("placesCount", { count: places.length })}</p>
          </div>
          <div className="ios-row p-3.5">
            <p className="text-sm font-semibold text-muted">{t("statDurationTotal")}</p>
            <p className="mt-1 text-base font-extrabold">{t("minutesCount", { count: totalMinutes })}</p>
          </div>
          <div className="ios-row p-3.5">
            <p className="text-sm font-semibold text-muted">{t("statSaved")}</p>
            <p className="mt-1 text-base font-extrabold">{trip.saved.toLocaleString()}</p>
          </div>
        </div>

        {places.length >= 2 && (
          <div className="mt-4 overflow-hidden rounded-3xl">
            <ConstellationCard places={places} />
          </div>
        )}

        {/* minmax(0, 1fr): a bare grid column sizes to its widest row's no-wrap title (a long
            English place name pushed the cards well past the screen edge). */}
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-3">
          {localizedPlaces.map((place, index) => (
            <article className="ios-row min-w-0 p-3" key={place.id}>
              <div className="flex items-center gap-3">
                {/* Same lime-green chip as the route markers on the map above. */}
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#b7e86b] text-xs font-extrabold text-[#0b1220]">
                  {index + 1}
                </span>
                <PlacePhotoThumb
                  label={place.name}
                  onFallback={() => setPhotoPlaceId(null)}
                  onOpenPhoto={() => setPhotoPlaceId(place.id)}
                  place={place}
                  size="md"
                />
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => setSelectedPlaceId(place.id)}
                  type="button"
                >
                  <h3 className="truncate text-[1.0625rem] font-bold">{place.name}</h3>
                  <p className="mt-0.5 text-sm text-muted">
                    {place.source === "dining"
                      ? placeSubtitle(place, categoryLabel(place.category), locale)
                      : `${place.area} · ${place.duration} · ${place.fee}`}
                  </p>
                </button>
                {/* The author can pick which spot's photo represents the course in lists. */}
                {trip.isMine &&
                  (coverPlaceId === place.id ? (
                    <span className="shrink-0 rounded-full bg-primary-soft px-3 py-1.5 text-xs font-extrabold text-primary-strong">
                      {t("coverBadge")}
                    </span>
                  ) : (
                    <button
                      aria-label={t("setCoverAria")}
                      className="ios-btn grid h-10 w-10 shrink-0 place-items-center rounded-full"
                      onClick={() => onSetCover(trip.id, place.id)}
                      title={t("setCoverAria")}
                      type="button"
                    >
                      <ImageIcon className="h-4 w-4" />
                    </button>
                  ))}
              </div>
            </article>
          ))}
        </div>

        <div className="mt-6">
          <h3 className="text-lg font-extrabold">
            {t("commentsHeading", { count: comments.length })}
          </h3>

          <form className="mt-3 flex items-center gap-2" onSubmit={submitComment}>
            <input
              className="ios-pill min-w-0 flex-1 rounded-full px-5 py-3 text-base outline-none placeholder:text-muted focus:ring-2 focus:ring-primary/40"
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder={t("commentPlaceholder")}
              value={commentDraft}
            />
            <button
              aria-label={t("commentSubmitAria")}
              className="shrink-0 rounded-full bg-primary px-5 py-3 text-[0.9375rem] font-extrabold text-white transition hover:bg-primary-strong active:scale-95 disabled:opacity-50"
              disabled={!commentDraft.trim()}
              type="submit"
            >
              {t("commentSubmit")}
            </button>
          </form>

          {comments.length === 0 ? (
            <p className="mt-3 text-sm leading-5 text-muted">{t("commentEmpty")}</p>
          ) : (
            <div className="mt-3 grid gap-2.5">
              {comments.map((comment) => (
                <div className="ios-row p-4" key={comment.id}>
                  <p className="text-sm font-extrabold">{comment.authorName}</p>
                  <p className="mt-1 text-[0.9375rem] leading-6 text-muted-strong text-pretty">{comment.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Floating round buttons instead of a docked bar. The gradient only fades the page
          content out behind them; the footer itself ignores pointer events. */}
      <footer className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/85 to-transparent px-5 pt-10 [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]">
        {shareMessage && (
          <p
            className="share-toast ios-menu pointer-events-none absolute inset-x-5 bottom-full mb-2 px-4 py-2.5 text-center text-sm font-semibold text-primary"
            key={shareMessage}
          >
            {shareMessage}
          </p>
        )}
        <div className="pointer-events-auto mx-auto flex w-fit items-center gap-3">
          <button
            aria-label={t("loadToChainButton")}
            className={cn(FLOAT_BUTTON, FLOAT_BUTTON_IDLE)}
            onClick={() => onLoadToChain(trip)}
            title={t("loadToChainButton")}
            type="button"
          >
            <MapPlusIcon className="h-[1.375rem] w-[1.375rem]" />
          </button>
          <button
            aria-label={t("likeButton", { count: (trip.likes + (isLiked ? 1 : 0)).toLocaleString() })}
            className={cn(FLOAT_BUTTON, isLiked ? FLOAT_BUTTON_ACTIVE : FLOAT_BUTTON_IDLE)}
            onClick={() => onToggleLike(trip.id)}
            type="button"
          >
            <PopOnActive active={isLiked}>
              <HeartIcon className="h-[1.375rem] w-[1.375rem]" filled={isLiked} />
            </PopOnActive>
          </button>
          <button
            aria-label={isSaved ? t("savedButton") : t("saveButton")}
            className={cn(FLOAT_BUTTON, isSaved ? FLOAT_BUTTON_ACTIVE : FLOAT_BUTTON_IDLE)}
            onClick={() => onToggleSave(trip.id)}
            type="button"
          >
            <PopOnActive active={isSaved}>
              <BookmarkIcon className="h-[1.375rem] w-[1.375rem]" />
            </PopOnActive>
          </button>
          <div className="relative">
            <button
              aria-label={t("shareButton")}
              className={cn(FLOAT_BUTTON, FLOAT_BUTTON_IDLE)}
              onClick={() => setIsShareMenuOpen((open) => !open)}
              type="button"
            >
              <ShareIcon className="h-[1.375rem] w-[1.375rem]" />
            </button>
            {isShareMenuOpen && (
              <>
                <button
                  aria-hidden="true"
                  className="fixed inset-0 z-10 cursor-default"
                  onClick={() => setIsShareMenuOpen(false)}
                  tabIndex={-1}
                />
                <div className="ios-menu absolute bottom-full right-0 z-20 mb-2 flex items-center gap-2 p-2">
                  {/* Instagram has no public share-intent URL (unlike X/Facebook/WhatsApp/
                      Kakao below) — the OS share sheet, triggered by shareTrip(), is the
                      only way this app can reach it (or TikTok), so this badge and the
                      catch-all one at the end both open that same sheet. */}
                  <button
                    aria-label={t("shareOtherButton")}
                    className="grid h-9 w-9 place-items-center rounded-full text-white transition hover:opacity-80"
                    onClick={() => {
                      setIsShareMenuOpen(false);
                      void shareTrip();
                    }}
                    style={{ background: "linear-gradient(45deg, #f9ce34, #ee2a7b 45%, #6228d7)" }}
                    title={t("shareOtherButton")}
                    type="button"
                  >
                    <InstagramIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={t("kakaoShareButton")}
                    className="grid h-9 w-9 place-items-center rounded-full bg-[#FEE500] text-[#391B1B] transition hover:opacity-80"
                    onClick={() => {
                      setIsShareMenuOpen(false);
                      void shareToKakao();
                    }}
                    title={t("kakaoShareButton")}
                    type="button"
                  >
                    <KakaoTalkIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="X"
                    className="grid h-9 w-9 place-items-center rounded-full bg-black text-white transition hover:opacity-80"
                    onClick={() => {
                      setIsShareMenuOpen(false);
                      shareToTwitter();
                    }}
                    title="X"
                    type="button"
                  >
                    <XIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="Facebook"
                    className="grid h-9 w-9 place-items-center rounded-full bg-[#0866FF] text-white transition hover:opacity-80"
                    onClick={() => {
                      setIsShareMenuOpen(false);
                      shareToFacebook();
                    }}
                    title="Facebook"
                    type="button"
                  >
                    <FacebookIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label="WhatsApp"
                    className="grid h-9 w-9 place-items-center rounded-full bg-[#25D366] text-white transition hover:opacity-80"
                    onClick={() => {
                      setIsShareMenuOpen(false);
                      shareToWhatsApp();
                    }}
                    title="WhatsApp"
                    type="button"
                  >
                    <WhatsAppIcon className="h-4 w-4" />
                  </button>
                  <button
                    aria-label={t("saveImageButton")}
                    className="grid h-9 w-9 place-items-center rounded-full border border-border bg-surface text-foreground transition hover:bg-surface-muted"
                    onClick={() => {
                      setIsShareMenuOpen(false);
                      void downloadShareCard();
                    }}
                    title={t("saveImageButton")}
                    type="button"
                  >
                    <DownloadIcon className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </footer>

      {photoPlaceId && (
        <PhotoLightbox
          name={localizedPlaces.find((place) => place.id === photoPlaceId)?.name ?? ""}
          onClose={() => setPhotoPlaceId(null)}
          place={localizedPlaces.find((place) => place.id === photoPlaceId) ?? localizedPlaces[0]}
        />
      )}

      {selectedPlace && (
        <PlaceSheet
          comments={placeComments[selectedPlace.id] ?? []}
          isBookmarked={bookmarkedPlaceIds.has(selectedPlace.id)}
          isInChain={chainIds.includes(selectedPlace.id)}
          onAddComment={(text) => onAddPlaceComment(selectedPlace.id, text)}
          onAddToChain={(place) => {
            onAddPlaceToChain(place);
            setSelectedPlaceId(null);
            setShareMessage(t("addedToChain"));
          }}
          onClose={() => setSelectedPlaceId(null)}
          onToggleBookmark={onToggleBookmarkPlace}
          place={selectedPlace}
        />
      )}
    </div>
  );
}
