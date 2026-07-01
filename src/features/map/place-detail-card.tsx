import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type PlaceCategory = "전시" | "카페" | "팝업" | "산책";

export type MapPlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  address: string;
  description: string;
  distance: string;
  duration: string;
  price: string;
  tags: string[];
  hours: string;
  savedBy: number;
};

type PlaceDetailCardProps = {
  isInChain: boolean;
  onAddToChain: (place: MapPlace) => void;
  place: MapPlace;
  onClose: () => void;
  onFocus: (place: MapPlace) => void;
};

const categoryTones: Record<PlaceCategory, "blue" | "green" | "amber" | "neutral"> = {
  전시: "blue",
  카페: "green",
  팝업: "amber",
  산책: "neutral",
};

export function PlaceDetailCard({
  isInChain,
  onAddToChain,
  onClose,
  onFocus,
  place,
}: PlaceDetailCardProps) {
  return (
    <aside className="glass-panel absolute bottom-4 right-4 z-10 w-[min(380px,calc(100%-2rem))] rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge tone={categoryTones[place.category]}>{place.category}</Badge>
          <h2 className="mt-3 truncate text-xl font-bold">{place.name}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{place.address}</p>
        </div>
        <button
          aria-label="장소 상세 닫기"
          className="h-8 w-8 rounded-sm text-lg font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground"
          onClick={onClose}
          type="button"
        >
          ×
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-strong">{place.description}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["거리", place.distance],
          ["시간", place.duration],
          ["예산", place.price],
        ].map(([label, value]) => (
          <div className="rounded-sm bg-surface/78 p-3" key={label}>
            <dt className="text-xs font-semibold text-muted">{label}</dt>
            <dd className="mt-1 text-sm font-bold">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {place.tags.map((tag) => (
          <span
            className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-semibold text-muted-strong"
            key={tag}
          >
            #{tag}
          </span>
        ))}
      </div>

      <div className="mt-4 rounded-sm border border-border bg-surface/76 p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{place.hours}</p>
          <p className="text-xs font-semibold text-muted">{place.savedBy.toLocaleString()}명이 저장</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
        <Button onClick={() => onFocus(place)} size="sm">
          지도에서 보기
        </Button>
        <Button
          className={cn("px-4")}
          disabled={isInChain}
          onClick={() => onAddToChain(place)}
          size="sm"
          variant="secondary"
        >
          {isInChain ? "추가됨" : "후보 추가"}
        </Button>
      </div>
    </aside>
  );
}
