"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TripDraft } from "./trip-draft";

type TripDetailPreviewProps = {
  draft: TripDraft;
  onClose: () => void;
};

type ConstellationPoint = {
  id: string;
  label: string;
  x: number;
  y: number;
};

type ShareTarget = {
  brandColor: string;
  label: string;
  value: "instagram" | "x" | "threads" | "link";
};

const visibilityLabel = {
  public: "공개",
  link: "링크 공개",
  private: "비공개",
} as const;

const shareTargets: ShareTarget[] = [
  { brandColor: "#e4405f", label: "Instagram", value: "instagram" },
  { brandColor: "#000000", label: "X", value: "x" },
  { brandColor: "#000000", label: "Threads", value: "threads" },
  { brandColor: "#4f8df7", label: "Link", value: "link" },
];

function getConstellationPoints(draft: TripDraft): ConstellationPoint[] {
  const latValues = draft.places.map((place) => place.lat);
  const lngValues = draft.places.map((place) => place.lng);
  const minLat = Math.min(...latValues);
  const maxLat = Math.max(...latValues);
  const minLng = Math.min(...lngValues);
  const maxLng = Math.max(...lngValues);
  const latRange = maxLat - minLat || 1;
  const lngRange = maxLng - minLng || 1;

  return draft.places.map((place, index) => ({
    id: place.id,
    label: String(index + 1),
    x: 14 + ((place.lng - minLng) / lngRange) * 72,
    y: 86 - ((place.lat - minLat) / latRange) * 72,
  }));
}

