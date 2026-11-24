"use client";

import { createContext, useContext } from "react";
import { UserIcon } from "@/components/layout/app-icons";
import { useT } from "@/features/mobile/i18n/i18n-context";
import { cn } from "@/lib/utils";

// The signed-in person's profile picture (Google), or null. The app shell provides it, so the badge on any list or
// detail screen can show it without every screen passing it down.
export const MyPictureContext = createContext<string | null>(null);

// The round person mark used for "me" everywhere: the person's own profile picture when they are signed in (and have one), else the
// app's person icon in blue on frosted white. The white ring and the faint shadow keep its edge on a card and on a photo. The course
// badge and the side menu's profile box both use it, so they look the same.
export function ProfileAvatar({ className, iconClassName, label, picture }: { className?: string; iconClassName?: string; label?: string; picture: string | null }) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={cn(
        "inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-white/80 text-primary-strong shadow-[0_1px_3px_rgba(15,23,42,0.16)] ring-1 ring-black/10 backdrop-blur-md",
        className ?? "h-7 w-7",
      )}
      role={label ? "img" : undefined}
    >
      {picture ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" src={picture} />
      ) : (
        <UserIcon className={iconClassName ?? "h-4 w-4"} />
      )}
    </span>
  );
}

// Marks a course as the user's own: a small round badge (see ProfileAvatar), the same on the course list cards and over the detail
// screen's cover photo. Its accessible name is the spelled-out "내 코스" in the user's language.
export function MyBadge() {
  const t = useT();
  const picture = useContext(MyPictureContext);

  return <ProfileAvatar label={t("myCourseBadge")} picture={picture} />;
}
