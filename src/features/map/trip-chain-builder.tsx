import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MapPlace } from "./place-detail-card";

type TripChainBuilderProps = {
  chainPlaces: MapPlace[];
  isPreviewActive: boolean;
  onClear: () => void;
  onFocusPlace: (place: MapPlace) => void;
  onMovePlace: (placeId: string, direction: "up" | "down") => void;
  onPreview: () => void;
  onPublish: () => void;
  onRemovePlace: (placeId: string) => void;
};

function getTotalMinutes(chainPlaces: MapPlace[]) {
  return chainPlaces.reduce((total, place) => {
    const minutes = Number.parseInt(place.duration, 10);

    return Number.isNaN(minutes) ? total : total + minutes;
  }, 0);
}

export function TripChainBuilder({
  chainPlaces,
  isPreviewActive,
  onClear,
  onFocusPlace,
  onMovePlace,
  onPreview,
  onPublish,
  onRemovePlace,
}: TripChainBuilderProps) {
  const totalMinutes = getTotalMinutes(chainPlaces);

  return (
    <aside className="glass-panel absolute bottom-4 left-4 z-10 hidden w-[340px] rounded-lg p-4 xl:block">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-primary">Trip Chain Builder</p>
          <h2 className="mt-1 text-lg font-bold">나의 체인</h2>
        </div>
        <span className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-bold text-muted-strong">
          {chainPlaces.length}곳
        </span>
      </div>

      {chainPlaces.length === 0 ? (
        <div className="mt-4 rounded-sm border border-dashed border-border-strong bg-surface/70 p-4">
          <p className="text-sm font-semibold">아직 추가된 장소가 없습니다.</p>
          <p className="mt-2 text-sm leading-6 text-muted">
            지도 마커를 선택하고 상세 카드의 후보 추가를 누르면 이곳에 순서대로 쌓입니다.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-2">
            {chainPlaces.map((place, index) => (
              <div
                className="rounded-sm border border-border bg-surface/82 p-3 shadow-soft"
                key={place.id}
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-xs bg-primary text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <button
                    className="min-w-0 flex-1 text-left"
                    onClick={() => onFocusPlace(place)}
                    type="button"
                  >
                    <p className="truncate text-sm font-bold">{place.name}</p>
                    <p className="mt-1 truncate text-xs text-muted">
                      {place.category} · {place.duration} · {place.distance}
                    </p>
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-1">
                  <button
                    aria-label={`${place.name} 앞으로 이동`}
                    className={cn(
                      "h-8 rounded-xs bg-surface-muted text-xs font-bold text-muted-strong transition hover:bg-primary-soft",
                      index === 0 && "cursor-not-allowed opacity-40",
                    )}
                    disabled={index === 0}
                    onClick={() => onMovePlace(place.id, "up")}
                    type="button"
                  >
                    ↑
                  </button>
                  <button
                    aria-label={`${place.name} 뒤로 이동`}
                    className={cn(
                      "h-8 rounded-xs bg-surface-muted text-xs font-bold text-muted-strong transition hover:bg-primary-soft",
                      index === chainPlaces.length - 1 && "cursor-not-allowed opacity-40",
                    )}
                    disabled={index === chainPlaces.length - 1}
                    onClick={() => onMovePlace(place.id, "down")}
                    type="button"
                  >
                    ↓
                  </button>
                  <button
                    className="col-span-2 h-8 rounded-xs bg-surface-muted text-xs font-bold text-muted-strong transition hover:bg-surface"
                    onClick={() => onRemovePlace(place.id)}
                    type="button"
                  >
                    제거
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-sm border border-border bg-surface/76 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold text-muted">예상 체류</span>
              <strong>{totalMinutes}분</strong>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span className="font-semibold text-muted">연결 상태</span>
              <strong>{isPreviewActive ? "지도 표시 중" : "대기"}</strong>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button disabled={chainPlaces.length < 2} onClick={onPreview} size="sm">
              {isPreviewActive ? "미리보기 끄기" : "체인 미리보기"}
            </Button>
            <Button disabled={chainPlaces.length < 2} onClick={onPublish} size="sm">
              발행 준비
            </Button>
          </div>
          <div className="mt-2">
            <Button onClick={onClear} size="sm" variant="secondary">
              초기화
            </Button>
          </div>
        </>
      )}
    </aside>
  );
}
