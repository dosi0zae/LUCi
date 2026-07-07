"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompassIcon } from "@/components/layout/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommunityHub } from "./community-hub";
import { MapPlace, PlaceCategory, PlaceDetailCard } from "./place-detail-card";
import { TripDetailPreview } from "./trip-detail-preview";
import { TripDraft } from "./trip-draft";
import { TripChainBuilder } from "./trip-chain-builder";
import { TripPublishPanel } from "./trip-publish-panel";

type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

type KakaoMap = {
  getLevel(): number;
  relayout(): void;
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
};

type KakaoCustomOverlay = {
  setMap(map: KakaoMap | null): void;
};

type KakaoPolyline = {
  setMap(map: KakaoMap | null): void;
};

type KakaoMapsApi = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: {
      center: KakaoLatLng;
      draggable?: boolean;
      level: number;
      scrollwheel?: boolean;
    },
  ) => KakaoMap;
  CustomOverlay: new (options: {
    clickable?: boolean;
    content: HTMLElement | string;
    position: KakaoLatLng;
    xAnchor?: number;
    yAnchor?: number;
  }) => KakaoCustomOverlay;
  Polyline: new (options: {
    endArrow?: boolean;
    path: KakaoLatLng[];
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    strokeWeight?: number;
  }) => KakaoPolyline;
  load(callback: () => void): void;
};

declare global {
  interface Window {
    kakao?: {
      maps: KakaoMapsApi;
    };
  }
}

const DEFAULT_CENTER = {
  lat: 37.5446,
  lng: 127.0557,
};
const DEFAULT_LEVEL = 4;
const mapModes = ["추천", "도보", "저장"] as const;
const categories: Array<PlaceCategory | "전체"> = ["전체", "전시", "카페", "팝업", "산책"];
const places: MapPlace[] = [
  {
    id: "seongsu-gallery",
    name: "성수 전시관",
    category: "전시",
    lat: 37.5449,
    lng: 127.0548,
    address: "서울 성동구 연무장길 24",
    description: "성수 골목 안쪽에 있는 소규모 전시 공간입니다. 짧게 들러도 감상이 밀도 있게 이어집니다.",
    distance: "320m",
    duration: "45분",
    price: "무료",
    tags: ["전시", "실내", "사진"],
    hours: "오늘 11:00 - 20:00",
    savedBy: 1284,
  },
  {
    id: "forest-cafe",
    name: "서울숲 카페",
    category: "카페",
    lat: 37.5436,
    lng: 127.0419,
    address: "서울 성동구 서울숲2길 18",
    description: "서울숲 산책 전후에 쉬기 좋은 카페입니다. 오후 햇빛이 들어오는 창가 좌석이 인기입니다.",
    distance: "1.1km",
    duration: "35분",
    price: "8천원대",
    tags: ["카페", "디저트", "휴식"],
    hours: "오늘 10:00 - 22:00",
    savedBy: 934,
  },
  {
    id: "popup-street",
    name: "연무장 팝업",
    category: "팝업",
    lat: 37.5439,
    lng: 127.0584,
    address: "서울 성동구 연무장길 39",
    description: "이번 주까지만 운영되는 브랜드 팝업입니다. 굿즈와 포토존 중심으로 빠르게 둘러보기 좋습니다.",
    distance: "480m",
    duration: "30분",
    price: "무료",
    tags: ["팝업", "굿즈", "포토존"],
    hours: "오늘 12:00 - 21:00",
    savedBy: 2107,
  },
  {
    id: "river-walk",
    name: "뚝섬 산책길",
    category: "산책",
    lat: 37.5318,
    lng: 127.0662,
    address: "서울 광진구 자양동 427-1",
    description: "코스의 끝을 가볍게 마무리하기 좋은 강변 산책 구간입니다. 노을 시간대 만족도가 높습니다.",
    distance: "2.0km",
    duration: "50분",
    price: "무료",
    tags: ["산책", "강변", "노을"],
    hours: "상시 이용",
    savedBy: 1573,
  },
];

const categoryTone: Record<PlaceCategory, string> = {
  전시: "#2563eb",
  카페: "#16a34a",
  팝업: "#d97706",
  산책: "#0f766e",
};

type MapMode = (typeof mapModes)[number];

let kakaoSdkPromise: Promise<KakaoMapsApi> | null = null;

