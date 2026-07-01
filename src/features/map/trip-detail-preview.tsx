import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TripDraft } from "./trip-draft";

type TripDetailPreviewProps = {
  draft: TripDraft;
  onClose: () => void;
};

const visibilityLabel = {
  public: "공개",
  link: "링크 공개",
  private: "비공개",
} as const;

export function TripDetailPreview({ draft, onClose }: TripDetailPreviewProps) {
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
          <div className="rounded-lg border border-border bg-surface p-5 shadow-soft">
            <div className="flex flex-wrap gap-2">
              <Badge tone="blue">{visibilityLabel[draft.visibility]}</Badge>
              <Badge tone="green">{draft.places.length}개 장소</Badge>
              <Badge tone="neutral">{draft.totalMinutes}분 코스</Badge>
            </div>

            <h2 className="mt-5 text-3xl font-bold leading-tight">{draft.title}</h2>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-strong">
              {draft.description}
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              {[
                ["장소", `${draft.places.length}곳`],
                ["예상 체류", `${draft.totalMinutes}분`],
                ["상태", "프리뷰"],
              ].map(([label, value]) => (
                <div className="rounded-sm bg-surface-muted p-4" key={label}>
                  <p className="text-xs font-semibold text-muted">{label}</p>
                  <p className="mt-1 text-lg font-bold">{value}</p>
                </div>
              ))}
            </div>
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

        <aside className="h-fit rounded-lg border border-border bg-surface p-4 shadow-soft">
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
          <div className="mt-5 rounded-sm bg-surface-muted p-3 text-sm leading-6 text-muted-strong">
            실제 공유 URL, 댓글, 좋아요, 북마크는 이후 Phase에서 연결됩니다.
          </div>
        </aside>
      </main>
    </div>
  );
}
