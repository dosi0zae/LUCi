"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MapPlace } from "./place-detail-card";

type TripChainBuilderProps = {
  chainPlaces: MapPlace[];
  isDragOver: boolean;
  isPreviewActive: boolean;
  isWalkingRouteActive: boolean;
  onClear: () => void;
  onDragLeave: () => void;
  onDragOver: () => void;
  onDropPlace: () => void;
  onFocusPlace: (place: MapPlace) => void;
  onMovePlace: (placeId: string, direction: "up" | "down") => void;
  onOptimizeRoute: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onRemovePlace: (placeId: string) => void;
  onReorderPlace: (activePlaceId: string, targetPlaceId: string) => void;
  onWalkingRoute: () => void;
};

function getStayMinutes(chainPlaces: MapPlace[]) {
  return chainPlaces.reduce((total, place) => {
    const minutes = Number.parseInt(place.duration, 10);

    return Number.isNaN(minutes) ? total : total + minutes;
  }, 0);
}

function getDistanceMeters(a: MapPlace, b: MapPlace) {
  const earthRadius = 6371000;
  const latA = (a.lat * Math.PI) / 180;
  const latB = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getMoveMinutes(chainPlaces: MapPlace[]) {
  return chainPlaces.slice(1).reduce((total, place, index) => {
    const previousPlace = chainPlaces[index];
    const meters = getDistanceMeters(previousPlace, place);

    return total + Math.max(3, Math.round(meters / 70));
  }, 0);
}

function getChainWarnings(chainPlaces: MapPlace[]) {
  const warnings: string[] = [];

  chainPlaces.slice(1).forEach((place, index) => {
    const previousPlace = chainPlaces[index];
    const meters = getDistanceMeters(previousPlace, place);

    if (meters > 1800) {
      warnings.push(
        `${previousPlace.name} -> ${place.name} 구간이 ${(meters / 1000).toFixed(1)}km로 깁니다.`,
      );
    }

    if (previousPlace.category === place.category) {
      warnings.push(`${previousPlace.category} 장소가 연속됩니다. 중간에 다른 성격의 장소를 넣어보세요.`);
    }
  });

  return warnings.slice(0, 3);
}

function TrashIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 15H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export function TripChainBuilder({
  chainPlaces,
  isDragOver,
  isPreviewActive,
  isWalkingRouteActive,
  onClear,
  onDragLeave,
  onDragOver,
  onDropPlace,
  onFocusPlace,
  onMovePlace,
  onOptimizeRoute,
  onPreview,
  onPublish,
  onRemovePlace,
  onReorderPlace,
  onWalkingRoute,
}: TripChainBuilderProps) {
  const [dismissedWarningKey, setDismissedWarningKey] = useState("");
  const [draggedChainPlaceId, setDraggedChainPlaceId] = useState<string | null>(null);
  const stayMinutes = getStayMinutes(chainPlaces);
  const moveMinutes = getMoveMinutes(chainPlaces);
  const warnings = useMemo(() => getChainWarnings(chainPlaces), [chainPlaces]);
  const warningKey = warnings.join("|");
  const isWarningVisible = warnings.length > 0 && dismissedWarningKey !== warningKey;
  const totalMinutes = stayMinutes + moveMinutes;

  return (
    <>
      {isWarningVisible && (
        <div className="glass-panel absolute bottom-[calc(3.25rem+min(52vh,520px))] left-[392px] z-30 hidden w-[340px] rounded-lg border border-amber-200 bg-amber-50/95 p-3 text-xs font-semibold leading-5 text-amber-900 shadow-soft xl:block">
          <div className="flex items-start justify-between gap-3">
            <div className="grid gap-1">
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
            <button
              aria-label="체인 안내 닫기"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-xs text-sm font-bold text-amber-900 transition hover:bg-amber-100"
              onClick={() => setDismissedWarningKey(warningKey)}
              type="button"
            >
              x
            </button>
          </div>
        </div>
      )}

      <aside
        className={cn(
          "glass-panel absolute bottom-10 left-[392px] z-20 hidden max-h-[min(52vh,520px)] w-[340px] flex-col overflow-hidden rounded-lg p-4 transition xl:flex",
          isDragOver && "border-primary bg-primary-soft",
        )}
        onDragLeave={onDragLeave}
        onDragOver={(event) => {
          event.preventDefault();
          onDragOver();
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDropPlace();
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-primary">Trip Chain Builder</p>
            <h2 className="mt-1 text-lg font-bold">나의 체인</h2>
          </div>
          <span className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-bold text-muted-strong">
            {chainPlaces.length}곳
          </span>
        </div>

        {chainPlaces.length === 0 ? (
          <div
            className={cn(
              "mt-4 rounded-sm border border-dashed border-border-strong bg-surface/70 p-4 transition",
              isDragOver && "border-primary bg-surface",
            )}
          >
            {isDragOver && (
              <p className="mb-2 rounded-sm bg-primary px-3 py-2 text-sm font-bold text-white">
                여기에 놓으면 체인에 추가됩니다.
              </p>
            )}
            <p className="text-sm font-semibold">아직 추가한 장소가 없습니다.</p>
            <p className="mt-2 text-sm leading-6 text-muted">
              장소 탐색 리스트에서 후보를 드래그하거나 후보 추가를 누르면 동선 순서대로 들어갑니다.
            </p>
          </div>
        ) : (
          <div className="mt-4 flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              <div className="grid gap-2">
                {chainPlaces.map((place, index) => (
                  <div
                    className={cn(
                      "cursor-grab rounded-sm border border-border bg-surface/82 px-3 py-2 shadow-soft transition active:cursor-grabbing",
                      draggedChainPlaceId === place.id && "opacity-60 ring-2 ring-primary",
                      draggedChainPlaceId && draggedChainPlaceId !== place.id && "hover:border-primary",
                    )}
                    draggable
                    key={place.id}
                    onDragEnd={() => setDraggedChainPlaceId(null)}
                    onDragOver={(event) => {
                      if (!draggedChainPlaceId) {
                        return;
                      }

                      event.preventDefault();
                      event.dataTransfer.dropEffect = "move";
                    }}
                    onDragStart={(event) => {
                      event.stopPropagation();
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedChainPlaceId(place.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();

                      if (draggedChainPlaceId) {
                        onReorderPlace(draggedChainPlaceId, place.id);
                      }

                      setDraggedChainPlaceId(null);
                    }}
                  >
                    <div className="flex min-h-10 items-center gap-2">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xs bg-primary text-xs font-bold text-white">
                        {index + 1}
                      </span>
                      <button className="min-w-0 flex-1 text-left" onClick={() => onFocusPlace(place)} type="button">
                        <p className="truncate text-sm font-bold">{place.name}</p>
                        <p className="mt-1 truncate text-xs text-muted">
                          {place.category} · {place.duration} · {place.distance}
                        </p>
                      </button>
                      <div className="ml-1 flex shrink-0 items-center gap-1">
                        <button
                          aria-label={`${place.name} 위로 이동`}
                          className={cn(
                            "grid h-7 w-7 place-items-center rounded-xs bg-surface-muted text-xs font-bold text-muted-strong transition hover:bg-primary-soft",
                            index === 0 && "cursor-not-allowed opacity-40",
                          )}
                          disabled={index === 0}
                          onClick={() => onMovePlace(place.id, "up")}
                          type="button"
                        >
                          ↑
                        </button>
                        <button
                          aria-label={`${place.name} 아래로 이동`}
                          className={cn(
                            "grid h-7 w-7 place-items-center rounded-xs bg-surface-muted text-xs font-bold text-muted-strong transition hover:bg-primary-soft",
                            index === chainPlaces.length - 1 && "cursor-not-allowed opacity-40",
                          )}
                          disabled={index === chainPlaces.length - 1}
                          onClick={() => onMovePlace(place.id, "down")}
                          type="button"
                        >
                          ↓
                        </button>
                        <button
                          aria-label={`${place.name} 제거`}
                          className="grid h-7 w-7 place-items-center rounded-xs bg-surface-muted text-muted-strong transition hover:bg-surface"
                          onClick={() => onRemovePlace(place.id)}
                          type="button"
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-3 shrink-0 rounded-sm border border-border bg-surface/76 p-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-muted">체류</span>
                <strong>{stayMinutes}분</strong>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-muted">이동</span>
                <strong>{moveMinutes}분</strong>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-muted">총 예상</span>
                <strong>{totalMinutes}분</strong>
              </div>
            </div>

            <div className="mt-3 grid shrink-0 grid-cols-2 gap-2">
              <Button disabled={chainPlaces.length < 2} onClick={onPreview} size="sm">
                {isPreviewActive ? "미리보기 끄기" : "체인 미리보기"}
              </Button>
              <Button disabled={chainPlaces.length < 2} onClick={onOptimizeRoute} size="sm" variant="secondary">
                추천 순서
              </Button>
            </div>
            <Button
              className="mt-2 shrink-0"
              disabled={chainPlaces.length < 2}
              onClick={onWalkingRoute}
              size="sm"
              variant={isWalkingRouteActive ? "primary" : "secondary"}
            >
              {isWalkingRouteActive ? "실제 경로 끄기" : "실제 경로 보기"}
            </Button>
            <div className="mt-2 grid shrink-0 grid-cols-2 gap-2">
              <Button disabled={chainPlaces.length < 2} onClick={onPublish} size="sm">
                발행 준비
              </Button>
              <Button onClick={onClear} size="sm" variant="secondary">
                초기화
              </Button>
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
