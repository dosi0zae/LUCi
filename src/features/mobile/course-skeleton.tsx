"use client";

import { useEffect, useState } from "react";
import { AiSparklesIcon } from "@/components/layout/app-icons";
import { useT } from "@/features/mobile/i18n/i18n-context";

// Where the pretend stops drop onto the placeholder map, in the order they pop in. Each is the CENTRE of
// a dot (the dot is shifted back by half its size), and the x values are symmetric around 50 % so the
// group sits in the middle of the map.
const MARKER_SPOTS = [
  { left: "20%", top: "62%" },
  { left: "35%", top: "34%" },
  { left: "50%", top: "58%" },
  { left: "65%", top: "30%" },
  { left: "80%", top: "56%" },
];

// Shown while a course is being made (a few seconds): the card's own shape, shimmering, with a
// line that says what is happening and green dots popping onto the map one after another.
export function CourseSkeleton() {
  const t = useT();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => setStep((current) => (current + 1) % 3), 2200);
    return () => window.clearInterval(id);
  }, []);

  const steps = [t("generatingStep1"), t("generatingStep2"), t("generatingStep3")];

  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-3">
      <article className="ios-card course-skeleton-in p-5">
        <div className="flex items-center gap-2.5">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong">
            <AiSparklesIcon className="h-4 w-4 animate-pulse" />
          </span>
          <p className="step-swap break-keep text-[0.9375rem] font-bold text-muted-strong" key={step}>
            {steps[step]}
          </p>
        </div>

        <div className="skeleton mt-5 h-8 w-3/4 rounded-xl" />
        <div className="skeleton mt-2.5 h-8 w-1/2 rounded-xl" />
        <div className="skeleton mt-3.5 h-4 w-2/5 rounded-lg" />

        <div className="relative mt-5 h-48 overflow-hidden rounded-3xl">
          <div className="skeleton absolute inset-0" />
          {MARKER_SPOTS.map((spot, index) => (
            <span
              className="skeleton-marker absolute h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-[#b7e86b] shadow-[0_4px_12px_rgba(11,18,32,0.3)]"
              key={index}
              style={{ ...spot, animationDelay: `${500 + index * 380}ms` }}
            />
          ))}
        </div>
      </article>

      {[0, 1, 2].map((index) => (
        <div
          className="ios-row course-skeleton-in flex items-center gap-3 p-3"
          key={index}
          style={{ animationDelay: `${140 + index * 100}ms` }}
        >
          <div className="skeleton h-14 w-14 shrink-0 rounded-2xl" />
          <div className="grid flex-1 gap-2">
            <div className="skeleton h-4 w-2/3 rounded-lg" />
            <div className="skeleton h-3.5 w-1/3 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}
