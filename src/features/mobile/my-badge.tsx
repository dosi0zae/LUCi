"use client";

import { useT } from "@/features/mobile/i18n/i18n-context";

// Marks a course as the user's own: a small frosted "MY" pill with blue letters, the same family as the app's round
// glass buttons. The same on the course list cards and over the detail screen's cover photo; the hairline ring and
// the faint shadow keep its edge on a white card, the frosting keeps it readable on a photo. Its accessible name stays
// the spelled-out "내 코스" in the user's language.
export function MyBadge() {
  const t = useT();

  return (
    <span
      aria-label={t("myCourseBadge")}
      className="inline-flex h-6 shrink-0 items-center rounded-full bg-white/80 px-2.5 text-[0.6875rem] font-extrabold tracking-[0.05em] text-primary-strong shadow-[0_1px_3px_rgba(15,23,42,0.16)] ring-1 ring-black/10 backdrop-blur-md"
    >
      MY
    </span>
  );
}
