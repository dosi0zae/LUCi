"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  CompassIcon,
  HomeIcon,
  LightbulbIcon,
  SearchIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { cn } from "@/lib/utils";
import {
  areaMeta,
  getPlaceById,
  getPlacesByIds,
  inferArea,
  placesByArea,
  promptExamples,
  seedFeedTrips,
  type AreaId,
  type FeedTrip,
  type MobilePlace,
  type TripVisibility,
} from "@/features/mobile/mobile-data";
import { ExploreMap } from "@/features/mobile/explore-map";
import { PlaceSheet } from "@/features/mobile/place-sheet";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { PublishSheet } from "@/features/mobile/publish-sheet";
import { TripDetailSheet } from "@/features/mobile/trip-detail-sheet";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { ProfileTab } from "@/features/mobile/profile-tab";

type TabId = "home" | "explore" | "ranking" | "profile";

const tabs: { id: TabId; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "홈", icon: HomeIcon },
  { id: "explore", label: "탐색", icon: CompassIcon },
  { id: "ranking", label: "랭킹", icon: TrophyIcon },
  { id: "profile", label: "프로필", icon: UserIcon },
];

export function MobileAppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("home");

  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [areaId, setAreaId] = useState<AreaId>("seongsu");
  const [chainIds, setChainIds] = useState<string[]>([]);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);

  const [publishedTrips, setPublishedTrips] = useState<FeedTrip[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [isSignedIn, setIsSignedIn] = useState(false);

  const [exploreView, setExploreView] = useState<"list" | "map">("list");
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreArea, setExploreArea] = useState<"all" | AreaId>("all");

  const hasResult = submittedPrompt.length > 0;
  const [exampleIndex, setExampleIndex] = useState(0);

  useEffect(() => {
    if (hasResult) {
      return;
    }

    const intervalId = window.setInterval(() => {
      setExampleIndex((current) => (current + 1) % promptExamples.length);
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, [hasResult]);

  const showBottomNav = activeTab !== "home" || hasResult;
  const area = areaMeta[areaId];
  const chainPlaces = useMemo(() => getPlacesByIds(chainIds), [chainIds]);
  const otherPlaces = placesByArea[areaId].filter((place) => !chainIds.includes(place.id));

  const allTrips = useMemo(() => [...publishedTrips, ...seedFeedTrips], [publishedTrips]);
  const selectedPlace = selectedPlaceId ? getPlaceById(selectedPlaceId) : null;
  const openTrip = allTrips.find((trip) => trip.id === openTripId) ?? null;

  const normalizedExploreQuery = exploreQuery.trim().toLowerCase();
  const exploreTrips = useMemo(
    () =>
      allTrips
        .filter((trip) => exploreArea === "all" || trip.areaId === exploreArea)
        .filter((trip) => {
          if (!normalizedExploreQuery) {
            return true;
          }
          const text = [trip.title, trip.description, trip.authorName, areaMeta[trip.areaId].name]
            .join(" ")
            .toLowerCase();
          return text.includes(normalizedExploreQuery);
        }),
    [allTrips, exploreArea, normalizedExploreQuery],
  );
  const exploreMapPlaces = exploreArea === "all" ? Object.values(placesByArea).flat() : placesByArea[exploreArea];
  const exploreMapCenter = exploreArea === "all" ? { lat: 37.5445, lng: 127.0 } : areaMeta[exploreArea].center;
  const exploreMapLevel = exploreArea === "all" ? 9 : 6;

  function startCourse(nextAreaId: AreaId, nextPrompt: string) {
    setSubmittedPrompt(nextPrompt);
    setAreaId(nextAreaId);
    setChainIds(placesByArea[nextAreaId].slice(0, 4).map((place) => place.id));
  }

  function recommend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextPrompt = prompt.trim() || "오늘 분위기에 맞는 코스를 추천해줘";
    startCourse(inferArea(nextPrompt), nextPrompt);
  }

  function chooseArea(nextAreaId: AreaId) {
    if (nextAreaId === areaId) {
      return;
    }
    startCourse(nextAreaId, submittedPrompt);
  }

  function moveStop(index: number, direction: -1 | 1) {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= chainIds.length) {
      return;
    }
    setChainIds((current) => {
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      return next;
    });
  }

  function removeStop(id: string) {
    setChainIds((current) => current.filter((placeId) => placeId !== id));
  }

  function addToChain(place: MobilePlace) {
    if (!hasResult) {
      setSubmittedPrompt(`${areaMeta[place.areaId].name}에서 발견한 장소로 시작한 코스`);
      setAreaId(place.areaId);
      setChainIds([place.id]);
      setSelectedPlaceId(null);
      return;
    }

    setChainIds((current) => (current.includes(place.id) ? current : [...current, place.id]));
    setSelectedPlaceId(null);
  }

  function handlePublish(input: { title: string; description: string; visibility: TripVisibility }) {
    const trip: FeedTrip = {
      id: `mine-${Date.now()}`,
      title: input.title,
      description: input.description,
      authorHandle: "you",
      authorName: "여행자님",
      areaId,
      visibility: input.visibility,
      placeIds: chainIds,
      likes: 0,
      comments: 0,
      saved: 0,
      rankScore: 70,
      isMine: true,
      publishedAt: new Date().toISOString().slice(0, 10),
    };

    setPublishedTrips((current) => [trip, ...current]);
    setShowPublish(false);
    setOpenTripId(trip.id);
    setPrompt("");
    setSubmittedPrompt("");
    setChainIds([]);
  }

  function toggleLike(id: string) {
    setLikedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSave(id: string) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const searchForm = (
    <form
      className="glass-panel flex min-h-14 items-center gap-2 rounded-xl p-2.5"
      onSubmit={recommend}
    >
      <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
      <input
        aria-label="원하는 코스 입력"
        className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted"
        onChange={(event) => setPrompt(event.target.value)}
        placeholder="원하는 체인을 말해보세요."
        type="search"
        value={prompt}
      />
      <button
        aria-label={prompt.trim() ? "이 문장으로 코스 검색" : "코스 자동 추천 받기"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-strong"
        title={prompt.trim() ? "검색" : "자동생성"}
        type="submit"
      >
        {prompt.trim() ? <ArrowRightIcon className="h-4 w-4" /> : <LightbulbIcon className="h-4 w-4" />}
      </button>
    </form>
  );

  return (
    <main className="min-h-screen bg-[#edf2f7] text-foreground">
      <section className="relative mx-auto flex h-[100svh] max-h-[900px] w-full max-w-[430px] flex-col overflow-hidden bg-background shadow-panel">
        <div className="min-h-0 flex-1 overflow-y-auto">
          {activeTab === "home" && (
            !hasResult ? (
              <div className="relative min-h-full">
                <div className="hero-blobs" aria-hidden="true">
                  <span
                    className="hero-blob hero-blob--a"
                    style={{
                      background: "var(--primary)",
                      height: 260,
                      left: -50,
                      opacity: 0.36,
                      top: 30,
                      width: 260,
                    }}
                  />
                  <span
                    className="hero-blob hero-blob--b"
                    style={{
                      background: "var(--warning)",
                      bottom: 150,
                      height: 220,
                      opacity: 0.4,
                      right: -40,
                      width: 220,
                    }}
                  />
                  <span
                    className="hero-blob hero-blob--c"
                    style={{
                      background: "var(--success)",
                      bottom: -30,
                      height: 240,
                      left: 10,
                      opacity: 0.34,
                      width: 240,
                    }}
                  />
                  <span
                    className="hero-blob hero-blob--d"
                    style={{
                      background: "var(--primary-strong)",
                      height: 190,
                      opacity: 0.28,
                      right: 0,
                      top: 80,
                      width: 190,
                    }}
                  />
                </div>

                <header className="absolute inset-x-0 top-0 z-10 px-5 pt-10 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Trip Chain" className="mx-auto block h-32 w-auto" src="/tripchain-logo.svg" />
                  <p className="-mt-3 text-xs font-extrabold tracking-wide text-primary">Beta</p>
                  <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-normal">
                    오늘은 어디로 갈까요?
                  </h1>
                  <p className="mx-auto mt-4 max-w-[310px] text-sm leading-6 text-muted">
                    성수, 홍대, 강남 중심으로 체인을 추천합니다.
                  </p>
                </header>

                <div className="absolute inset-x-0 top-1/2 z-10 -translate-y-1/2 px-5">
                  {searchForm}

                  <button
                    className="relative mt-7 block w-full text-center text-sm font-medium text-muted"
                    onClick={() => {
                      const example = promptExamples[exampleIndex];
                      setPrompt(example);
                      startCourse(inferArea(example), example);
                    }}
                    type="button"
                  >
                    <span className="example-rotator block" key={exampleIndex}>
                      “{promptExamples[exampleIndex]}”
                    </span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="relative flex min-h-full flex-col px-5 pb-24 pt-5">
                <header className="relative z-10 text-left">
                  <p className="text-xs font-extrabold text-primary">Trip Chain Beta</p>
                  <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-normal">
                    오늘은 어디로 갈까요?
                  </h1>
                </header>

                <div className="relative z-10 mt-7">{searchForm}</div>

              {hasResult && (
                <section className="mt-5 grid gap-4">
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {(Object.keys(areaMeta) as AreaId[]).map((id) => (
                      <button
                        className={cn(
                          "shrink-0 rounded-sm border border-border bg-surface px-3 py-2 text-sm font-extrabold text-muted-strong",
                          areaId === id && "border-primary bg-primary text-white",
                        )}
                        key={id}
                        onClick={() => chooseArea(id)}
                        type="button"
                      >
                        {areaMeta[id].name}
                      </button>
                    ))}
                  </div>

                  <article className="rounded-lg border border-border bg-surface p-4 shadow-soft">
                    <Badge tone="blue">AI 추천 코스</Badge>
                    <h2 className="mt-3 text-xl font-extrabold">{area.name} 중심 코스</h2>
                    <p className="mt-1 text-xs leading-5 text-muted">{area.coverage}</p>
                    <p className="mt-3 rounded-sm bg-surface-muted p-3 text-xs font-semibold leading-5 text-muted-strong">
                      “{submittedPrompt}”
                    </p>
                  </article>

                  <div className="grid gap-2">
                    {chainPlaces.map((place, index) => (
                      <article
                        className="rounded-lg border border-border bg-surface p-3 shadow-soft"
                        key={place.id}
                      >
                        <button
                          className="flex w-full items-center gap-3 text-left"
                          onClick={() => setSelectedPlaceId(place.id)}
                          type="button"
                        >
                          <span className="relative shrink-0">
                            <PlaceThumb category={place.category} size="lg" />
                            <span className="absolute -bottom-1 -left-1 grid h-5 w-5 place-items-center rounded-full bg-primary text-[10px] font-extrabold text-white ring-2 ring-background">
                              {index + 1}
                            </span>
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-primary">{place.category}</p>
                            <h3 className="truncate text-base font-extrabold">{place.name}</h3>
                            <p className="mt-1 text-xs text-muted">
                              {place.area} · {place.duration}
                            </p>
                          </div>
                        </button>
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          <button
                            className="h-9 rounded-sm border border-border text-xs font-extrabold disabled:opacity-35"
                            disabled={index === 0}
                            onClick={() => moveStop(index, -1)}
                            type="button"
                          >
                            위로
                          </button>
                          <button
                            className="h-9 rounded-sm border border-border text-xs font-extrabold disabled:opacity-35"
                            disabled={index === chainPlaces.length - 1}
                            onClick={() => moveStop(index, 1)}
                            type="button"
                          >
                            아래로
                          </button>
                          <button
                            className="h-9 rounded-sm border border-border text-xs font-extrabold text-danger"
                            onClick={() => removeStop(place.id)}
                            type="button"
                          >
                            삭제
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>

                  {otherPlaces.length > 0 && (
                    <div>
                      <h3 className="text-sm font-extrabold text-muted-strong">
                        {area.name}의 다른 장소
                      </h3>
                      <div className="mt-2 grid gap-2">
                        {otherPlaces.map((place) => (
                          <button
                            className="flex items-center gap-3 rounded-sm border border-border bg-surface px-3 py-2.5 text-left"
                            key={place.id}
                            onClick={() => setSelectedPlaceId(place.id)}
                            type="button"
                          >
                            <PlaceThumb category={place.category} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">{place.name}</span>
                              <span className="block text-xs text-muted">
                                {place.category} · {place.area}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs font-extrabold text-primary">담기</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <Button
                    disabled={chainPlaces.length < 2}
                    onClick={() => setShowPublish(true)}
                  >
                    코스 확정하기 ({chainPlaces.length}곳)
                  </Button>
                </section>
              )}
              </div>
            )
          )}

          {activeTab === "explore" && (
            <div className="flex h-full min-h-full flex-col px-5 py-4">
              <h1 className="text-xl font-extrabold">탐색</h1>
              <p className="mt-1 text-xs text-muted">성수, 홍대, 강남에서 발견한 코스와 장소들이에요.</p>

              <div className="glass-panel mt-4 flex h-11 items-center gap-2 rounded-lg px-3">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                <input
                  aria-label="코스 검색"
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted"
                  onChange={(event) => setExploreQuery(event.target.value)}
                  placeholder="코스, 장소, 지역으로 검색"
                  type="search"
                  value={exploreQuery}
                />
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="flex flex-1 gap-1.5 overflow-x-auto">
                  {(["all", "seongsu", "hongdae", "gangnam"] as const).map((id) => (
                    <button
                      className={cn(
                        "shrink-0 rounded-sm border border-border bg-surface px-3 py-1.5 text-xs font-extrabold text-muted-strong",
                        exploreArea === id && "border-primary bg-primary text-white",
                      )}
                      key={id}
                      onClick={() => setExploreArea(id)}
                      type="button"
                    >
                      {id === "all" ? "전체" : areaMeta[id].name}
                    </button>
                  ))}
                </div>
                <div className="flex shrink-0 rounded-sm border border-border bg-surface p-0.5 text-xs font-extrabold">
                  {(["list", "map"] as const).map((mode) => (
                    <button
                      className={cn(
                        "rounded-xs px-2.5 py-1.5 text-muted-strong",
                        exploreView === mode && "bg-primary text-white",
                      )}
                      key={mode}
                      onClick={() => setExploreView(mode)}
                      type="button"
                    >
                      {mode === "list" ? "리스트" : "지도"}
                    </button>
                  ))}
                </div>
              </div>

              {exploreView === "list" ? (
                <div className="mt-4 pb-4">
                  <TripFeedList
                    emptyLabel="검색 조건에 맞는 코스가 없어요."
                    likedIds={likedIds}
                    mode="explore"
                    onOpenTrip={(trip) => setOpenTripId(trip.id)}
                    onToggleLike={toggleLike}
                    onToggleSave={toggleSave}
                    savedIds={savedIds}
                    trips={exploreTrips}
                  />
                </div>
              ) : (
                <div className="mt-4 min-h-[360px] flex-1 pb-4">
                  <ExploreMap
                    center={exploreMapCenter}
                    level={exploreMapLevel}
                    onSelectPlace={(place) => setSelectedPlaceId(place.id)}
                    places={exploreMapPlaces}
                    selectedPlaceId={selectedPlaceId}
                  />
                </div>
              )}
            </div>
          )}

          {activeTab === "ranking" && (
            <div className="px-5 py-4">
              <h1 className="text-xl font-extrabold">주간 랭킹</h1>
              <p className="mt-1 text-xs text-muted">가장 많이 저장된 코스 순서예요.</p>
              <div className="mt-4">
                <TripFeedList
                  emptyLabel="아직 랭킹 데이터가 없어요."
                  likedIds={likedIds}
                  mode="ranking"
                  onOpenTrip={(trip) => setOpenTripId(trip.id)}
                  onToggleLike={toggleLike}
                  onToggleSave={toggleSave}
                  savedIds={savedIds}
                  trips={allTrips}
                />
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <ProfileTab
              isSignedIn={isSignedIn}
              likedIds={likedIds}
              myTrips={publishedTrips}
              onOpenTrip={(trip) => setOpenTripId(trip.id)}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onToggleSignIn={() => setIsSignedIn((current) => !current)}
              savedCount={savedIds.size}
              savedIds={savedIds}
            />
          )}
        </div>

        {showBottomNav && (
          <nav className="nav-pop-in grid shrink-0 grid-cols-4 border-t border-border bg-surface/95">
            {tabs.map(({ icon: Icon, id, label }) => (
              <button
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs font-bold text-muted",
                  activeTab === id && "text-primary",
                )}
                key={id}
                onClick={() => setActiveTab(id)}
                type="button"
              >
                <Icon className="h-5 w-5" />
                {label}
              </button>
            ))}
          </nav>
        )}

        {selectedPlace && (
          <PlaceSheet
            isInChain={chainIds.includes(selectedPlace.id)}
            onAddToChain={addToChain}
            onClose={() => setSelectedPlaceId(null)}
            place={selectedPlace}
          />
        )}

        {showPublish && (
          <PublishSheet
            onCancel={() => setShowPublish(false)}
            onPublish={handlePublish}
            places={chainPlaces}
          />
        )}

        {openTrip && (
          <TripDetailSheet
            isLiked={likedIds.has(openTrip.id)}
            isSaved={savedIds.has(openTrip.id)}
            onClose={() => setOpenTripId(null)}
            onToggleLike={toggleLike}
            onToggleSave={toggleSave}
            trip={openTrip}
          />
        )}
      </section>
    </main>
  );
}
