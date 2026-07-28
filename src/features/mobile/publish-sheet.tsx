"use client";

import { FormEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { MobilePlace, TripVisibility } from "@/features/mobile/mobile-data";

type PublishSheetProps = {
  places: MobilePlace[];
  onCancel: () => void;
  onPublish: (input: { title: string; description: string; visibility: TripVisibility }) => void;
};

const visibilityOptions: { id: TripVisibility; label: string; hint: string }[] = [
  { id: "public", label: "전체 공개", hint: "탐색 피드에 노출돼요" },
  { id: "link", label: "링크 공유", hint: "링크가 있는 사람만 볼 수 있어요" },
  { id: "private", label: "비공개", hint: "나만 볼 수 있어요" },
];

export function PublishSheet({ onCancel, onPublish, places }: PublishSheetProps) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<TripVisibility>("public");
  const [error, setError] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (places.length < 2) {
      setError("코스를 확정하려면 장소가 2곳 이상 필요해요.");
      return;
    }

    if (title.trim().length < 2) {
      setError("제목을 2자 이상 입력해주세요.");
      return;
    }

    setError("");
    onPublish({ title: title.trim(), description: description.trim(), visibility });
  }

  return (
    <div className="sheet-backdrop absolute inset-0 z-30 flex items-end justify-center bg-black/35">
      <form
        className="glass-panel sheet-panel flex max-h-[86%] w-full flex-col overflow-y-auto rounded-t-xl p-5 pb-6"
        onSubmit={handleSubmit}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />

        <h2 className="text-lg font-extrabold">코스 확정하기</h2>
        <p className="mt-1 text-xs text-muted">
          {places.length}개 장소 · 이 코스에 제목과 설명을 붙여 저장해보세요.
        </p>

        <label className="mt-4 block text-xs font-bold text-muted-strong">
          제목
          <input
            className="mt-1.5 h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm font-semibold outline-none focus:border-primary"
            onChange={(event) => setTitle(event.target.value)}
            placeholder="예: 성수 팝업과 카페를 잇는 오후"
            value={title}
          />
        </label>

        <label className="mt-3 block text-xs font-bold text-muted-strong">
          설명
          <textarea
            className="mt-1.5 min-h-20 w-full rounded-sm border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-primary"
            onChange={(event) => setDescription(event.target.value)}
            placeholder="이 코스를 어떤 사람에게 추천하고 싶나요?"
            value={description}
          />
        </label>

        <div className="mt-3 grid gap-2">
          {visibilityOptions.map((option) => (
            <button
              className={cn(
                "flex items-center justify-between rounded-sm border border-border bg-surface px-3 py-2.5 text-left",
                visibility === option.id && "border-primary bg-primary-soft",
              )}
              key={option.id}
              onClick={() => setVisibility(option.id)}
              type="button"
            >
              <span>
                <span className="block text-sm font-bold">{option.label}</span>
                <span className="block text-xs text-muted">{option.hint}</span>
              </span>
              <span
                className={cn(
                  "h-4 w-4 shrink-0 rounded-full border border-border-strong",
                  visibility === option.id && "border-primary bg-primary",
                )}
              />
            </button>
          ))}
        </div>

        {error && <p className="mt-3 text-xs font-semibold text-danger">{error}</p>}

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button onClick={onCancel} type="button" variant="secondary">
            취소
          </Button>
          <Button type="submit">코스 저장</Button>
        </div>
      </form>
    </div>
  );
}
