"use client";

import { FormEvent, PointerEvent as ReactPointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CompassIcon,
  GripIcon,
  HomeIcon,
  LightbulbIcon,
  LocateIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { cn } from "@/lib/utils";
import {
  areaMeta,
  getPlaceById,
  getPlaceImageUrl,
  getPlacesByIds,
  inferArea,
  nearestAreaId,
  placesByArea,
  promptExamples,
  seedFeedTrips,
  type AreaId,
  type FeedTrip,
  type MobilePlace,
  type PlaceCategory,
  type TripVisibility,
} from "@/features/mobile/mobile-data";
import { CategorySheet } from "@/features/mobile/category-sheet";
import { ConstellationCard } from "@/features/mobile/constellation-card";
import { CreatorProfileSheet } from "@/features/mobile/creator-profile-sheet";
import { ExploreMap } from "@/features/mobile/explore-map";
import { loadKakaoMaps } from "@/features/mobile/kakao-loader";
import { OnboardingTour } from "@/features/mobile/onboarding-tour";
import { PlaceSheet } from "@/features/mobile/place-sheet";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { PublishSheet } from "@/features/mobile/publish-sheet";
import { buildChain } from "@/features/mobile/recommend-engine";
import { TripDetailSheet } from "@/features/mobile/trip-detail-sheet";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { ProfileTab } from "@/features/mobile/profile-tab";

type TabId = "home" | "explore" | "ranking" | "profile";

const OTHER_PLACES_PER_CATEGORY = 3;
const CATEGORY_ORDER: PlaceCategory[] = ["카페", "팝업", "전시", "산책"];
const PROFILE_STORAGE_KEY = "tripchain:profile";
const RECENTLY_VIEWED_LIMIT = 10;
const TUTORIAL_STORAGE_KEY = "tripchain:tutorialSeen";

const tabs: { id: TabId; label: string; icon: typeof HomeIcon }[] = [
  { id: "home", label: "홈", icon: HomeIcon },
  { id: "explore", label: "탐색", icon: CompassIcon },
  { id: "ranking", label: "랭킹", icon: TrophyIcon },
  { id: "profile", label: "프로필", icon: UserIcon },
];

export function MobileAppShell() {
  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [tourPhase, setTourPhase] = useState<"hidden" | "intro" | "steps">("hidden");

  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [areaId, setAreaId] = useState<AreaId>("seongsu");
  const [chainIds, setChainIds] = useState<string[]>([]);
  const [draggingChainId, setDraggingChainId] = useState<string | null>(null);
  const dragStateRef = useRef<{ id: string } | null>(null);
  const chainListRef = useRef<HTMLDivElement | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [viewingCategory, setViewingCategory] = useState<PlaceCategory | null>(null);
  const [viewingAuthorHandle, setViewingAuthorHandle] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);

  const [publishedTrips, setPublishedTrips] = useState<FeedTrip[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [likedMenuIds, setLikedMenuIds] = useState<Set<string>>(new Set());
  const [recentlyViewedTripIds, setRecentlyViewedTripIds] = useState<string[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const [exploreView, setExploreView] = useState<"list" | "map">("list");
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreArea, setExploreArea] = useState<"all" | AreaId>("all");

  const [rankingPeriod, setRankingPeriod] = useState<"weekly" | "live">("weekly");
  const [rankingArea, setRankingArea] = useState<"all" | AreaId>("all");

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

  useEffect(() => {
    // Warm up the Kakao SDK while the user is still on the search screen, so the
    // constellation map is ready by the time a course appears instead of flashing
    // the abstract fallback while the script loads.
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
    if (appKey) {
      loadKakaoMaps(appKey).catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    try {
      if (!window.localStorage.getItem(TUTORIAL_STORAGE_KEY)) {
        // One-time check on mount, not a reactive sync loop.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTourPhase("intro");
      }
    } catch {
      // Storage unavailable — just skip the tutorial rather than block the app.
    }
  }, []);

  function startTour() {
    setActiveTab("home");
    setTourPhase("steps");
  }

  function endTour() {
    setTourPhase("hidden");
    setActiveTab("home");
    try {
      window.localStorage.setItem(TUTORIAL_STORAGE_KEY, "1");
    } catch {
      // Storage unavailable — the tutorial will just show again next visit.
    }
  }

  const hasLoadedProfileRef = useRef(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          isSignedIn?: boolean;
          publishedTrips?: FeedTrip[];
          likedIds?: string[];
          savedIds?: string[];
          likedMenuIds?: string[];
          recentlyViewedTripIds?: string[];
        };

        // One-time hydration from localStorage on mount, not a reactive sync loop.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (parsed.isSignedIn) setIsSignedIn(true);
        if (Array.isArray(parsed.publishedTrips)) setPublishedTrips(parsed.publishedTrips);
        if (Array.isArray(parsed.likedIds)) setLikedIds(new Set(parsed.likedIds));
        if (Array.isArray(parsed.savedIds)) setSavedIds(new Set(parsed.savedIds));
        if (Array.isArray(parsed.likedMenuIds)) setLikedMenuIds(new Set(parsed.likedMenuIds));
        if (Array.isArray(parsed.recentlyViewedTripIds)) {
          setRecentlyViewedTripIds(parsed.recentlyViewedTripIds);
        }
        /* eslint-enable react-hooks/set-state-in-effect */
      }
    } catch {
      // Malformed or unavailable storage — just start fresh.
    } finally {
      hasLoadedProfileRef.current = true;
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedProfileRef.current) {
      return;
    }
    try {
      window.localStorage.setItem(
        PROFILE_STORAGE_KEY,
        JSON.stringify({
          isSignedIn,
          publishedTrips,
          likedIds: [...likedIds],
          savedIds: [...savedIds],
          likedMenuIds: [...likedMenuIds],
          recentlyViewedTripIds,
        }),
      );
    } catch {
      // Storage may be unavailable (private mode, quota) — persistence is best-effort.
    }
  }, [isSignedIn, publishedTrips, likedIds, savedIds, likedMenuIds, recentlyViewedTripIds]);

  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendReason, setRecommendReason] = useState<string | null>(null);
  const [isAiCourse, setIsAiCourse] = useState(false);

  const showBottomNav = activeTab !== "home" || hasResult || tourPhase === "steps";
  const area = areaMeta[areaId];
  const chainPlaces = useMemo(() => getPlacesByIds(chainIds), [chainIds]);
  const otherPlacesByCategory = useMemo(() => {
    const remaining = placesByArea[areaId].filter((place) => !chainIds.includes(place.id));
    const byCategory = new Map<PlaceCategory, MobilePlace[]>();

    for (const place of remaining) {
      const bucket = byCategory.get(place.category) ?? [];
      bucket.push(place);
      byCategory.set(place.category, bucket);
    }

    return CATEGORY_ORDER.map((category) => ({
      category,
      places: (byCategory.get(category) ?? [])
        .sort((a, b) => b.savedBy - a.savedBy)
        .slice(0, OTHER_PLACES_PER_CATEGORY),
    })).filter((group) => group.places.length > 0);
  }, [areaId, chainIds]);

  const viewingCategoryPlaces = useMemo(() => {
    if (!viewingCategory) {
      return [];
    }
    return placesByArea[areaId]
      .filter((place) => place.category === viewingCategory && !chainIds.includes(place.id))
      .sort((a, b) => b.savedBy - a.savedBy);
  }, [areaId, chainIds, viewingCategory]);

  const allTrips = useMemo(() => [...publishedTrips, ...seedFeedTrips], [publishedTrips]);
  const savedTrips = useMemo(
    () => allTrips.filter((trip) => savedIds.has(trip.id)),
    [allTrips, savedIds],
  );
  const recentlyViewedTrips = useMemo(
    () =>
      recentlyViewedTripIds
        .map((id) => allTrips.find((trip) => trip.id === id))
        .filter((trip): trip is FeedTrip => Boolean(trip)),
    [allTrips, recentlyViewedTripIds],
  );
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
  const exploreMapLevel = exploreArea === "all" ? 9 : 7;

  const rankingTrips = useMemo(() => {
    const filtered = allTrips.filter(
      (trip) => rankingArea === "all" || trip.areaId === rankingArea,
    );

    if (rankingPeriod === "live") {
      return [...filtered].sort(
        (a, b) => b.likes + b.saved + b.comments - (a.likes + a.saved + a.comments),
      );
    }

    return [...filtered].sort((a, b) => b.rankScore - a.rankScore);
  }, [allTrips, rankingArea, rankingPeriod]);

  function startCourse(nextAreaId: AreaId, nextPrompt: string) {
    const { placeIds } = buildChain({
      areaId: nextAreaId,
      categories: [],
      attributes: [],
      placeCount: 4,
    });

    setSubmittedPrompt(nextPrompt);
    setAreaId(nextAreaId);
    setChainIds(placeIds);
    setRecommendReason(null);
    setIsAiCourse(false);
  }

  async function startCourseFromPrompt(nextPrompt: string) {
    setIsRecommending(true);
    setRecommendReason(null);
    setIsAiCourse(true);

    try {
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt }),
      });

      if (!response.ok) {
        throw new Error("recommend request failed");
      }

      const data = await response.json();
      const isValidArea = (Object.keys(areaMeta) as AreaId[]).includes(data.areaId);

      if (!isValidArea || !Array.isArray(data.placeIds) || data.placeIds.length === 0) {
        throw new Error("recommend response malformed");
      }

      setAreaId(data.areaId);
      setChainIds(data.placeIds);
      setRecommendReason(typeof data.reason === "string" ? data.reason : null);
      setSubmittedPrompt(nextPrompt);
    } catch {
      const fallbackAreaId = inferArea(nextPrompt);
      const { placeIds } = buildChain({
        areaId: fallbackAreaId,
        categories: [],
        attributes: [],
        placeCount: 4,
      });
      setAreaId(fallbackAreaId);
      setChainIds(placeIds);
      setSubmittedPrompt(nextPrompt);
    } finally {
      setIsRecommending(false);
    }
  }

  function recommend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextPrompt = prompt.trim() || "오늘 분위기에 맞는 코스를 추천해줘";
    void startCourseFromPrompt(nextPrompt);
  }

  function chooseArea(nextAreaId: AreaId) {
    if (nextAreaId === areaId) {
      return;
    }
    startCourse(nextAreaId, submittedPrompt);
  }

  function refreshCourse() {
    if (isAiCourse) {
      void startCourseFromPrompt(submittedPrompt);
      return;
    }
    startCourse(areaId, submittedPrompt);
  }

  function locateNearestArea() {
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearest = nearestAreaId({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        startCourse(nearest, "내 주변 코스");
        setIsLocating(false);
      },
      () => {
        setIsLocating(false);
      },
      { timeout: 8000 },
    );
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

  function reorderChainTo(id: string, toIndex: number) {
    setChainIds((current) => {
      const fromIndex = current.indexOf(id);
      if (fromIndex === -1 || fromIndex === toIndex) {
        return current;
      }
      const next = [...current];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function handleChainDragStart(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = { id };
    setDraggingChainId(id);
  }

  function handleChainDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    const container = chainListRef.current;
    if (!dragState || !container) {
      return;
    }

    const cards = [...container.querySelectorAll<HTMLElement>("[data-chain-id]")];
    let targetIndex = cards.length - 1;

    for (let i = 0; i < cards.length; i++) {
      const rect = cards[i].getBoundingClientRect();
      if (event.clientY < rect.top + rect.height / 2) {
        targetIndex = i;
        break;
      }
    }

    reorderChainTo(dragState.id, targetIndex);
  }

  function handleChainDragEnd() {
    dragStateRef.current = null;
    setDraggingChainId(null);
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
    setRecommendReason(null);
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

  function toggleMenuLike(key: string) {
    setLikedMenuIds((current) => {
      const next = new Set(current);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }

  function viewTrip(trip: FeedTrip) {
    setRecentlyViewedTripIds((current) =>
      [trip.id, ...current.filter((id) => id !== trip.id)].slice(0, RECENTLY_VIEWED_LIMIT),
    );
    setOpenTripId(trip.id);
  }

  const searchForm = (
    <form
      className="glass-panel flex min-h-14 items-center gap-2 rounded-xl p-2.5"
      data-tour="search-form"
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
        aria-label="내 주변 지역으로 찾기"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
        disabled={isLocating}
        onClick={locateNearestArea}
        title="내 주변으로 찾기"
        type="button"
      >
        {isLocating ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
        ) : (
          <LocateIcon className="h-4 w-4" />
        )}
      </button>
      <button
        aria-label={prompt.trim() ? "이 문장으로 코스 검색" : "코스 자동 추천 받기"}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-strong disabled:opacity-60"
        disabled={isRecommending}
        title={prompt.trim() ? "검색" : "자동생성"}
        type="submit"
      >
        {isRecommending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : prompt.trim() ? (
          <ArrowRightIcon className="h-4 w-4" />
        ) : (
          <LightbulbIcon className="h-4 w-4" />
        )}
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
                    className="relative mt-7 block w-full text-center text-sm font-medium text-muted disabled:opacity-60"
                    disabled={isRecommending}
                    onClick={() => {
                      const example = promptExamples[exampleIndex];
                      setPrompt(example);
                      void startCourseFromPrompt(example);
                    }}
                    type="button"
                  >
                    <span className="example-rotator block" key={exampleIndex}>
                      “{promptExamples[exampleIndex]}”
                    </span>
                  </button>
                </div>

                <button
                  className="absolute inset-x-0 bottom-6 z-10 text-center text-xs font-semibold opacity-60 transition hover:opacity-100"
                  data-tour="quick-browse"
                  onClick={() => startCourse(areaId, "요즘 인기 있는 코스")}
                  style={{ color: "var(--success)" }}
                  type="button"
                >
                  바로 살펴보기 &gt;
                </button>
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
                          "shrink-0 rounded-sm border px-3 py-2 text-sm font-extrabold",
                          areaId === id
                            ? "border-primary bg-primary text-white"
                            : "border-border bg-surface text-muted-strong",
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
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone="blue">AI 추천 코스</Badge>
                      <button
                        aria-label="다른 코스 추천받기"
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-strong transition hover:border-primary hover:text-primary disabled:opacity-60"
                        disabled={isRecommending}
                        onClick={refreshCourse}
                        title="다른 코스 추천받기"
                        type="button"
                      >
                        <RefreshIcon className={cn("h-4 w-4", isRecommending && "animate-spin")} />
                      </button>
                    </div>
                    <h2 className="mt-3 text-xl font-extrabold">{submittedPrompt}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {area.name} · {area.coverage}
                    </p>
                    <div className="mt-3">
                      <ConstellationCard places={chainPlaces} />
                    </div>
                    {recommendReason && (
                      <p className="mt-2 text-xs leading-5 text-muted-strong">{recommendReason}</p>
                    )}
                  </article>

                  <div className="grid gap-2" ref={chainListRef}>
                    {chainPlaces.map((place, index) => (
                      <article
                        className={cn(
                          "flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface p-2.5 shadow-soft transition",
                          draggingChainId === place.id && "opacity-60",
                        )}
                        data-chain-id={place.id}
                        key={place.id}
                      >
                        <button
                          aria-label="순서 변경 (끌어서 이동)"
                          className="grid h-8 w-6 shrink-0 touch-none place-items-center text-muted"
                          onPointerCancel={handleChainDragEnd}
                          onPointerDown={(event) => handleChainDragStart(event, place.id)}
                          onPointerMove={handleChainDragMove}
                          onPointerUp={handleChainDragEnd}
                          type="button"
                        >
                          <GripIcon className="h-4 w-4" />
                        </button>

                        <button
                          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                          onClick={() => setSelectedPlaceId(place.id)}
                          type="button"
                        >
                          <span className="relative shrink-0">
                            <PlaceThumb category={place.category} size="sm" />
                            <span className="absolute -bottom-1 -left-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-extrabold text-white ring-2 ring-background">
                              {index + 1}
                            </span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold">{place.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {place.area} · {place.duration}
                            </span>
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            aria-label="위로 이동"
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-strong disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => moveStop(index, -1)}
                            type="button"
                          >
                            <ChevronUpIcon className="h-4 w-4" />
                          </button>
                          <button
                            aria-label="아래로 이동"
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-strong disabled:opacity-30"
                            disabled={index === chainPlaces.length - 1}
                            onClick={() => moveStop(index, 1)}
                            type="button"
                          >
                            <ChevronDownIcon className="h-4 w-4" />
                          </button>
                          <button
                            aria-label="삭제"
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-danger"
                            onClick={() => removeStop(place.id)}
                            type="button"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>

                  <Button
                    disabled={chainPlaces.length < 2}
                    onClick={() => setShowPublish(true)}
                  >
                    코스 확정하기 ({chainPlaces.length}곳)
                  </Button>

                  {otherPlacesByCategory.length > 0 && (
                    <div className="grid gap-3.5">
                      <h3 className="text-sm font-extrabold text-muted-strong">
                        {area.name}의 다른 장소
                      </h3>
                      {otherPlacesByCategory.map((group) => (
                        <div className="min-w-0" key={group.category}>
                          <p className="mb-1.5 text-xs font-bold text-muted">{group.category}</p>
                          <div className="flex items-center gap-2">
                            <div className="place-list-scroll flex min-w-0 flex-1 gap-2.5 overflow-x-auto">
                              {group.places.map((place) => (
                                <button
                                  className="flex w-28 shrink-0 flex-col overflow-hidden rounded-lg border border-border bg-surface text-left"
                                  key={place.id}
                                  onClick={() => setSelectedPlaceId(place.id)}
                                  type="button"
                                >
                                  <span className="block h-28 w-full shrink-0 overflow-hidden bg-surface-muted">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      alt=""
                                      className="h-full w-full object-cover"
                                      loading="lazy"
                                      src={getPlaceImageUrl(place.id)}
                                    />
                                  </span>
                                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-2 py-2">
                                    <span className="truncate text-xs font-bold">{place.name}</span>
                                    <span className="truncate text-[11px] text-muted">{place.area}</span>
                                    <span className="mt-1 text-[11px] font-extrabold text-primary">담기</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                            <button
                              aria-label={`${group.category} 더보기`}
                              className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border text-muted-strong transition hover:border-primary hover:text-primary"
                              onClick={() => setViewingCategory(group.category)}
                              type="button"
                            >
                              +
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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
                        "shrink-0 rounded-sm border px-3 py-1.5 text-xs font-extrabold",
                        exploreArea === id
                          ? "border-primary bg-primary text-white"
                          : "border-border bg-surface text-muted-strong",
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
                        "rounded-xs px-2.5 py-1.5",
                        exploreView === mode ? "bg-primary text-white" : "text-muted-strong",
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
                    onOpenTrip={viewTrip}
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
              <h1 className="text-xl font-extrabold">랭킹</h1>
              <p className="mt-1 text-xs text-muted">
                {rankingPeriod === "weekly" ? "가장 많이 저장된 주간 코스 순서예요." : "지금 가장 활발한 코스 순서예요."}
              </p>

              <div className="mt-3 flex rounded-sm border border-border bg-surface p-0.5 text-xs font-extrabold">
                {(["weekly", "live"] as const).map((period) => (
                  <button
                    className={cn(
                      "flex-1 rounded-xs py-1.5",
                      rankingPeriod === period ? "bg-primary text-white" : "text-muted-strong",
                    )}
                    key={period}
                    onClick={() => setRankingPeriod(period)}
                    type="button"
                  >
                    {period === "weekly" ? "주간 랭킹" : "실시간 랭킹"}
                  </button>
                ))}
              </div>

              <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
                {(["all", "seongsu", "hongdae", "gangnam"] as const).map((id) => (
                  <button
                    className={cn(
                      "shrink-0 rounded-sm border px-3 py-1.5 text-xs font-extrabold",
                      rankingArea === id
                        ? "border-primary bg-primary text-white"
                        : "border-border bg-surface text-muted-strong",
                    )}
                    key={id}
                    onClick={() => setRankingArea(id)}
                    type="button"
                  >
                    {id === "all" ? "전체" : areaMeta[id].name}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <TripFeedList
                  emptyLabel="아직 랭킹 데이터가 없어요."
                  likedIds={likedIds}
                  mode="ranking"
                  onOpenTrip={viewTrip}
                  onToggleLike={toggleLike}
                  onToggleSave={toggleSave}
                  savedIds={savedIds}
                  trips={rankingTrips}
                />
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <ProfileTab
              isSignedIn={isSignedIn}
              likedIds={likedIds}
              myTrips={publishedTrips}
              onOpenTrip={viewTrip}
              onToggleLike={toggleLike}
              onToggleSave={toggleSave}
              onToggleSignIn={() => setIsSignedIn((current) => !current)}
              recentlyViewedTrips={recentlyViewedTrips}
              savedIds={savedIds}
              savedTrips={savedTrips}
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
                data-tour={`nav-${id}`}
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

        {viewingCategory && (
          <CategorySheet
            areaName={area.name}
            category={viewingCategory}
            onClose={() => setViewingCategory(null)}
            onSelectPlace={(id) => {
              setViewingCategory(null);
              setSelectedPlaceId(id);
            }}
            places={viewingCategoryPlaces}
          />
        )}

        {selectedPlace && (
          <PlaceSheet
            isInChain={chainIds.includes(selectedPlace.id)}
            likedMenuIds={likedMenuIds}
            onAddToChain={addToChain}
            onClose={() => setSelectedPlaceId(null)}
            onToggleMenuLike={toggleMenuLike}
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
            onOpenAuthor={(handle) => setViewingAuthorHandle(handle)}
            onToggleLike={toggleLike}
            onToggleSave={toggleSave}
            trip={openTrip}
          />
        )}

        {viewingAuthorHandle && (
          <CreatorProfileSheet
            authorHandle={viewingAuthorHandle}
            authorName={
              allTrips.find((trip) => trip.authorHandle === viewingAuthorHandle)?.authorName ??
              viewingAuthorHandle
            }
            likedIds={likedIds}
            onClose={() => setViewingAuthorHandle(null)}
            onOpenTrip={(trip) => {
              setViewingAuthorHandle(null);
              viewTrip(trip);
            }}
            onToggleLike={toggleLike}
            onToggleSave={toggleSave}
            savedIds={savedIds}
            trips={allTrips.filter((trip) => trip.authorHandle === viewingAuthorHandle)}
          />
        )}
      </section>

      {tourPhase !== "hidden" && (
        <OnboardingTour
          onActivateTab={(tab) => setActiveTab(tab)}
          onFinish={endTour}
          onSkip={endTour}
          onStart={startTour}
          phase={tourPhase}
        />
      )}
    </main>
  );
}
