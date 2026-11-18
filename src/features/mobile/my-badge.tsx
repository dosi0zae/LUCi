"use client";

import { createContext, useContext } from "react";
import { UserIcon } from "@/components/layout/app-icons";
import { useT } from "@/features/mobile/i18n/i18n-context";

// The signed-in person's profile picture (Google), or null. The app shell provides it, so the badge on any list or
// detail screen can show it without every screen passing it down.
export const MyPictureContext = createContext<string | null>(null);

// Marks a course as the user's own: a small round badge with the person's own profile picture when they are signed in
// (and have one), else the app's person icon in blue on frosted white, the same family as the round glass buttons. The
// same on the course list cards and over the detail screen's cover photo; the white ring and the faint shadow keep its
// edge on a card and on a photo. Its accessible name is the spelled-out "내 코스" in the user's language.
export function MyBadge() {
  const t = useT();
  const picture = useContext(MyPictureContext);

  return (
    <span
      aria-label={t("myCourseBadge")}
      className="inline-grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full bg-white/80 text-primary-strong shadow-[0_1px_3px_rgba(15,23,42,0.16)] ring-1 ring-black/10 backdrop-blur-md"
      role="img"
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={picture} />
      ) : (
        <UserIcon className="h-4 w-4" />
      )}
    </span>
  );
}
