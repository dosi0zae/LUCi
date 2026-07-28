"use client";

import { useEffect, useRef, useState } from "react";
import {
  loadKakaoMaps,
  type KakaoCustomOverlay,
  type KakaoMap,
  type KakaoMapsApi,
} from "@/features/mobile/kakao-loader";
import { categoryTone, type MobilePlace } from "@/features/mobile/mobile-data";

type ExploreMapProps = {
  places: MobilePlace[];
  center: { lat: number; lng: number };
  level?: number;
  selectedPlaceId?: string | null;
  onSelectPlace: (place: MobilePlace) => void;
};

function createMarkerElement(place: MobilePlace, isSelected: boolean) {
  const marker = document.createElement("button");
  const tone = categoryTone[place.category];

  marker.type = "button";
  marker.setAttribute("aria-label", `${place.name} 마커`);
  marker.style.width = isSelected ? "18px" : "14px";
  marker.style.height = isSelected ? "18px" : "14px";
  marker.style.borderRadius = "999px";
  marker.style.background = tone;
  marker.style.border = "2px solid white";
  marker.style.boxShadow = "0 4px 12px rgba(15, 23, 42, 0.3)";
  marker.style.cursor = "pointer";
  marker.style.transform = "translate(-1px, -1px)";

  return marker;
}

export function ExploreMap({ center, level = 5, onSelectPlace, places, selectedPlaceId }: ExploreMapProps) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const mapsRef = useRef<KakaoMapsApi | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const [status, setStatus] = useState<"idle" | "ready" | "error" | "missing-key">(
    appKey ? "idle" : "missing-key",
  );

  useEffect(() => {
    if (!appKey || !containerRef.current) {
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
          center: new maps.LatLng(center.lat, center.lng),
          level,
          scrollwheel: true,
        });
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
    if (!mapRef.current || !mapsRef.current) {
      return;
    }

    mapRef.current.setCenter(new mapsRef.current.LatLng(center.lat, center.lng));
    mapRef.current.setLevel(level);
  }, [center, level]);

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;

    if (!maps || !map || status !== "ready") {
      return;
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = places.map((place) => {
      const element = createMarkerElement(place, place.id === selectedPlaceId);
      element.addEventListener("click", () => onSelectPlace(place));

      const overlay = new maps.CustomOverlay({
        clickable: true,
        content: element,
        position: new maps.LatLng(place.lat, place.lng),
        yAnchor: 0.5,
        zIndex: place.id === selectedPlaceId ? 10 : 1,
      });

      overlay.setMap(map);
      return overlay;
    });

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, selectedPlaceId, status]);

  if (status === "missing-key") {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-dashed border-border bg-surface-muted p-6 text-center">
        <p className="text-xs text-muted">
          지도를 사용하려면 카카오 지도 API 키(NEXT_PUBLIC_KAKAO_MAP_APP_KEY)가 필요해요.
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="grid h-full place-items-center rounded-lg border border-dashed border-border bg-surface-muted p-6 text-center">
        <p className="text-xs text-muted">지도를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>
      </div>
    );
  }

  return <div className="h-full w-full rounded-lg" ref={containerRef} />;
}