function loadKakaoMaps(appKey: string) {
  if (window.kakao?.maps) {
    return new Promise<KakaoMapsApi>((resolve) => {
      window.kakao?.maps.load(() => resolve(window.kakao!.maps));
    });
  }

  if (kakaoSdkPromise) {
    return kakaoSdkPromise;
  }

  kakaoSdkPromise = new Promise<KakaoMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById("kakao-map-sdk");

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.kakao?.maps.load(() => resolve(window.kakao!.maps));
      });
      existingScript.addEventListener("error", () => reject(new Error("Kakao Map SDK load failed")));
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = "kakao-map-sdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.onload = () => {
      window.kakao?.maps.load(() => resolve(window.kakao!.maps));
    };
    script.onerror = () => reject(new Error("Kakao Map SDK load failed"));
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}

function createMarkerElement(place: MapPlace, isActive: boolean) {
  const marker = document.createElement("button");
  marker.type = "button";
  marker.setAttribute("aria-label", `${place.name} 마커`);
  marker.style.alignItems = "center";
  marker.style.background = isActive ? "#111827" : "#ffffff";
  marker.style.border = `2px solid ${categoryTone[place.category]}`;
  marker.style.borderRadius = "999px";
  marker.style.boxShadow = "0 14px 34px rgba(15, 23, 42, 0.22)";
  marker.style.color = isActive ? "#ffffff" : "#111827";
  marker.style.cursor = "pointer";
  marker.style.display = "inline-flex";
  marker.style.font = "700 12px system-ui, sans-serif";
  marker.style.gap = "6px";
  marker.style.height = "34px";
  marker.style.padding = "0 12px 0 8px";
  marker.style.whiteSpace = "nowrap";
  marker.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${categoryTone[place.category]}"></span>${place.name}`;

  return marker;
}

