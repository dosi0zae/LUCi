"use client";

import { Button } from "@/components/ui/button";
import { UserIcon } from "@/components/layout/app-icons";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import type { FeedTrip } from "@/features/mobile/mobile-data";

type ProfileTabProps = {
  isSignedIn: boolean;
  onToggleSignIn: () => void;
  myTrips: FeedTrip[];
  savedCount: number;
  likedIds: Set<string>;
  savedIds: Set<string>;
  onOpenTrip: (trip: FeedTrip) => void;
  onToggleLike: (id: string) => void;
  onToggleSave: (id: string) => void;
};

export function ProfileTab({
  isSignedIn,
  likedIds,
  myTrips,
  onOpenTrip,
  onToggleLike,
  onToggleSave,
  onToggleSignIn,
  savedCount,
  savedIds,
}: ProfileTabProps) {
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
          ["만든 코스", myTrips.length],
          ["저장", savedCount],
          ["팔로워", 12],
        ].map(([label, value]) => (
          <div className="rounded-sm border border-border bg-surface p-3 text-center" key={label}>
            <p className="text-lg font-extrabold">{value}</p>
            <p className="mt-0.5 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <h3 className="mt-6 text-sm font-extrabold text-muted-strong">내가 만든 코스</h3>
      <div className="mt-2.5">
        <TripFeedList
          emptyLabel="아직 만든 코스가 없어요. 홈에서 코스를 확정해보세요."
          likedIds={likedIds}
          mode="explore"
          onOpenTrip={onOpenTrip}
          onToggleLike={onToggleLike}
          onToggleSave={onToggleSave}
          savedIds={savedIds}
          trips={myTrips}
        />
      </div>
    </div>
  );
}
