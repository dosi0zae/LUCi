"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BookmarkIcon } from "@/components/layout/app-icons";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import {
  areaMeta,
  getPlacesByIds,
  getTotalMinutes,
  type FeedTrip,
  type MobilePlace,
} from "@/features/mobile/mobile-data";

type TripDetailSheetProps = {
  trip: FeedTrip;
  isLiked: boolean;
  isSaved: boolean;
  onClose: () => void;
  onOpenAuthor: (handle: string) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

const visibilityLabel: Record<FeedTrip["visibility"], string> = {
  public: "전체 공개",
  link: "링크 공유",
  private: "비공개",
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

function getCardPoints(places: MobilePlace[]) {
  const lats = places.map((place) => place.lat);
  const lngs = places.map((place) => place.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;

  return places.map((place, index) => ({
    label: String(index + 1),
    x: CARD_PADDING + ((place.lng - minLng) / lngRange) * (CARD_SIZE - CARD_PADDING * 2),
    y: CARD_ROUTE_TOP + CARD_ROUTE_HEIGHT - ((place.lat - minLat) / latRange) * CARD_ROUTE_HEIGHT,
  }));
}

export function TripDetailSheet({
  isLiked,
  isSaved,
  onClose,
  onOpenAuthor,
  onToggleLike,
  onToggleSave,
  trip,
}: TripDetailSheetProps) {
  const [shareMessage, setShareMessage] = useState("");
  const places = getPlacesByIds(trip.placeIds);
  const totalMinutes = getTotalMinutes(places);

  async function shareTrip() {
    const shareText = `${trip.title} · ${places.length}개 장소 · ${totalMinutes}분 코스`;
    const shareUrl = `https://tripchain.app/trip/${trip.id}`;

    if (navigator.share) {
      try {
        await navigator.share({ title: trip.title, text: shareText, url: shareUrl });
        setShareMessage("공유했어요.");
      } catch {
        // Share sheet was dismissed by the user — nothing to report.
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareMessage("공유 링크를 복사했어요.");
    } catch {
      setShareMessage("공유 링크 복사에 실패했어요.");
    }
  }

  function downloadShareCard() {
    if (places.length < 2) {
      setShareMessage("이미지를 만들려면 장소가 2곳 이상 필요해요.");
      return;
    }

    const points = getCardPoints(places);
    const pathPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
    const title = escapeXml(trip.title);
    const meta = escapeXml(`${areaMeta[trip.areaId].name} · ${trip.authorName}`);
    const summary = escapeXml(`${places.length}개 장소 · ${totalMinutes}분`);
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

    function fail() {
      setShareMessage("이미지 저장을 준비하지 못했어요. 다시 시도해 주세요.");
    }

    Promise.all([
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
    ])
      .then(() => {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = CARD_SIZE;
        canvas.height = CARD_SIZE;

        if (!context) {
          fail();
          return;
        }

        context.drawImage(cardImage, 0, 0);
        context.globalAlpha = 0.7;
        context.drawImage(logoImage, 890, 925, 100, 70);
        context.globalAlpha = 1;

        const link = document.createElement("a");
        link.download = `${trip.title.replace(/[\\/:*?"<>|]/g, "-")}-tripchain.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        setShareMessage("코스 카드 이미지를 저장했어요.");
      })
      .catch(fail);
  }

  return (
    <div className="detail-page absolute inset-0 z-40 flex flex-col bg-background">
      <header className="flex items-center justify-between border-b border-border px-5 py-4">
        <button
          className="text-sm font-bold text-muted-strong"
          onClick={onClose}
          type="button"
        >
          ← 뒤로
        </button>
        {trip.isMine && <Badge tone="blue">내 코스</Badge>}
      </header>

      <div className="min-w-0 flex-1 overflow-y-auto px-5 py-4">
        <Badge tone="neutral">{areaMeta[trip.areaId].name}</Badge>
        <h1 className="mt-3 text-2xl font-extrabold leading-tight">{trip.title}</h1>
        <p className="mt-1 text-xs font-semibold text-muted">
          <button
            className="font-bold text-foreground hover:underline"
            onClick={() => onOpenAuthor(trip.authorHandle)}
            type="button"
          >
            {trip.authorName}
          </button>{" "}
          · {visibilityLabel[trip.visibility]}
        </p>
        {trip.description && (
          <p className="mt-3 text-sm leading-6 text-muted-strong">{trip.description}</p>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">장소</p>
            <p className="mt-1 text-sm font-extrabold">{places.length}곳</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">예상 시간</p>
            <p className="mt-1 text-sm font-extrabold">{totalMinutes}분</p>
          </div>
          <div className="rounded-sm border border-border bg-surface p-3">
            <p className="text-xs font-semibold text-muted">저장</p>
            <p className="mt-1 text-sm font-extrabold">{trip.saved.toLocaleString()}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-2">
          {places.map((place, index) => (
            <article className="rounded-lg border border-border bg-surface p-3 shadow-soft" key={place.id}>
              <div className="flex items-center gap-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-extrabold text-white">
                  {index + 1}
                </span>
                <PlaceThumb category={place.category} size="sm" />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-extrabold">{place.name}</h3>
                  <p className="mt-1 text-xs text-muted">
                    {place.area} · {place.duration} · {place.price}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <footer className="border-t border-border px-5 py-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            onClick={() => onToggleLike(trip.id)}
            variant={isLiked ? "primary" : "secondary"}
          >
            ♥ 좋아요 {(trip.likes + (isLiked ? 1 : 0)).toLocaleString()}
          </Button>
          <Button
            onClick={() => onToggleSave(trip.id)}
            variant={isSaved ? "primary" : "secondary"}
          >
            <BookmarkIcon className="h-4 w-4" />
            {isSaved ? "저장됨" : "저장하기"}
          </Button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button onClick={() => void shareTrip()} size="sm" variant="secondary">
            공유하기
          </Button>
          <Button onClick={downloadShareCard} size="sm" variant="secondary">
            이미지로 저장
          </Button>
        </div>
        {shareMessage && (
          <p className="mt-2 text-center text-xs font-semibold text-muted-strong">{shareMessage}</p>
        )}
      </footer>
    </div>
  );
}
