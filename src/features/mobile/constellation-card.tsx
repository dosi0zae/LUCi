"use client";

import { useEffect, useRef, useState } from "react";
import { LocateIcon, SparklesIcon } from "@/components/layout/app-icons";
import {
  loadKakaoMaps,
  type KakaoCustomOverlay,
  type KakaoMap,
  type KakaoMapsApi,
  type KakaoPolyline,
} from "@/features/mobile/kakao-loader";
import { haversineKm, type MobilePlace } from "@/features/mobile/mobile-data";
import { useT } from "@/features/mobile/i18n/i18n-context";

// Stops within this real-world distance of an earlier stop visually overlap at the
// zoom level setBounds() auto-picks for a walking-scale course (their 24px marker
// chips are wider than the gap between them on screen).
const MARKER_CLUSTER_RADIUS_KM = 0.02;
// How far (in km) to fan a clustered marker's chip out from its true position so its
// number stays legible — small enough that it still reads as "here", not elsewhere.
const MARKER_SPREAD_KM = 0.012;

// When two or more stops sit within a few meters of each other (e.g. adjacent
// buildings around the same plaza), their numbered map markers can fully overlap and
// hide each other's number. This nudges any marker that's this close to an earlier
// stop outward in a small fan (golden-angle spacing so 3+ clustered markers don't
// line up on top of each other either) — only the marker chip's position moves; the
// route line and map bounds below still use each stop's real coordinates.
function spreadOverlappingMarkers(places: MobilePlace[]): { lat: number; lng: number }[] {
  return places.map((place, index) => {
    const priorNearbyCount = places
      .slice(0, index)
      .filter((other) => haversineKm(other, place) < MARKER_CLUSTER_RADIUS_KM).length;

    if (priorNearbyCount === 0) {
      return { lat: place.lat, lng: place.lng };
    }

    const angle = (priorNearbyCount * 137.5 * Math.PI) / 180;
    const latOffset = (MARKER_SPREAD_KM / 111) * Math.sin(angle);
    const lngOffset = (MARKER_SPREAD_KM / (111 * Math.cos((place.lat * Math.PI) / 180))) * Math.cos(angle);
    return { lat: place.lat + latOffset, lng: place.lng + lngOffset };
  });
}

type ConstellationCardProps = {
  places: MobilePlace[];
  // Places shown as lettered "could add here" markers alongside the numbered route
  // (e.g. the options listed under an expanded chain card). They're not part of the
  // route line; the map just widens to include them while they're present.
  suggestions?: MobilePlace[];
};

const SUGGESTION_LABELS = ["A", "B", "C", "D", "E"];

function createSuggestionMarker(label: string) {
  const marker = document.createElement("div");
  marker.textContent = label;
  marker.style.display = "grid";
  marker.style.placeItems = "center";
  marker.style.width = "22px";
  marker.style.height = "22px";
  marker.style.borderRadius = "999px";
  marker.style.background = "white";
  marker.style.color = "#4f8df7";
  marker.style.fontWeight = "900";
  marker.style.fontSize = "11px";
  marker.style.border = "2px solid #4f8df7";
  marker.style.boxShadow = "0 3px 10px rgba(11, 18, 32, 0.35)";

  return marker;
}

const WIDTH = 400;
const HEIGHT = 240;
const PADDING = 30;

// Projects lat/lng onto the card with a single uniform scale (not one scale per axis),
// so the path's shape and angles match the real map instead of being stretched to fill
// the box. Longitude degrees are corrected by cos(latitude) since they cover less
// ground distance than latitude degrees away from the equator.
function getPoints(places: MobilePlace[]) {
  const lats = places.map((place) => place.lat);
  const lngs = places.map((place) => place.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const lngCorrection = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));

  const latRange = maxLat - minLat || 0.0005;
  const lngRange = (maxLng - minLng) * lngCorrection || 0.0005;

  const availableWidth = WIDTH - PADDING * 2;
  const availableHeight = HEIGHT - PADDING * 2;
  const scale = Math.min(availableWidth / lngRange, availableHeight / latRange);

  const contentWidth = lngRange * scale;
  const contentHeight = latRange * scale;
  const offsetX = PADDING + (availableWidth - contentWidth) / 2;
  const offsetY = PADDING + (availableHeight - contentHeight) / 2;

  return places.map((place) => ({
    id: place.id,
    x: offsetX + (place.lng - minLng) * lngCorrection * scale,
    y: offsetY + contentHeight - (place.lat - minLat) * scale,
  }));
}

