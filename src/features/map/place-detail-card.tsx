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

const categoryTones: Record<PlaceCategory, string> = {
  전시: "#7c6cf2",
  카페: "#a36a3d",
  팝업: "#e87957",
  산책: "#2f9f8f",
};

export function PlaceDetailCard({
  isInChain,
  onAddToChain,
  onClose,
  onFocus,
  place,
}: PlaceDetailCardProps) {
  return (
    <aside className="glass-panel absolute bottom-6 right-24 z-10 w-[min(380px,calc(100%-8rem))] rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <span
            className="inline-flex h-7 items-center rounded-xs border px-2.5 text-xs font-semibold"
            style={{
              background: `color-mix(in srgb, ${categoryTones[place.category]} 13%, rgba(255,255,255,0.84))`,
              borderColor: `color-mix(in srgb, ${categoryTones[place.category]} 26%, transparent)`,
              color: categoryTones[place.category],
            }}
          >
            {place.category}
          </span>
          <h2 className="mt-3 truncate text-xl font-bold">{place.name}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{place.address}</p>
        </div>
        <button
          aria-label="장소 상세 닫기"
          className="grid h-8 w-8 place-items-center rounded-sm text-muted transition hover:bg-surface-muted hover:text-foreground"
          onClick={onClose}
          title="장소 상세 숨기기"
          type="button"
        >
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 4.2A8.8 8.8 0 0 1 12 4c5 0 8 6 8 6a13.8 13.8 0 0 1-2.2 3.1" />
            <path d="M6.6 6.6C4.9 7.8 4 10 4 10s3 6 8 6a8.8 8.8 0 0 0 3.4-.7" />
          </svg>
        </button>
      </div>

      <p className="mt-4 text-sm leading-6 text-muted-strong">{place.description}</p>

      <dl className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["거리", place.distance],
          ["시간", place.duration],
          ["예산", place.price],
        ].map(([label, value]) => (
          <div className="rounded-sm border border-border bg-surface/78 p-3" key={label}>
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
