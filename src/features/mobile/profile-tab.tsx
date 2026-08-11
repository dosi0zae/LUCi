"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { UserIcon } from "@/components/layout/app-icons";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import type { FeedTrip } from "@/features/mobile/mobile-data";
import { cn } from "@/lib/utils";

type ProfileTabProps = {
  isSignedIn: boolean;
  onToggleSignIn: () => void;
  myTrips: FeedTrip[];
  savedTrips: FeedTrip[];
  recentlyViewedTrips: FeedTrip[];
  likedIds: Set<string>;
  savedIds: Set<string>;
  onOpenTrip: (trip: FeedTrip) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

type ProfileSubTab = "mine" | "saved" | "recent";

export function ProfileTab({
  isSignedIn,
  likedIds,
  myTrips,
  onOpenTrip,
  onToggleLike,
  onToggleSave,
  onToggleSignIn,
  recentlyViewedTrips,
  savedIds,
  savedTrips,
}: ProfileTabProps) {
  const [subTab, setSubTab] = useState<ProfileSubTab>("mine");

  if (!isSignedIn) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-muted text-muted">
          <UserIcon className="h-7 w-7" />
        </span>
        <h2 className="text-lg font-extrabold">로그인하고 내 코스를 관리해보세요</h2>
        <p className="max-w-[260px] text-sm text-muted">
          지금은 목업 로그인이라 실제 계정 없이 체험할 수 있어요.
        </p>
        <Button onClick={onToggleSignIn}>카카오로 시작하기 (목업)</Button>
      </div>
    );
  }

  const subTabs: { id: ProfileSubTab; label: string; trips: FeedTrip[]; emptyLabel: string }[] = [
    {
      id: "mine",
      label: "만든 코스",
      trips: myTrips,
      emptyLabel: "아직 만든 코스가 없어요. 홈에서 코스를 확정해보세요.",
    },
    {
      id: "saved",
      label: "저장한 코스",
      trips: savedTrips,
      emptyLabel: "아직 저장한 코스가 없어요. 탐색이나 랭킹에서 마음에 드는 코스를 저장해보세요.",
    },
    {
      id: "recent",
      label: "최근 본 코스",
      trips: recentlyViewedTrips,
      emptyLabel: "아직 살펴본 코스가 없어요.",
    },
  ];
  const activeSubTab = subTabs.find((tab) => tab.id === subTab) ?? subTabs[0];

  return (
    <div className="px-5 py-4">
      <div className="flex items-center gap-3">
        <span className="grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary-strong">
          <UserIcon className="h-7 w-7" />
        </span>
        <div className="min-w-0">
          <h2 className="truncate text-lg font-extrabold">여행자님</h2>
          <p className="text-xs text-muted">@trip.chain.user</p>
        </div>
        <Button className="ml-auto" onClick={onToggleSignIn} size="sm" variant="secondary">
          로그아웃
        </Button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          { label: "만든 코스", value: myTrips.length, onClick: () => setSubTab("mine") },
          { label: "저장", value: savedTrips.length, onClick: () => setSubTab("saved") },
          { label: "팔로워", value: 12, onClick: undefined },
        ].map(({ label, onClick, value }) => (
          <button
            className="rounded-sm border border-border bg-surface p-3 text-center transition hover:border-primary"
            disabled={!onClick}
            key={label}
            onClick={onClick}
            type="button"
          >
            <p className="text-lg font-extrabold">{value}</p>
            <p className="mt-0.5 text-xs text-muted">{label}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 flex gap-1.5">
        {subTabs.map((tab) => (
          <button
            className={cn(
              "rounded-full px-3.5 py-1.5 text-xs font-extrabold transition",
              tab.id === subTab
                ? "bg-primary text-white"
                : "border border-border bg-surface text-muted-strong",
            )}
            key={tab.id}
            onClick={() => setSubTab(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="mt-3">
        <TripFeedList
          emptyLabel={activeSubTab.emptyLabel}
          likedIds={likedIds}
          mode="explore"
          onOpenTrip={onOpenTrip}
          onToggleLike={onToggleLike}
          onToggleSave={onToggleSave}
          savedIds={savedIds}
          trips={activeSubTab.trips}
        />
      </div>
    </div>
  );
}
