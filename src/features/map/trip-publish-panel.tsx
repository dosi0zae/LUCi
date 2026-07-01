"use client";

import { FormEvent, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MapPlace } from "./place-detail-card";
import { getTotalMinutes, TripDraft, TripVisibility } from "./trip-draft";

type TripPublishPanelProps = {
  chainPlaces: MapPlace[];
  onClose: () => void;
  onPublishDraft: (draft: TripDraft) => void;
};

const visibilityOptions: Array<{
  description: string;
  label: string;
  value: TripVisibility;
}> = [
  {
    description: "탐색 피드와 랭킹에 노출됩니다.",
    label: "공개",
    value: "public",
  },
  {
    description: "링크를 가진 사람만 볼 수 있습니다.",
    label: "링크 공개",
    value: "link",
  },
  {
    description: "나만 볼 수 있는 초안으로 저장합니다.",
    label: "비공개",
    value: "private",
  },
];

export function TripPublishPanel({
  chainPlaces,
  onClose,
  onPublishDraft,
}: TripPublishPanelProps) {
  const [description, setDescription] = useState(
    "성수의 전시, 팝업, 카페를 자연스럽게 이어 걷는 반나절 코스입니다.",
  );
  const [status, setStatus] = useState<"draft" | "ready">("draft");
  const [title, setTitle] = useState("성수 전시와 팝업 산책");
  const [visibility, setVisibility] = useState<TripVisibility>("public");

  const totalMinutes = useMemo(() => getTotalMinutes(chainPlaces), [chainPlaces]);
  const checks = [
    {
      label: "장소 2곳 이상",
      passed: chainPlaces.length >= 2,
    },
    {
      label: "제목 6자 이상",
      passed: title.trim().length >= 6,
    },
    {
      label: "소개 20자 이상",
      passed: description.trim().length >= 20,
    },
  ];
  const canPublish = checks.every((check) => check.passed);

  function submitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canPublish) {
      return;
    }

    setStatus("ready");
    onPublishDraft({
      description: description.trim(),
      id: `trip-${Date.now()}`,
      places: chainPlaces,
      publishedAt: new Date().toISOString(),
      title: title.trim(),
      totalMinutes,
      visibility,
    });
  }

  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-slate-950/42 p-4 backdrop-blur-sm">
      <form
        className="max-h-[calc(100vh-2rem)] w-[min(760px,100%)] overflow-auto rounded-lg border border-border bg-surface p-5 shadow-panel"
        onSubmit={submitDraft}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <Badge tone={status === "ready" ? "green" : "blue"}>Phase 8</Badge>
            <h2 className="mt-3 text-2xl font-bold">Trip Chain 발행 준비</h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              만든 체인을 제목, 소개, 공개 범위가 있는 발행 초안으로 정리합니다.
            </p>
          </div>
          <button
            aria-label="발행 패널 닫기"
            className="h-9 w-9 rounded-sm text-xl font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground"
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-bold">체인 제목</span>
              <input
                className="h-11 rounded-sm border border-border bg-surface px-3 text-sm outline-none transition focus:border-primary"
                onChange={(event) => setTitle(event.target.value)}
                value={title}
              />
            </label>

            <label className="grid gap-2">
              <span className="text-sm font-bold">소개</span>
              <textarea
                className="min-h-28 resize-none rounded-sm border border-border bg-surface p-3 text-sm leading-6 outline-none transition focus:border-primary"
                onChange={(event) => setDescription(event.target.value)}
                value={description}
              />
            </label>

            <fieldset className="grid gap-2">
              <legend className="text-sm font-bold">공개 범위</legend>
              <div className="grid gap-2 sm:grid-cols-3">
                {visibilityOptions.map((option) => (
                  <button
                    className={cn(
                      "rounded-sm border border-border bg-surface p-3 text-left transition hover:border-border-strong",
                      visibility === option.value && "border-primary bg-primary-soft",
                    )}
                    key={option.value}
                    onClick={() => setVisibility(option.value)}
                    type="button"
                  >
                    <span className="text-sm font-bold">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-muted">
                      {option.description}
                    </span>
                  </button>
                ))}
              </div>
            </fieldset>
          </div>

          <aside className="rounded-sm border border-border bg-surface-muted p-4">
            <h3 className="text-sm font-bold">발행 검증</h3>
            <div className="mt-3 grid gap-2">
              {checks.map((check) => (
                <div className="flex items-center justify-between gap-3 text-sm" key={check.label}>
                  <span className="text-muted-strong">{check.label}</span>
                  <span
                    className={cn(
                      "rounded-xs px-2 py-1 text-xs font-bold",
                      check.passed
                        ? "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                    )}
                  >
                    {check.passed ? "완료" : "필요"}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-4 rounded-sm bg-surface p-3">
              <p className="text-xs font-semibold text-muted">요약</p>
              <p className="mt-2 text-sm font-bold">{chainPlaces.length}곳 · {totalMinutes}분</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                공개 범위: {visibilityOptions.find((option) => option.value === visibility)?.label}
              </p>
            </div>

            <div className="mt-4 grid gap-2">
              {chainPlaces.map((place, index) => (
                <div className="flex items-center gap-2 text-sm" key={place.id}>
                  <span className="grid h-6 w-6 place-items-center rounded-xs bg-primary text-xs font-bold text-white">
                    {index + 1}
                  </span>
                  <span className="truncate font-semibold">{place.name}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>

        {status === "ready" && (
          <div className="mt-4 rounded-sm border border-green-200 bg-green-50 p-3 text-sm font-semibold text-green-700 dark:border-green-900 dark:bg-green-950 dark:text-green-300">
            발행 초안이 준비되었습니다. 이제 상세 페이지 프리뷰에서 확인할 수 있습니다.
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <Button onClick={onClose} size="sm" type="button" variant="secondary">
            닫기
          </Button>
          <Button disabled={!canPublish} size="sm" type="submit">
            발행 초안 만들기
          </Button>
        </div>
      </form>
    </div>
  );
}
