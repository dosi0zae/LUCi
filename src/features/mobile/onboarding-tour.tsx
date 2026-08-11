"use client";

import { useEffect, useState } from "react";

export type TourTabId = "home" | "explore" | "ranking" | "profile";

type TourStep = {
  target: string;
  title: string;
  description: string;
  tab: TourTabId;
};

const TOUR_STEPS: TourStep[] = [
  {
    target: "search-form",
    title: "AI에게 코스 물어보기",
    description: "원하는 분위기나 스타일을 문장으로 말하면 AI가 알아서 코스를 짜드려요.",
    tab: "home",
  },
  {
    target: "quick-browse",
    title: "바로 둘러보기",
    description: "검색이 귀찮다면 여기를 눌러서 인기 코스부터 바로 살펴볼 수 있어요.",
    tab: "home",
  },
  {
    target: "nav-explore",
    title: "탐색",
    description: "다른 사람들이 만든 코스와 장소를 리스트나 지도로 둘러볼 수 있어요.",
    tab: "explore",
  },
  {
    target: "nav-ranking",
    title: "랭킹",
    description: "요즘 가장 인기 있는 코스를 랭킹으로 확인해보세요.",
    tab: "ranking",
  },
  {
    target: "nav-profile",
    title: "프로필",
    description: "내가 만든 코스, 저장한 코스, 최근 본 코스를 여기서 관리할 수 있어요.",
    tab: "profile",
  },
];

type OnboardingTourProps = {
  phase: "intro" | "steps";
  onActivateTab: (tab: TourTabId) => void;
  onFinish: () => void;
  onSkip: () => void;
  onStart: () => void;
};

export function OnboardingTour({ onActivateTab, onFinish, onSkip, onStart, phase }: OnboardingTourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = TOUR_STEPS[stepIndex];
  const isLastStep = stepIndex === TOUR_STEPS.length - 1;

  useEffect(() => {
    if (phase !== "steps") {
      return;
    }
    onActivateTab(step.tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, step]);

  useEffect(() => {
    if (phase !== "steps") {
      return;
    }

    let cancelled = false;
    let frame = 0;

    function measure() {
      if (cancelled) {
        return;
      }
      const element = document.querySelector(`[data-tour="${step.target}"]`);
      if (element) {
        setRect(element.getBoundingClientRect());
      } else if (frame < 20) {
        frame += 1;
        window.setTimeout(measure, 16);
      }
    }

    // Deliberately keep the previous rect while re-measuring: the spotlight box stays
    // mounted and glides from the old target to the new one via the CSS transition
    // below, instead of popping away to a full overlay and snapping back in fresh.
    window.setTimeout(measure, 16);

    function handleResize() {
      const element = document.querySelector(`[data-tour="${step.target}"]`);
      if (element) {
        setRect(element.getBoundingClientRect());
      }
    }

    window.addEventListener("resize", handleResize);

    return () => {
      cancelled = true;
      window.removeEventListener("resize", handleResize);
    };
  }, [phase, step]);

  function goNext() {
    if (isLastStep) {
      onFinish();
      return;
    }
    setStepIndex((current) => current + 1);
  }

  function goPrev() {
    setStepIndex((current) => Math.max(0, current - 1));
  }

  if (phase === "intro") {
    return (
      <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/80 px-8 text-center backdrop-blur-sm">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt="Trip Chain" className="h-14 w-auto drop-shadow-[0_0_18px_rgba(79,141,247,0.55)]" src="/tripchain-logo.svg" />
        <h2 className="text-2xl font-extrabold text-white">처음이신가요?</h2>
        <p className="max-w-[260px] text-sm leading-6 text-white/70">
          핵심 기능을 30초 안에 소개해드릴게요.
        </p>
        <button
          className="mt-2 rounded-full bg-primary px-6 py-3 text-sm font-extrabold text-white transition hover:bg-primary-strong"
          onClick={onStart}
          type="button"
        >
          튜토리얼 시작하기
        </button>
        <button
          className="text-xs font-semibold text-white/50 transition hover:text-white hover:underline"
          onClick={onSkip}
          type="button"
        >
          건너뛰기
        </button>
      </div>
    );
  }

  const padding = 6;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 400;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const placeBelow = rect ? rect.bottom + 170 < viewportHeight : true;
  const tooltipLeft = rect ? Math.max(20, Math.min(rect.left, viewportWidth - 340)) : 20;

  return (
    <div className="fixed inset-0 z-[60]">
      {rect ? (
        <div
          className="fixed rounded-xl transition-all duration-300"
          style={{
            top: rect.top - padding,
            left: rect.left - padding,
            width: rect.width + padding * 2,
            height: rect.height + padding * 2,
            boxShadow: "0 0 0 9999px rgba(11, 18, 32, 0.78)",
            pointerEvents: "none",
          }}
        />
      ) : (
        <div className="fixed inset-0 bg-[#0b1220]/78" />
      )}

      {rect && (
        <div
          className="fixed z-[61] w-[calc(100%-40px)] max-w-[320px] rounded-xl bg-background p-4 shadow-panel transition-all duration-300"
          style={{
            left: tooltipLeft,
            top: placeBelow ? rect.bottom + 14 : undefined,
            bottom: placeBelow ? undefined : viewportHeight - rect.top + 14,
          }}
        >
          <p className="text-xs font-bold text-primary">
            {stepIndex + 1} / {TOUR_STEPS.length}
          </p>
          <h3 className="mt-1 text-base font-extrabold text-foreground">{step.title}</h3>
          <p className="mt-1.5 text-sm leading-5 text-muted-strong">{step.description}</p>
          <div className="mt-3 flex items-center justify-between">
            <button
              className="text-xs font-semibold text-muted transition hover:text-foreground"
              onClick={onSkip}
              type="button"
            >
              건너뛰기
            </button>
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <button
                  className="rounded-full border border-border px-3 py-1.5 text-xs font-bold text-muted-strong transition hover:border-primary hover:text-primary"
                  onClick={goPrev}
                  type="button"
                >
                  이전
                </button>
              )}
              <button
                className="rounded-full bg-primary px-4 py-1.5 text-xs font-bold text-white transition hover:bg-primary-strong"
                onClick={goNext}
                type="button"
              >
                {isLastStep ? "시작하기" : "다음"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
