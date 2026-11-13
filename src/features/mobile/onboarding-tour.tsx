"use client";

import { useEffect, useState } from "react";
import { useT } from "@/features/mobile/i18n/i18n-context";
import type { TranslationKey } from "@/features/mobile/i18n/translations";

export type TourTabId = "home" | "explore" | "profile";

type TourStep = {
  target: string;
  titleKey: TranslationKey;
  descriptionKey: TranslationKey;
  tab: TourTabId;
};

const TOUR_STEPS: TourStep[] = [
  {
    target: "search-form",
    titleKey: "tourStep1Title",
    descriptionKey: "tourStep1Desc",
    tab: "home",
  },
  {
    target: "quick-browse",
    titleKey: "tourStep2Title",
    descriptionKey: "tourStep2Desc",
    tab: "home",
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
  const t = useT();
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
      <div className="tour-scrim fixed inset-0 z-[60] flex items-center justify-center px-6">
        <div className="tour-card hero-rise flex w-full max-w-[21rem] flex-col items-center gap-4 px-7 pb-6 pt-9 text-center [--rise:0ms]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="Trip Chain" className="hero-logo-float h-14 w-auto drop-shadow-[0_0_18px_rgba(79,141,247,0.45)]" src="/tripchain-logo.svg" />
          <h2 className="break-keep text-[1.75rem] font-extrabold leading-9 tracking-tight text-foreground text-balance">{t("tourIntroTitle")}</h2>
          <p className="max-w-[17rem] break-keep text-base leading-7 text-muted-strong text-pretty">{t("tourIntroSubtitle")}</p>
          <button
            className="tour-primary mt-2 h-14 w-full rounded-full px-9 text-[1.0625rem] font-extrabold"
            onClick={onStart}
            type="button"
          >
            {t("tourStart")}
          </button>
          <button
            className="py-1.5 text-sm font-semibold text-muted transition hover:text-foreground"
            onClick={onSkip}
            type="button"
          >
            {t("tourSkip")}
          </button>
        </div>
      </div>
    );
  }

  const padding = 6;
  const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 400;
  const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 800;
  const placeBelow = rect ? rect.bottom + 170 < viewportHeight : true;
  const tooltipLeft = rect ? Math.max(20, Math.min(rect.left, viewportWidth - 340)) : 20;

  // The spotlight: a rounded window cut out of the frosted scrim. clip-path paths with the same
  // commands interpolate, so the window glides from one target to the next.
  const spot = rect
    ? (() => {
        const x = rect.left - padding;
        const y = rect.top - padding;
        const w = rect.width + padding * 2;
        const h = rect.height + padding * 2;
        const r = Math.min(36, h / 2, w / 2);
        const hole =
          `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}` +
          `H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
        return { x, y, w, h, r, clip: `path(evenodd, "M0 0H${viewportWidth}V${viewportHeight}H0Z${hole}")` };
      })()
    : null;

  return (
    <div className="fixed inset-0 z-[60]">
      <div
        className="tour-scrim fixed inset-0 transition-[clip-path] duration-300 ease-out"
        style={spot ? { clipPath: spot.clip, WebkitClipPath: spot.clip } : undefined}
      />

      {spot && (
        <div
          className="tour-ring pointer-events-none fixed transition-all duration-300 ease-out"
          style={{ top: spot.y, left: spot.x, width: spot.w, height: spot.h, borderRadius: spot.r }}
        />
      )}

      {rect && (
        <div
          className="tour-card fixed z-[61] w-[calc(100%-40px)] max-w-[21rem] p-5 transition-all duration-300"
          style={{
            left: tooltipLeft,
            top: placeBelow ? rect.bottom + 14 : undefined,
            bottom: placeBelow ? undefined : viewportHeight - rect.top + 14,
          }}
        >
          <div aria-label={`${stepIndex + 1} / ${TOUR_STEPS.length}`} className="flex items-center gap-1.5" role="img">
            {TOUR_STEPS.map((tourStep, index) => (
              <span className="tour-dot" data-active={index === stepIndex} key={tourStep.target} />
            ))}
          </div>
          <h3 className="mt-3 break-keep text-xl font-extrabold text-foreground text-balance">{t(step.titleKey)}</h3>
          <p className="mt-2 break-keep text-[0.9375rem] leading-6 text-muted-strong text-pretty">{t(step.descriptionKey)}</p>
          <div className="mt-4 flex items-center justify-between">
            <button
              className="py-2 text-sm font-semibold text-muted transition hover:text-foreground"
              onClick={onSkip}
              type="button"
            >
              {t("tourSkip")}
            </button>
            <div className="flex gap-2">
              {stepIndex > 0 && (
                <button
                  className="ios-btn rounded-full px-4 py-2.5 text-sm font-bold"
                  onClick={goPrev}
                  type="button"
                >
                  {t("tourPrev")}
                </button>
              )}
              <button
                className="tour-primary rounded-full px-5 py-2.5 text-sm font-bold"
                onClick={goNext}
                type="button"
              >
                {isLastStep ? t("tourFinish") : t("tourNext")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