export function InteractiveMap() {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const mapsRef = useRef<KakaoMapsApi | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const chainLineRef = useRef<KakaoPolyline | null>(null);
  const [mode, setMode] = useState<(typeof mapModes)[number]>("추천");
  const [category, setCategory] = useState<PlaceCategory | "전체">("전체");
  const [chainPlaces, setChainPlaces] = useState<MapPlace[]>([]);
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishedDraft, setPublishedDraft] = useState<TripDraft | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState(places[0].id);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "missing-key">(
    appKey ? "idle" : "missing-key",
  );

  const visiblePlaces = useMemo(
    () => places.filter((place) => category === "전체" || place.category === category),
    [category],
  );
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? places[0];
  const selectedPlaceIsInChain = chainPlaces.some((place) => place.id === selectedPlace.id);

  useEffect(() => {
    if (!appKey || !containerRef.current || mapRef.current) {
      return;
    }

    let isMounted = true;
    setStatus("loading");

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (!isMounted || !containerRef.current) {
          return;
        }

        const center = new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
        const map = new maps.Map(containerRef.current, {
          center,
          draggable: true,
          level: DEFAULT_LEVEL,
          scrollwheel: true,
        });

        mapsRef.current = maps;
        mapRef.current = map;
        setLevel(map.getLevel());
        setStatus("ready");

        window.requestAnimationFrame(() => map.relayout());
      })
      .catch(() => {
        if (isMounted) {
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [appKey]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!map || !maps || status !== "ready") {
      return;
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = visiblePlaces.map((place) => {
      const marker = createMarkerElement(place, place.id === selectedPlaceId);
      marker.addEventListener("click", () => {
        setSelectedPlaceId(place.id);
        setIsDetailOpen(true);
      });

      const overlay = new maps.CustomOverlay({
        clickable: true,
        content: marker,
        position: new maps.LatLng(place.lat, place.lng),
        xAnchor: 0.5,
        yAnchor: 1,
      });

      overlay.setMap(map);

      return overlay;
    });

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [selectedPlaceId, status, visiblePlaces]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    chainLineRef.current?.setMap(null);
    chainLineRef.current = null;

    if (!map || !maps || !isPreviewActive || chainPlaces.length < 2) {
      return;
    }

    const linePath = chainPlaces.map((place) => new maps.LatLng(place.lat, place.lng));
    const chainLine = new maps.Polyline({
      endArrow: true,
      path: linePath,
      strokeColor: "#2563eb",
      strokeOpacity: 0.9,
      strokeStyle: "solid",
      strokeWeight: 6,
    });

    chainLine.setMap(map);
    chainLineRef.current = chainLine;

    return () => {
      chainLine.setMap(null);
      chainLineRef.current = null;
    };
  }, [chainPlaces, isPreviewActive]);

  function changeLevel(nextLevel: number) {
    const clampedLevel = Math.min(10, Math.max(1, nextLevel));
    mapRef.current?.setLevel(clampedLevel);
    setLevel(clampedLevel);
  }

  function resetView() {
    if (!mapsRef.current || !mapRef.current) {
      return;
    }

    mapRef.current.setCenter(new mapsRef.current.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng));
    mapRef.current.setLevel(DEFAULT_LEVEL);
    setLevel(DEFAULT_LEVEL);
  }

  function focusPlace(place: MapPlace) {
    setSelectedPlaceId(place.id);
    setIsDetailOpen(true);

    if (!mapsRef.current || !mapRef.current) {
      return;
    }

    mapRef.current.setCenter(new mapsRef.current.LatLng(place.lat, place.lng));
  }

  function getModeTargetPlace(nextMode: MapMode) {
    if (nextMode === "도보") {
      return places.find((place) => place.category === "산책") ?? places[0];
    }

    if (nextMode === "저장") {
      return chainPlaces[0] ?? [...places].sort((a, b) => b.savedBy - a.savedBy)[0];
    }

    return [...places].sort((a, b) => b.savedBy - a.savedBy)[0];
  }

  function selectMapMode(nextMode: MapMode) {
    const targetPlace = getModeTargetPlace(nextMode);

    setMode(nextMode);
    setCategory(nextMode === "도보" ? "산책" : "전체");
    focusPlace(targetPlace);
  }

  function addPlaceToChain(place: MapPlace) {
    setChainPlaces((currentPlaces) => {
      if (currentPlaces.some((currentPlace) => currentPlace.id === place.id)) {
        return currentPlaces;
      }

      return [...currentPlaces, place];
    });
  }

  function removePlaceFromChain(placeId: string) {
    setChainPlaces((currentPlaces) => {
      const nextPlaces = currentPlaces.filter((place) => place.id !== placeId);

      if (nextPlaces.length < 2) {
        setIsPreviewActive(false);
      }

      return nextPlaces;
    });
  }

  function movePlaceInChain(placeId: string, direction: "up" | "down") {
    setChainPlaces((currentPlaces) => {
      const currentIndex = currentPlaces.findIndex((place) => place.id === placeId);

      if (currentIndex < 0) {
        return currentPlaces;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (nextIndex < 0 || nextIndex >= currentPlaces.length) {
        return currentPlaces;
      }

      const nextPlaces = [...currentPlaces];
      const currentPlace = nextPlaces[currentIndex];
      nextPlaces[currentIndex] = nextPlaces[nextIndex];
      nextPlaces[nextIndex] = currentPlace;

      return nextPlaces;
    });
  }

  function clearChain() {
    setChainPlaces([]);
    setIsPreviewActive(false);
  }

  function toggleChainPreview() {
    if (chainPlaces.length < 2) {
      setIsPreviewActive(false);
      return;
    }

    setIsPreviewActive((isActive) => !isActive);
  }

  function publishDraft(draft: TripDraft) {
    setPublishedDraft(draft);
    setIsPublishOpen(false);
  }

  return (
    <section
      aria-label="카카오맵 인터랙티브 지도"
      className="relative min-h-[640px] overflow-hidden rounded-lg border border-border bg-slate-200 shadow-panel dark:bg-slate-900"
    >
      <div ref={containerRef} className="absolute inset-0" />

      {status !== "ready" && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-muted/92 p-6 text-center backdrop-blur-sm">
          <div className="max-w-md rounded-lg border border-border bg-surface p-6 shadow-panel">
            <Badge tone={status === "error" ? "amber" : "blue"}>Kakao Map</Badge>
            <h2 className="mt-4 text-xl font-bold">
              {status === "missing-key" ? "카카오맵 앱 키가 필요합니다" : "카카오맵을 불러오는 중입니다"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {status === "missing-key"
                ? ".env.local에 NEXT_PUBLIC_KAKAO_MAP_APP_KEY 값을 넣으면 SDK가 자동 요청되어 지도가 표시됩니다."
                : "카카오 지도 SDK 스크립트를 요청하고 지도 인스턴스를 준비하고 있습니다."}
            </p>
            {status === "error" && (
              <p className="mt-3 text-sm leading-6 text-danger">
                SDK 로드에 실패했습니다. 앱 키, 플랫폼 도메인, 네트워크 상태를 확인해 주세요.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,transparent_58%,rgba(15,23,42,0.14)_100%)]" />

      <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-2">
        <Badge tone="blue">카카오맵</Badge>
        <Badge tone="green">마커 {visiblePlaces.length}개</Badge>
        <Badge tone="neutral">레벨 {level}</Badge>
      </div>

      <div className="glass-panel absolute left-4 top-16 z-10 hidden rounded-lg p-1 sm:flex">
        {mapModes.map((item) => (
          <button
            className={cn(
              "h-9 rounded-sm px-3 text-sm font-semibold text-muted transition hover:bg-surface-muted",
              mode === item && "bg-primary text-white shadow-soft hover:bg-primary",
            )}
            key={item}
            onClick={() => selectMapMode(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="glass-panel absolute left-4 top-[110px] z-10 hidden max-w-[420px] flex-wrap gap-1 rounded-lg p-1 sm:flex">
        {categories.map((item) => (
          <button
            className={cn(
              "h-8 rounded-sm px-2.5 text-xs font-semibold text-muted transition hover:bg-surface-muted",
              category === item && "bg-foreground text-background hover:bg-foreground",
            )}
            key={item}
            onClick={() => setCategory(item)}
            type="button"
          >
            {item}
          </button>
        ))}
      </div>

      <div className="glass-panel absolute bottom-4 right-4 z-20 grid gap-2 rounded-lg p-2">
        <Button
          aria-label="지도 확대"
          className="h-10 w-10 px-0 text-lg"
          disabled={status !== "ready"}
          onClick={() => changeLevel(level - 1)}
          size="sm"
        >
          +
        </Button>
        <Button
          aria-label="지도 축소"
          className="h-10 w-10 px-0 text-lg"
          disabled={status !== "ready"}
          onClick={() => changeLevel(level + 1)}
          size="sm"
          variant="secondary"
        >
          -
        </Button>
        <Button
          aria-label="지도 위치 초기화"
          className="h-10 w-10 px-0"
          disabled={status !== "ready"}
          onClick={resetView}
          size="sm"
          variant="secondary"
        >
          ↺
        </Button>
        <Button
          aria-label="탐색 피드 열기"
          className="h-10 w-10 px-0"
          onClick={() => setIsCommunityOpen(true)}
          size="sm"
          title="탐색 피드"
          variant="secondary"
        >
          <CompassIcon className="h-5 w-5" />
        </Button>
      </div>

      {isDetailOpen ? (
        <PlaceDetailCard
          isInChain={selectedPlaceIsInChain}
          onAddToChain={addPlaceToChain}
          onClose={() => setIsDetailOpen(false)}
          onFocus={focusPlace}
          place={selectedPlace}
        />
      ) : (
        <button
          className="glass-panel absolute bottom-20 right-4 z-10 rounded-lg px-4 py-3 text-sm font-bold sm:bottom-4 sm:right-20"
          onClick={() => setIsDetailOpen(true)}
          type="button"
        >
          {selectedPlace.name} 다시 보기
        </button>
      )}

      <TripChainBuilder
        chainPlaces={chainPlaces}
        isPreviewActive={isPreviewActive}
        onClear={clearChain}
        onFocusPlace={focusPlace}
        onMovePlace={movePlaceInChain}
        onPreview={toggleChainPreview}
        onPublish={() => setIsPublishOpen(true)}
        onRemovePlace={removePlaceFromChain}
      />

      {isPublishOpen && (
        <TripPublishPanel
          chainPlaces={chainPlaces}
          onClose={() => setIsPublishOpen(false)}
          onPublishDraft={publishDraft}
        />
      )}

      {publishedDraft && (
        <TripDetailPreview draft={publishedDraft} onClose={() => setPublishedDraft(null)} />
      )}

      {isCommunityOpen && (
        <CommunityHub latestDraft={publishedDraft} onClose={() => setIsCommunityOpen(false)} />
      )}
    </section>
  );
}