// Kakao renders a distance scale bar next to its (required) attribution logo, both inside
// the same wrapper. Hide just the scale bar and leave the logo/link untouched.
function hideScaleBar(container: HTMLElement) {
  const wrapper = Array.from(container.children).find((child) =>
    child.querySelector('a[href*="map.kakao.com"]'),
  );
  const scalePart = wrapper?.firstElementChild as HTMLElement | null | undefined;

  if (scalePart) {
    scalePart.style.display = "none";
  }
}

function createStopMarker(label: string) {
  const marker = document.createElement("div");
  marker.textContent = label;
  marker.style.display = "grid";
  marker.style.placeItems = "center";
  marker.style.width = "24px";
  marker.style.height = "24px";
  marker.style.borderRadius = "999px";
  marker.style.background = "#b7e86b";
  marker.style.color = "#0b1220";
  marker.style.fontWeight = "900";
  marker.style.fontSize = "12px";
  marker.style.border = "2px solid white";
  marker.style.boxShadow = "0 3px 10px rgba(11, 18, 32, 0.4)";

  return marker;
}

function AbstractConstellation({ places }: { places: MobilePlace[] }) {
  const t = useT();
  const points = getPoints(places);
  const pathPoints = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="relative h-full w-full" style={{ background: "#0b1220" }}>
      <div className="hero-blobs" aria-hidden="true">
        <span
          className="hero-blob hero-blob--a"
          style={{ background: "var(--primary)", height: 150, left: -30, opacity: 0.55, top: -30, width: 150 }}
        />
        <span
          className="hero-blob hero-blob--b"
          style={{ background: "var(--success)", height: 140, opacity: 0.45, right: -20, top: 10, width: 140 }}
        />
        <span
          className="hero-blob hero-blob--c"
          style={{ background: "var(--warning)", bottom: -40, height: 120, left: "38%", opacity: 0.3, width: 120 }}
        />
        <span
          className="hero-blob hero-blob--d"
          style={{
            background: "var(--primary-strong)",
            bottom: -30,
            height: 130,
            opacity: 0.3,
            right: "8%",
            width: 130,
          }}
        />
      </div>
      <svg
        aria-label={t("constellationPreviewAria")}
        className="absolute inset-0 block h-full w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        <defs>
          <pattern height="26" id="cc-stars" patternUnits="userSpaceOnUse" width="26">
            <circle cx="4" cy="4" fill="rgba(255,255,255,0.32)" r="1.1" />
          </pattern>
          <filter height="260%" id="cc-glow" width="260%" x="-80%" y="-80%">
            <feGaussianBlur result="blur" stdDeviation="3.5" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <rect fill="url(#cc-stars)" height={HEIGHT} opacity={0.8} width={WIDTH} />
        <polyline
          fill="none"
          filter="url(#cc-glow)"
          opacity={0.9}
          points={pathPoints}
          stroke="#b7e86b"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={3}
        />
        {points.map((point) => (
          <g key={point.id}>
            <circle cx={point.x} cy={point.y} fill="#b7e86b" opacity={0.2} r={13} />
            <circle cx={point.x} cy={point.y} fill="#b7e86b" r={7.5} />
          </g>
        ))}
      </svg>
    </div>
  );
}

// A shared empty array, not a fresh `[]` default per render — `suggestions` is an effect
// dependency, and a new array each render would rebuild the map overlays (and re-fit the
// view, undoing any pan/zoom) on every parent re-render.
const NO_SUGGESTIONS: MobilePlace[] = [];