function getShareText(draft: TripDraft) {
  return `${draft.title} · ${draft.places.length}개 장소 · ${draft.totalMinutes}분 코스`;
}

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function BrandIcon({ target }: { target: ShareTarget["value"] }) {
  if (target === "instagram") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <rect height="16" rx="5" stroke="currentColor" strokeWidth="2" width="16" x="4" y="4" />
        <circle cx="12" cy="12" r="3.4" stroke="currentColor" strokeWidth="2" />
        <circle cx="17" cy="7" fill="currentColor" r="1.1" />
      </svg>
    );
  }

  if (target === "x") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M13.8 10.5 21 2h-2.1l-6 7.1L8.1 2H2l7.6 11.1L2 22h2.1l6.4-7.5 5.1 7.5H22l-8.2-11.5Zm-2.3 2.7-.7-1.1L4.6 3.6h2.5l4.7 6.6.7 1.1 6.5 9.1h-2.5l-5-7.2Z" />
      </svg>
    );
  }

  if (target === "threads") {
    return (
      <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
        <path
          d="M17.4 10.7c-.4-3.2-2.2-5-5.1-5-3.5 0-5.9 2.5-5.9 6.4 0 4 2.5 6.5 6.2 6.5 2.8 0 4.8-1.5 4.8-3.8 0-2.1-1.7-3.4-4.2-3.4h-1.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
        <path
          d="M15.8 12.3c.9.5 1.7 1.4 1.7 2.6 0 2.7-2.2 4.7-5.3 4.7-4 0-6.8-3-6.8-7.6s2.7-7.6 6.8-7.6c3.7 0 6.1 2.2 6.8 6.2"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="2"
        />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path
        d="M10 13a5 5 0 0 0 7.1 0l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path
        d="M14 11a5 5 0 0 0-7.1 0l-2 2A5 5 0 0 0 12 20.1l1.1-1.1"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function TripDetailPreview({ draft, onClose }: TripDetailPreviewProps) {
  const [shareMessage, setShareMessage] = useState("공유 카드가 준비되었습니다.");
  const constellationPoints = useMemo(() => getConstellationPoints(draft), [draft]);
  const constellationPath = constellationPoints.map((point) => `${point.x},${point.y}`).join(" ");
  const mockShareUrl = `https://luci-tripchain.vercel.app/trip/${draft.id}`;

  function shareCourse(target: ShareTarget["value"]) {
    const message = getShareText(draft);

    if (target === "x") {
      window.open(
        `https://twitter.com/intent/tweet?text=${encodeURIComponent(message)}&url=${encodeURIComponent(
          mockShareUrl,
        )}`,
        "_blank",
        "noopener,noreferrer",
      );
      setShareMessage("X 공유창을 열었습니다.");
      return;
    }

    if (target === "link") {
      navigator.clipboard?.writeText(mockShareUrl).catch(() => undefined);
      setShareMessage("공유 링크를 복사했습니다.");
      return;
    }

    setShareMessage(
      target === "instagram"
        ? "인스타그램 스토리용 카드 목업이 준비되었습니다."
        : "Threads 게시물용 카드 목업이 준비되었습니다.",
    );
  }

  function downloadConstellationCard() {
    const width = 1080;
    const height = 1350;
    const points = constellationPoints.map((point) => ({
      ...point,
      x: 160 + point.x * 7.6,
      y: 360 + point.y * 5.8,
    }));
    const pathPoints = points.map((point) => `${point.x},${point.y}`).join(" ");
    const title = escapeXml(draft.title);
    const subtitle = escapeXml(`${draft.places.length}개 장소 코스`);
    const meta = escapeXml(`${draft.totalMinutes}분 · Seoul`);
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <defs>
          <radialGradient id="blue" cx="30%" cy="18%" r="60%">
            <stop offset="0%" stop-color="#4f8df7" stop-opacity="0.72"/>
            <stop offset="62%" stop-color="#15213a" stop-opacity="0"/>
          </radialGradient>
          <radialGradient id="lime" cx="78%" cy="72%" r="52%">
            <stop offset="0%" stop-color="#b7e86b" stop-opacity="0.5"/>
            <stop offset="64%" stop-color="#0b1220" stop-opacity="0"/>
          </radialGradient>
          <pattern id="stars" width="44" height="44" patternUnits="userSpaceOnUse">
            <circle cx="7" cy="7" r="2" fill="rgba(255,255,255,0.34)"/>
          </pattern>
          <filter id="glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="16" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        <rect width="1080" height="1350" rx="64" fill="#0b1220"/>
        <rect width="1080" height="1350" rx="64" fill="url(#blue)"/>
        <rect width="1080" height="1350" rx="64" fill="url(#lime)"/>
        <rect width="1080" height="1350" rx="64" fill="url(#stars)" opacity="0.85"/>
        <text x="90" y="120" fill="rgba(255,255,255,0.35)" font-family="Arial, sans-serif" font-size="24" font-weight="800" letter-spacing="8">TRIP CHAIN</text>
        <text x="90" y="215" fill="#ffffff" font-family="Arial, sans-serif" font-size="58" font-weight="900">${title}</text>
        <polyline points="${pathPoints}" fill="none" stroke="#b7e86b" stroke-width="16" stroke-linecap="round" stroke-linejoin="round" opacity="0.9" filter="url(#glow)"/>
        ${points
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="46" fill="#b7e86b" opacity="0.18"/>
              <circle cx="${point.x}" cy="${point.y}" r="24" fill="#b7e86b"/>
              <text x="${point.x}" y="${point.y + 10}" text-anchor="middle" fill="#0b1220" font-family="Arial, sans-serif" font-size="27" font-weight="900">${point.label}</text>
            `,
          )
          .join("")}
        <rect x="70" y="1090" width="940" height="180" rx="28" fill="rgba(255,255,255,0.12)" stroke="rgba(255,255,255,0.22)"/>
        <text x="110" y="1165" fill="#ffffff" font-family="Arial, sans-serif" font-size="36" font-weight="900">${subtitle}</text>
        <text x="110" y="1218" fill="rgba(255,255,255,0.74)" font-family="Arial, sans-serif" font-size="28" font-weight="700">${meta}</text>
        <text x="820" y="1205" fill="rgba(255,255,255,0.48)" font-family="Arial, sans-serif" font-size="32" font-weight="900" text-anchor="middle">TripChain</text>
      </svg>`;
    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = width;
      canvas.height = height;

      if (!context) {
        setShareMessage("이미지 저장을 준비하지 못했어요. 다시 시도해 주세요.");
        return;
      }

      context.drawImage(image, 0, 0);

      const link = document.createElement("a");
      link.download = `${draft.title.replace(/[\\/:*?"<>|]/g, "-")}-tripchain.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
      setShareMessage("별자리 카드 이미지를 저장했어요.");
    };

    image.onerror = () => setShareMessage("이미지 저장을 준비하지 못했어요. 다시 시도해 주세요.");
    image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  return (
    <div className="absolute inset-0 z-50 overflow-auto bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-primary">Trip Chain Detail Preview</p>
            <h1 className="truncate text-lg font-bold">{draft.title}</h1>
          </div>
          <Button onClick={onClose} size="sm" variant="secondary">
            지도로 돌아가기
          </Button>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-4 py-6 lg:grid-cols-[1fr_320px]">
        <section>
          <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
            <div className="rounded-lg border border-border bg-surface p-5 shadow-soft">
              <div className="flex flex-wrap gap-2">
                <Badge tone="blue">{visibilityLabel[draft.visibility]}</Badge>
                <Badge tone="green">{draft.places.length}개 장소</Badge>
                <Badge tone="neutral">{draft.totalMinutes}분 코스</Badge>
              </div>

              <h2 className="mt-5 text-3xl font-bold leading-tight">{draft.title}</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted-strong">{draft.description}</p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                {[
                  ["장소", `${draft.places.length}곳`],
                  ["예상 체류", `${draft.totalMinutes}분`],
                  ["상태", "프리뷰"],
                ].map(([label, value]) => (
                  <div className="rounded-sm border border-border bg-surface/78 p-4" key={label}>
                    <p className="text-xs font-semibold text-muted">{label}</p>
                    <p className="mt-1 text-lg font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </div>

            <article className="overflow-hidden rounded-lg border border-primary/20 bg-[#0b1220] text-white shadow-panel">
              <div className="relative aspect-[4/5] p-5">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(79,141,247,0.5),transparent_32%),radial-gradient(circle_at_80%_70%,rgba(183,232,107,0.34),transparent_28%)]" />
                <div className="absolute inset-0 opacity-35 [background-image:radial-gradient(circle,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:22px_22px]" />

                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary-soft">Trip Chain</p>
                    <h3 className="mt-2 line-clamp-2 text-2xl font-black leading-tight">{draft.title}</h3>
                  </div>

                  <svg className="my-5 h-48 w-full overflow-visible" viewBox="0 0 100 100" role="img">
                    <polyline
                      fill="none"
                      points={constellationPath}
                      stroke="#b7e86b"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeOpacity="0.88"
                      strokeWidth="2.5"
                    />
                    {constellationPoints.map((point) => (
                      <g key={point.id}>
                        <circle cx={point.x} cy={point.y} fill="rgba(183,232,107,0.2)" r="7" />
                        <circle cx={point.x} cy={point.y} fill="#b7e86b" r="3.2" />
                        <text
                          fill="#0b1220"
                          fontSize="4"
                          fontWeight="800"
                          textAnchor="middle"
                          x={point.x}
                          y={point.y + 1.4}
                        >
                          {point.label}
                        </text>
                      </g>
                    ))}
                  </svg>

                  <div className="mx-3 mb-3 flex items-center justify-between gap-3 rounded-sm border border-white/14 bg-white/10 p-3 backdrop-blur-xl">
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{draft.places.length}개 장소 코스</p>
                      <p className="mt-1 text-xs text-white/72">{draft.totalMinutes}분 · Seoul</p>
                    </div>
                    <div
                      aria-hidden="true"
                      className="h-14 w-20 shrink-0 bg-contain bg-center bg-no-repeat opacity-55 brightness-0 invert"
                      style={{ backgroundImage: "url('/tripchain-logo.svg')" }}
                    />
                  </div>
                </div>
              </div>
            </article>
          </div>

          <ol className="mt-5 grid gap-3">
            {draft.places.map((place, index) => (
              <li className="rounded-lg border border-border bg-surface p-4 shadow-soft" key={place.id}>
                <div className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-sm bg-primary text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold">{place.name}</h3>
                      <Badge tone="neutral">{place.category}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">{place.address}</p>
                    <p className="mt-3 text-sm leading-6 text-muted-strong">{place.description}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold text-muted">
                      <span>{place.duration}</span>
                      <span>{place.distance}</span>
                      <span>{place.price}</span>
                      <span>{place.hours}</span>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="grid h-fit gap-4">
          <section className="rounded-lg border border-border bg-surface p-4 shadow-soft">
            <h2 className="text-lg font-bold">코스 요약</h2>
            <div className="mt-4 grid gap-3">
              {draft.places.map((place, index) => (
                <div className="flex items-center gap-3" key={place.id}>
                  <span className="grid h-7 w-7 place-items-center rounded-xs bg-primary-soft text-xs font-bold text-primary-strong">
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{place.name}</p>
                    <p className="truncate text-xs text-muted">{place.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-border bg-surface p-4 shadow-soft">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-primary">Share Mockup</p>
                <h2 className="mt-1 text-lg font-bold">SNS 공유하기</h2>
              </div>
              <Badge tone="green">별자리 카드</Badge>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              {shareTargets.map((target) => (
                <button
                  className="flex items-center gap-2 rounded-sm border border-border bg-surface/78 p-3 text-left transition hover:border-primary hover:bg-primary-soft"
                  key={target.value}
                  onClick={() => shareCourse(target.value)}
                  type="button"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white shadow-soft"
                    style={{ color: target.brandColor }}
                  >
                    <BrandIcon target={target.value} />
                  </span>
                  <span className="min-w-0 truncate text-sm font-bold">{target.label}</span>
                </button>
              ))}
            </div>

            <Button className="mt-3 w-full" onClick={downloadConstellationCard} size="sm">
              별자리 이미지 저장
            </Button>

            <div className="mt-4 rounded-sm border border-border bg-surface/78 p-3">
              <p className="text-xs font-semibold text-muted">공유 문구</p>
              <p className="mt-2 text-sm font-bold leading-6">{getShareText(draft)}</p>
            </div>

            <p className="mt-3 rounded-sm bg-primary-soft p-3 text-xs font-bold leading-5 text-primary-strong">
              {shareMessage}
            </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
