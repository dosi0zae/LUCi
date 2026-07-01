"use client";

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  draftToFeedTrip,
  FeedTrip,
  getAdminMetrics,
  rankTrips,
  seedTrips,
  seedUsers,
} from "./local-database";
import { TripDraft } from "./trip-draft";

type CommunityTab = "explore" | "profile" | "social" | "ranking" | "admin";

type CommunityHubProps = {
  latestDraft: TripDraft | null;
  onClose: () => void;
};

const tabs: Array<{ id: CommunityTab; label: string }> = [
  { id: "explore", label: "탐색" },
  { id: "profile", label: "프로필" },
  { id: "social", label: "소셜" },
  { id: "ranking", label: "랭킹" },
  { id: "admin", label: "관리" },
];

function toggleValue(values: string[], value: string) {
  return values.includes(value)
    ? values.filter((currentValue) => currentValue !== value)
    : [...values, value];
}

export function CommunityHub({ latestDraft, onClose }: CommunityHubProps) {
  const [activeTab, setActiveTab] = useState<CommunityTab>("explore");
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  const [followedAuthors, setFollowedAuthors] = useState<string[]>(["mina.route"]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [likedIds, setLikedIds] = useState<string[]>([]);

  const trips = useMemo<FeedTrip[]>(() => {
    if (!latestDraft) {
      return seedTrips;
    }

    return [draftToFeedTrip(latestDraft), ...seedTrips];
  }, [latestDraft]);
  const adminMetrics = getAdminMetrics(trips);
  const rankingTrips = rankTrips(trips);

  return (
    <div className="absolute inset-0 z-50 overflow-auto bg-background text-foreground">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/92 px-4 py-3 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-primary">Community MVP</p>
            <h1 className="text-lg font-bold">Trip Chain 탐색</h1>
          </div>
          <Button onClick={onClose} size="sm" variant="secondary">
            지도로 돌아가기
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-5">
        <div className="glass-panel grid grid-cols-5 gap-1 rounded-lg p-1">
          {tabs.map((tab) => (
            <button
              className={cn(
                "h-10 rounded-sm text-sm font-bold text-muted transition hover:bg-surface-muted",
                activeTab === tab.id && "bg-primary text-white shadow-soft hover:bg-primary",
              )}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "explore" && (
          <section className="mt-5 grid gap-3 lg:grid-cols-3">
            {trips.map((trip) => (
              <TripFeedCard
                isBookmarked={bookmarkedIds.includes(trip.id)}
                isLiked={likedIds.includes(trip.id)}
                key={trip.id}
                onBookmark={() => setBookmarkedIds((values) => toggleValue(values, trip.id))}
                onLike={() => setLikedIds((values) => toggleValue(values, trip.id))}
                trip={trip}
              />
            ))}
          </section>
        )}

        {activeTab === "profile" && (
          <section className="mt-5 rounded-lg border border-border bg-surface p-5 shadow-soft">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <Badge tone={isSignedIn ? "green" : "amber"}>
                  {isSignedIn ? "로그인됨" : "게스트"}
                </Badge>
                <h2 className="mt-3 text-2xl font-bold">
                  {isSignedIn ? "cheil.trips" : "게스트 여행자"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-muted">
                  인증은 mock 상태입니다. 실제 OAuth와 세션은 데이터베이스 연동 이후 연결합니다.
                </p>
              </div>
              <Button onClick={() => setIsSignedIn((value) => !value)}>
                {isSignedIn ? "로그아웃" : "카카오로 시작"}
              </Button>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {[
                ["발행", latestDraft ? "1" : "0"],
                ["저장", String(bookmarkedIds.length)],
                ["좋아요", String(likedIds.length)],
                ["팔로잉", String(followedAuthors.length)],
              ].map(([label, value]) => (
                <div className="rounded-sm bg-surface-muted p-4" key={label}>
                  <p className="text-xs font-semibold text-muted">{label}</p>
                  <p className="mt-1 text-2xl font-bold">{value}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {activeTab === "social" && (
          <section className="mt-5 grid gap-3 lg:grid-cols-2">
            {seedUsers.map((user) => (
              <article className="rounded-lg border border-border bg-surface p-4 shadow-soft" key={user.id}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-bold">@{user.handle}</h2>
                    <p className="mt-1 text-sm text-muted">{user.displayName}</p>
                  </div>
                  <Button
                    onClick={() => setFollowedAuthors((values) => toggleValue(values, user.handle))}
                    size="sm"
                    variant={followedAuthors.includes(user.handle) ? "primary" : "secondary"}
                  >
                    {followedAuthors.includes(user.handle) ? "팔로잉" : "팔로우"}
                  </Button>
                </div>
                <div className="mt-4 rounded-sm bg-surface-muted p-3 text-sm leading-6 text-muted-strong">
                  발행 {user.publishedTrips}개 · 팔로워 {user.followers.toLocaleString()}명 · 팔로잉{" "}
                  {user.following}명
                </div>
              </article>
            ))}
          </section>
        )}

        {activeTab === "ranking" && (
          <section className="mt-5 rounded-lg border border-border bg-surface p-5 shadow-soft">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Badge tone="blue">랭킹</Badge>
                <h2 className="mt-3 text-2xl font-bold">이번 주 인기 체인</h2>
              </div>
              <p className="text-sm font-semibold text-muted">저장, 좋아요, 완주율 기반 seed 점수</p>
            </div>
            <ol className="mt-5 grid gap-2">
              {rankingTrips.map((trip, index) => (
                <li className="flex items-center gap-3 rounded-sm bg-surface-muted p-3" key={trip.id}>
                  <span className="grid h-9 w-9 place-items-center rounded-xs bg-primary text-sm font-bold text-white">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{trip.title}</p>
                    <p className="truncate text-sm text-muted">@{trip.author}</p>
                  </div>
                  <strong className="text-lg">{trip.rankScore}</strong>
                </li>
              ))}
            </ol>
          </section>
        )}

        {activeTab === "admin" && (
          <section className="mt-5 grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="rounded-lg border border-border bg-surface p-5 shadow-soft">
              <Badge tone="amber">Admin</Badge>
              <h2 className="mt-3 text-2xl font-bold">운영 대시보드</h2>
              <p className="mt-2 text-sm leading-6 text-muted">
                현재는 로컬 seed 데이터 기반의 관리자 화면입니다. 신고, 발행량, 저장량을 빠르게 점검합니다.
              </p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {[
                  ["발행된 체인", adminMetrics.publishedTrips],
                  ["활성 사용자", adminMetrics.activeUsers],
                  ["전체 저장", adminMetrics.savedTrips],
                  ["댓글", adminMetrics.comments],
                  ["검토 신고", adminMetrics.reports],
                ].map(([label, value]) => (
                  <div className="rounded-sm bg-surface-muted p-4" key={label}>
                    <p className="text-xs font-semibold text-muted">{label}</p>
                    <p className="mt-1 text-2xl font-bold">{value}</p>
                  </div>
                ))}
              </div>
            </div>
            <aside className="rounded-lg border border-border bg-surface p-4 shadow-soft">
              <h3 className="text-lg font-bold">검토 큐</h3>
              <div className="mt-4 grid gap-2">
                {["중복 장소 제보", "운영 종료 팝업", "부적절한 설명"].map((item, index) => (
                  <div className="rounded-sm bg-surface-muted p-3" key={item}>
                    <p className="text-sm font-bold">{item}</p>
                    <p className="mt-1 text-xs text-muted">우선순위 {index + 1}</p>
                  </div>
                ))}
              </div>
            </aside>
          </section>
        )}
      </main>
    </div>
  );
}

function TripFeedCard({
  isBookmarked,
  isLiked,
  onBookmark,
  onLike,
  trip,
}: {
  isBookmarked: boolean;
  isLiked: boolean;
  onBookmark: () => void;
  onLike: () => void;
  trip: FeedTrip;
}) {
  return (
    <article className="rounded-lg border border-border bg-surface p-4 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Badge tone={trip.author === "you" ? "blue" : "neutral"}>@{trip.author}</Badge>
          <h2 className="mt-3 text-lg font-bold leading-snug">{trip.title}</h2>
        </div>
        <span className="rounded-xs bg-primary-soft px-2 py-1 text-xs font-bold text-primary-strong">
          {trip.places}곳
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1">
        {trip.tags.map((tag) => (
          <span className="rounded-xs bg-surface-muted px-2 py-1 text-xs font-semibold text-muted" key={tag}>
            #{tag}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
        <div className="rounded-sm bg-surface-muted p-2">
          <strong>{trip.totalMinutes}</strong>
          <p className="text-xs text-muted">분</p>
        </div>
        <div className="rounded-sm bg-surface-muted p-2">
          <strong>{trip.likes + (isLiked ? 1 : 0)}</strong>
          <p className="text-xs text-muted">좋아요</p>
        </div>
        <div className="rounded-sm bg-surface-muted p-2">
          <strong>{trip.saved + (isBookmarked ? 1 : 0)}</strong>
          <p className="text-xs text-muted">저장</p>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button onClick={onLike} size="sm" variant={isLiked ? "primary" : "secondary"}>
          좋아요
        </Button>
        <Button onClick={onBookmark} size="sm" variant={isBookmarked ? "primary" : "secondary"}>
          저장
        </Button>
      </div>
    </article>
  );
}