export function ConstellationCard({ places, suggestions = NO_SUGGESTIONS }: ConstellationCardProps) {
  const t = useT();
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const mapsRef = useRef<KakaoMapsApi | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const polylineRef = useRef<KakaoPolyline | null>(null);
  const [status, setStatus] = useState<"idle" | "ready" | "error">(appKey ? "idle" : "error");
  const [viewMode, setViewMode] = useState<"map" | "abstract">("map");

  useEffect(() => {
    if (!appKey || !containerRef.current || places.length < 2) {
      return;
    }

    let cancelled = false;

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) {
          return;
        }

        mapsRef.current = maps;
        mapRef.current = new maps.Map(containerRef.current, {
          center: new maps.LatLng(places[0].lat, places[0].lng),
          draggable: true,
          level: 6,
          scrollwheel: true,
        });
        mapRef.current.setZoomable(true);
        hideScaleBar(containerRef.current);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;

    if (!maps || !map || status !== "ready" || places.length < 2) {
      return;
    }

    const bounds = new maps.LatLngBounds();
    places.forEach((place) => bounds.extend(new maps.LatLng(place.lat, place.lng)));
    suggestions.forEach((place) => bounds.extend(new maps.LatLng(place.lat, place.lng)));
    map.setBounds(bounds, 32);

    polylineRef.current?.setMap(null);
    polylineRef.current = new maps.Polyline({
      path: places.map((place) => new maps.LatLng(place.lat, place.lng)),
      strokeColor: "#b7e86b",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      strokeWeight: 5,
    });
    polylineRef.current.setMap(map);

    const markerPositions = spreadOverlappingMarkers(places);

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = places.map((place, index) => {
      const markerPosition = markerPositions[index];
      const overlay = new maps.CustomOverlay({
        content: createStopMarker(String(index + 1)),
        position: new maps.LatLng(markerPosition.lat, markerPosition.lng),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 10,
      });
      overlay.setMap(map);
      return overlay;
    });

    suggestions.forEach((place, index) => {
      const overlay = new maps.CustomOverlay({
        content: createSuggestionMarker(SUGGESTION_LABELS[index] ?? "+"),
        position: new maps.LatLng(place.lat, place.lng),
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 9,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    return () => {
      polylineRef.current?.setMap(null);
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    };
  }, [places, suggestions, status]);

  function zoomBy(delta: number) {
    const map = mapRef.current;
    if (!map) {
      return;
    }
    const next = Math.min(14, Math.max(1, map.getLevel() + delta));
    map.setLevel(next);
  }

  function resetView() {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map) {
      return;
    }
    const bounds = new maps.LatLngBounds();
    places.forEach((place) => bounds.extend(new maps.LatLng(place.lat, place.lng)));
    map.setBounds(bounds, 32);
  }

  if (places.length < 2) {
    return null;
  }

  if (!appKey) {
    return (
      <div
        className="overflow-hidden rounded-lg"
        style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, background: "#0b1220" }}
      >
        <AbstractConstellation places={places} />
      </div>
    );
  }

  const showAbstract = status !== "ready" || viewMode === "abstract";

  return (
    <div
      className="relative overflow-hidden rounded-lg [perspective:1200px]"
      style={{ aspectRatio: `${WIDTH} / ${HEIGHT}`, background: "#0b1220" }}
    >
      <div
        className="absolute inset-0 transition-transform duration-500 ease-in-out [transform-style:preserve-3d]"
        style={{ transform: showAbstract ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <div className="absolute inset-0 z-0 [backface-visibility:hidden]" ref={containerRef} />
        <div className="absolute inset-0 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <AbstractConstellation places={places} />
        </div>
      </div>
      {status === "ready" && viewMode === "map" && (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(11,18,32,0.28) 0%, rgba(11,18,32,0) 30%, rgba(11,18,32,0) 70%, rgba(11,18,32,0.32) 100%)",
            }}
          />
          <div className="absolute right-2 top-2 z-10 flex flex-col overflow-hidden rounded-lg border border-white/30 bg-white/90 opacity-50 shadow-soft backdrop-blur-sm transition hover:opacity-100">
            <button
              aria-label={t("zoomInAria")}
              className="grid h-8 w-8 place-items-center text-sm font-extrabold text-foreground transition hover:bg-surface-muted"
              onClick={() => zoomBy(-1)}
              type="button"
            >
              +
            </button>
            <div className="h-px bg-border" />
            <button
              aria-label={t("zoomOutAria")}
              className="grid h-8 w-8 place-items-center text-sm font-extrabold text-foreground transition hover:bg-surface-muted"
              onClick={() => zoomBy(1)}
              type="button"
            >
              −
            </button>
            <div className="h-px bg-border" />
            <button
              aria-label={t("resetViewAria")}
              className="grid h-8 w-8 place-items-center text-foreground transition hover:bg-surface-muted"
              onClick={resetView}
              type="button"
            >
              <LocateIcon className="h-3.5 w-3.5" />
            </button>
          </div>
        </>
      )}
      {status === "ready" && (
        <button
          aria-label={viewMode === "map" ? t("viewAsConstellationAria") : t("viewAsMapAria")}
          className="absolute bottom-2 right-2 z-10 grid h-8 w-8 place-items-center rounded-full border border-white/30 bg-white/90 text-foreground shadow-soft backdrop-blur-sm transition hover:bg-surface-muted"
          onClick={() => setViewMode((mode) => (mode === "map" ? "abstract" : "map"))}
          type="button"
        >
          {viewMode === "map" ? (
            <SparklesIcon className="h-4 w-4" />
          ) : (
            <LocateIcon className="h-4 w-4" />
          )}
        </button>
      )}
    </div>
  );
}
