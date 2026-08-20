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
  MinusIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  TrashIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { cn } from "@/lib/utils";
import {
  getPlaceById,
  getPlaceImageUrl,
  getPlacesByIds,
  getTotalMinutes,
  localizePlace,
  localizeTrip,
  places,
  seedFeedTrips,
  type FeedTrip,
  type MobilePlace,
  type PlaceCategory,
  type TripVisibility,
} from "@/features/mobile/mobile-data";
import { useCategoryLabel, useLocale, usePromptExamples, useT } from "@/features/mobile/i18n/i18n-context";
import { CategorySheet } from "@/features/mobile/category-sheet";
import { LanguageMenuButton } from "@/features/mobile/language-menu-button";
import { ConstellationCard } from "@/features/mobile/constellation-card";
import { CreatorProfileSheet } from "@/features/mobile/creator-profile-sheet";
import { ExploreMap } from "@/features/mobile/explore-map";
import { loadKakaoMaps } from "@/features/mobile/kakao-loader";
import { OnboardingTour } from "@/features/mobile/onboarding-tour";
import { PlaceSheet } from "@/features/mobile/place-sheet";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { PublishSheet } from "@/features/mobile/publish-sheet";
import {
  buildChain,
  DEFAULT_RADIUS_KM,
  findBestInsertionIndex,
  RADIUS_STEPS_KM,
} from "@/features/mobile/recommend-engine";
import { TripDetailSheet } from "@/features/mobile/trip-detail-sheet";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { ProfileTab } from "@/features/mobile/profile-tab";

type TabId = "home" | "explore" | "ranking" | "profile";

const TAB_ORDER: TabId[] = ["home", "explore", "ranking", "profile"];

const OTHER_PLACES_PER_CATEGORY = 3;
const CATEGORY_ORDER: PlaceCategory[] = ["관광지", "문화재", "문화시설", "축제행사"];
const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const PROFILE_STORAGE_KEY = "tripchain:profile";
const RECENTLY_VIEWED_LIMIT = 10;
const TUTORIAL_STORAGE_KEY = "tripchain:tutorialSeen";

export function MobileAppShell() {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const promptExamples = usePromptExamples();

  const tabs: { id: TabId; label: string; icon: typeof HomeIcon }[] = [
    { id: "home", label: t("navHome"), icon: HomeIcon },
    { id: "explore", label: t("navExplore"), icon: CompassIcon },
    { id: "ranking", label: t("navRanking"), icon: TrophyIcon },
    { id: "profile", label: t("navProfile"), icon: UserIcon },
  ];

  const [activeTab, setActiveTab] = useState<TabId>("home");
  const [tourPhase, setTourPhase] = useState<"hidden" | "intro" | "steps">("hidden");

  // Tracks the previous tab so the newly-shown tab can slide in from the side it
  // logically came from, rather than a fixed direction. Adjusting state during render
  // (React's documented pattern for "remembering info from previous renders") is what
  // keeps this in sync with the same render that introduces the new tab's DOM node —
  // an effect would only update it one render too late for that node's entrance class.
  const [prevActiveTab, setPrevActiveTab] = useState<TabId>(activeTab);
  const [tabSlideClass, setTabSlideClass] = useState("tab-slide-in-right");
  if (activeTab !== prevActiveTab) {
    setTabSlideClass(TAB_ORDER.indexOf(activeTab) >= TAB_ORDER.indexOf(prevActiveTab) ? "tab-slide-in-right" : "tab-slide-in-left");
    setPrevActiveTab(activeTab);
  }

  const [prompt, setPrompt] = useState("");
  const [submittedPrompt, setSubmittedPrompt] = useState("");
  const [chainIds, setChainIds] = useState<string[]>([]);
  const [draggingChainId, setDraggingChainId] = useState<string | null>(null);
  const dragStateRef = useRef<{ id: string } | null>(null);
  const chainListRef = useRef<HTMLDivElement | null>(null);
  const [isLocating, setIsLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_STEPS_KM)[number]>(DEFAULT_RADIUS_KM);
  // The anchor the CURRENT course was actually built around, so wider/narrower can
  // reuse it directly instead of re-rolling location/AI intent from scratch.
  const [courseAnchor, setCourseAnchor] = useState<{ lat: number; lng: number } | null>(null);
  const [radiusMessage, setRadiusMessage] = useState<string | null>(null);

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [viewingCategory, setViewingCategory] = useState<PlaceCategory | null>(null);
  const [viewingAuthorHandle, setViewingAuthorHandle] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);

  const [publishedTrips, setPublishedTrips] = useState<FeedTrip[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [recentlyViewedTripIds, setRecentlyViewedTripIds] = useState<string[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const [exploreView, setExploreView] = useState<"list" | "map">("list");
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreUserLocation, setExploreUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [rankingPeriod, setRankingPeriod] = useState<"weekly" | "live">("weekly");

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
  }, [hasResult, promptExamples.length]);

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
          recentlyViewedTripIds?: string[];
        };

        // One-time hydration from localStorage on mount, not a reactive sync loop.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (parsed.isSignedIn) setIsSignedIn(true);
        if (Array.isArray(parsed.publishedTrips)) setPublishedTrips(parsed.publishedTrips);
        if (Array.isArray(parsed.likedIds)) setLikedIds(new Set(parsed.likedIds));
        if (Array.isArray(parsed.savedIds)) setSavedIds(new Set(parsed.savedIds));
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
          recentlyViewedTripIds,
        }),
      );
    } catch {
      // Storage may be unavailable (private mode, quota) — persistence is best-effort.
    }
  }, [isSignedIn, publishedTrips, likedIds, savedIds, recentlyViewedTripIds]);

  useEffect(() => {
    if (exploreView !== "map" || exploreUserLocation || !navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setExploreUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => {
        // Permission denied or unavailable — the map falls back to the Seoul-wide view.
      },
      { maximumAge: 5 * 60 * 1000, timeout: 8000 },
    );
  }, [exploreView, exploreUserLocation]);

  const [isRecommending, setIsRecommending] = useState(false);
  const [recommendReason, setRecommendReason] = useState<string | null>(null);
  const [isAiCourse, setIsAiCourse] = useState(false);

  const showBottomNav = activeTab !== "home" || hasResult || tourPhase === "steps";
  const chainPlaces = useMemo(() => getPlacesByIds(chainIds), [chainIds]);
  const otherPlacesByCategory = useMemo(() => {
    const remaining = places.filter((place) => !chainIds.includes(place.id));
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
  }, [chainIds]);

  const viewingCategoryPlaces = useMemo(() => {
    if (!viewingCategory) {
      return [];
    }
    return places
      .filter((place) => place.category === viewingCategory && !chainIds.includes(place.id))
      .sort((a, b) => b.savedBy - a.savedBy);
  }, [chainIds, viewingCategory]);

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
      allTrips.filter((trip) => {
        if (!normalizedExploreQuery) {
          return true;
        }
        const text = [trip.title, trip.description, trip.authorName].join(" ").toLowerCase();
        return text.includes(normalizedExploreQuery);
      }),
    [allTrips, normalizedExploreQuery],
  );
  const exploreMapPlaces = places;
  const exploreMapCenter = exploreUserLocation ?? SEOUL_CENTER;
  const exploreMapLevel = exploreUserLocation ? 4 : 9;

  const rankingTrips = useMemo(() => {
    if (rankingPeriod === "live") {
      return [...allTrips].sort(
        (a, b) => b.likes + b.saved + b.comments - (a.likes + a.saved + a.comments),
      );
    }

    return [...allTrips].sort((a, b) => b.rankScore - a.rankScore);
  }, [allTrips, rankingPeriod]);

  // Best-effort current position, used as the default anchor whenever a search doesn't
  // name its own area — never blocks the search on a slow/denied permission prompt.
  function getCurrentLocation(): Promise<{ lat: number; lng: number } | null> {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
        () => resolve(null),
        { maximumAge: 5 * 60 * 1000, timeout: 4000 },
      );
    });
  }

  async function startCourse(
    nextPrompt: string,
    explicitAnchor?: { lat: number; lng: number } | null,
    radiusOverride?: number,
  ) {
    const anchor = explicitAnchor !== undefined ? explicitAnchor : await getCurrentLocation();
    const { placeIds } = buildChain({
      categories: [],
      attributes: [],
      placeCount: 4,
      anchor,
      radiusKm: radiusOverride ?? radiusKm,
    });

    setSubmittedPrompt(nextPrompt);
    setChainIds(placeIds);
    setRecommendReason(null);
    setIsAiCourse(false);
    setCourseAnchor(anchor);
    setRadiusMessage(null);
  }

  async function startCourseFromPrompt(nextPrompt: string, radiusOverride?: number) {
    setIsRecommending(true);
    setRecommendReason(null);
    setIsAiCourse(true);
    const effectiveRadius = radiusOverride ?? radiusKm;

    try {
      // hasSpecificLocation (server-side, from the prompt itself) takes priority over
      // this anchor when the prompt already names its own area.
      const anchor = await getCurrentLocation();
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nextPrompt, locale, anchor, radiusKm: effectiveRadius }),
      });

      if (!response.ok) {
        throw new Error("recommend request failed");
      }

      const data = await response.json();

      if (!Array.isArray(data.placeIds) || data.placeIds.length === 0) {
        throw new Error("recommend response malformed");
      }

      setChainIds(data.placeIds);
      setRecommendReason(typeof data.reason === "string" ? data.reason : null);
      setSubmittedPrompt(nextPrompt);
      setCourseAnchor(
        data.anchor && typeof data.anchor.lat === "number" && typeof data.anchor.lng === "number"
          ? { lat: data.anchor.lat, lng: data.anchor.lng }
          : null,
      );
    } catch {
      const result = buildChain({
        categories: [],
        attributes: [],
        placeCount: 4,
        radiusKm: effectiveRadius,
      });
      setChainIds(result.placeIds);
      setSubmittedPrompt(nextPrompt);
      setCourseAnchor(result.anchor);
    } finally {
      setIsRecommending(false);
      setRadiusMessage(null);
    }
  }

  function recommend(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const nextPrompt = prompt.trim() || t("defaultMoodPrompt");
    void startCourseFromPrompt(nextPrompt);
  }

  function refreshCourse() {
    if (isAiCourse) {
      void startCourseFromPrompt(submittedPrompt);
      return;
    }
    // buildChain() is synchronous, so without an artificial minimum duration the
    // refresh icon's spin would never get a chance to paint before it's done.
    setIsRecommending(true);
    window.setTimeout(async () => {
      await startCourse(submittedPrompt);
      setIsRecommending(false);
    }, 450);
  }

  // Adjusts scope within the SAME area the current course is anchored on, rather than
  // re-rolling location/AI intent (that's what the refresh button is for). If the area
  // genuinely can't support the requested radius, says so instead of silently expanding
  // past it or jumping elsewhere.
  function changeRadius(direction: -1 | 1) {
    if (!courseAnchor) {
      setRadiusMessage(t("radiusUnavailable"));
      return;
    }

    const currentIndex = RADIUS_STEPS_KM.indexOf(radiusKm);
    const baseIndex = currentIndex === -1 ? RADIUS_STEPS_KM.indexOf(DEFAULT_RADIUS_KM) : currentIndex;
    const nextIndex = Math.min(RADIUS_STEPS_KM.length - 1, Math.max(0, baseIndex + direction));
    const nextRadius = RADIUS_STEPS_KM[nextIndex];

    if (nextRadius === radiusKm) {
      return;
    }

    const result = buildChain({
      categories: [],
      attributes: [],
      placeCount: chainPlaces.length || 4,
      anchor: courseAnchor,
      radiusKm: nextRadius,
      strictRadius: true,
    });

    if (result.placeIds.length < 2) {
      setRadiusMessage(t("radiusNoPlaces"));
      return;
    }

    setRadiusKm(nextRadius);
    setChainIds(result.placeIds);
    setRecommendReason(null);
    setRadiusMessage(null);
  }

  function locateNearby() {
    if (!navigator.geolocation) {
      return;
    }

    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void startCourse(t("nearbyCoursePrompt"), {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
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
      setSubmittedPrompt(t("startedFromPlacePrompt", { name: place.name }));
      setChainIds([place.id]);
      setSelectedPlaceId(null);
      return;
    }

    setChainIds((current) => {
      if (current.includes(place.id)) {
        return current;
      }
      const insertAt = findBestInsertionIndex(getPlacesByIds(current), place);
      return [...current.slice(0, insertAt), place.id, ...current.slice(insertAt)];
    });
    setSelectedPlaceId(null);
  }

  function handlePublish(input: { title: string; description: string; visibility: TripVisibility }) {
    const trip: FeedTrip = {
      // handlePublish only ever runs from PublishSheet's submit click, never during
      // render, so a timestamp-based id here is a safe, one-shot side effect.
      // eslint-disable-next-line react-hooks/purity
      id: `mine-${Date.now()}`,
      title: input.title,
      description: input.description,
      authorHandle: "you",
      authorName: t("travelerName"),
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

    // Published in whatever language the user typed — translate in the background
    // (not blocking publish) so it reads correctly for viewers in every locale,
    // regardless of which language it was written in.
    void translateTrip(trip.id, trip.title, trip.description);
  }

  async function translateTrip(tripId: string, title: string, description: string) {
    try {
      const response = await fetch("/api/translate-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (!data.translations) {
        return;
      }

      setPublishedTrips((current) =>
        current.map((existing) =>
          existing.id === tripId ? { ...existing, translations: data.translations } : existing,
        ),
      );
    } catch {
      // Best-effort — the trip still displays fine in its original language.
    }
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

  function viewTrip(trip: FeedTrip) {
    setRecentlyViewedTripIds((current) =>
      [trip.id, ...current.filter((id) => id !== trip.id)].slice(0, RECENTLY_VIEWED_LIMIT),
    );
    setOpenTripId(trip.id);
  }

  // Brings a published trip's stops into the user's own working chain — reordering,
  // adding, or removing stops from here doesn't touch the original published trip.
  function loadTripToChain(trip: FeedTrip) {
    setChainIds(trip.placeIds);
    setSubmittedPrompt(localizeTrip(trip, locale).title);
    setRecommendReason(null);
    setIsAiCourse(false);
    setOpenTripId(null);
    setActiveTab("home");
  }

  const searchForm = (
    <form
      className="glass-panel flex min-h-14 items-center gap-2 rounded-xl p-2.5"
      data-tour="search-form"
      onSubmit={recommend}
    >
      <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
      <input
        aria-label={t("searchInputAria")}
        className="min-w-0 flex-1 bg-transparent text-sm font-bold outline-none placeholder:text-muted"
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={t("searchPlaceholder")}
        type="search"
        value={prompt}
      />
      <button
        aria-label={t("locateNearbyAria")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground disabled:opacity-60"
        disabled={isLocating}
        onClick={locateNearby}
        title={t("locateNearbyTitle")}
        type="button"
      >
        {isLocating ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
        ) : (
          <LocateIcon className="h-4 w-4" />
        )}
      </button>
      <button
        aria-label={prompt.trim() ? t("searchSubmitPromptAria") : t("searchSubmitAutoAria")}
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-strong disabled:opacity-60"
        disabled={isRecommending}
        title={prompt.trim() ? t("searchSubmitPromptTitle") : t("searchSubmitAutoTitle")}
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
      <section className="relative mx-auto flex h-[100svh] max-h-[900px] w-full max-w-[430px] flex-col overflow-hidden bg-background shadow-panel [padding-top:env(safe-area-inset-top)]">
        <div className="app-scroll-area min-h-0 flex-1 overflow-y-auto">
          {activeTab === "home" && (
            !hasResult ? (
              <div className={cn(tabSlideClass, "relative min-h-full")}>
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

                <div className="relative z-10 px-5 pt-10 text-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img alt="Trip Chain" className="mx-auto block h-[85px] w-auto" src="/tripchain-logo.svg" />
                  <p className="mt-1 text-xs font-extrabold tracking-wide text-primary">Beta</p>
                  <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-normal text-balance">
                    {t("heroTitle")}
                  </h1>
                  <p className="mx-auto mt-4 max-w-[310px] whitespace-pre-line text-sm leading-6 text-muted">
                    {t("heroSubtitle")}
                  </p>

                  {/* A fixed gap below the subtitle (not vertically centered in the full
                      viewport) so this sits at the same relative spot regardless of how
                      tall the device's visible viewport actually is — a phone with more
                      of its screen taken up by browser chrome shouldn't stretch this gap
                      wider than on one with less. */}
                  <div className="mt-8 text-left">
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
                </div>

                <button
                  className="absolute inset-x-0 z-10 text-center text-xs font-semibold opacity-60 transition hover:opacity-100 [bottom:calc(1.5rem+env(safe-area-inset-bottom))]"
                  data-tour="quick-browse"
                  onClick={() => startCourse(t("popularCoursePrompt"))}
                  style={{ color: "var(--success)" }}
                  type="button"
                >
                  {t("quickBrowse")}
                </button>

                <LanguageMenuButton className="absolute right-5 z-20 [bottom:calc(0.75rem+env(safe-area-inset-bottom))]" />
              </div>
            ) : (
              <div className={cn(tabSlideClass, "relative flex min-h-full flex-col px-5 pb-24 pt-5")}>
                <header className="relative z-10 text-left">
                  <p className="text-xs font-extrabold text-primary">Trip Chain Beta</p>
                  <h1 className="mt-3 text-3xl font-extrabold leading-tight tracking-normal text-balance">
                    {t("heroTitle")}
                  </h1>
                </header>

                <div className="relative z-10 mt-7">{searchForm}</div>

              {hasResult && (
                <section className="mt-5 grid gap-4">
                  <article className="rounded-lg border border-border bg-surface p-4 shadow-soft">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone="blue">{t("aiCourseBadge")}</Badge>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          aria-label={t("radiusNarrower")}
                          className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-strong transition hover:border-primary hover:text-primary disabled:opacity-40"
                          disabled={isRecommending || radiusKm === RADIUS_STEPS_KM[0]}
                          onClick={() => changeRadius(-1)}
                          title={t("radiusNarrower")}
                          type="button"
                        >
                          <MinusIcon className="h-3.5 w-3.5" />
                        </button>
                        <span className="min-w-[3.25rem] text-center text-xs font-bold text-muted-strong">
                          {t("radiusLabel", { km: radiusKm })}
                        </span>
                        <button
                          aria-label={t("radiusWider")}
                          className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-strong transition hover:border-primary hover:text-primary disabled:opacity-40"
                          disabled={isRecommending || radiusKm === RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1]}
                          onClick={() => changeRadius(1)}
                          title={t("radiusWider")}
                          type="button"
                        >
                          <PlusIcon className="h-3.5 w-3.5" />
                        </button>
                        <button
                          aria-label={t("refreshCourseAria")}
                          className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-strong transition hover:border-primary hover:text-primary disabled:opacity-60"
                          disabled={isRecommending}
                          onClick={() => refreshCourse()}
                          title={t("refreshCourseTitle")}
                          type="button"
                        >
                          <RefreshIcon className={cn("h-4 w-4", isRecommending && "animate-spin")} />
                        </button>
                      </div>
                    </div>
                    <h2 className="mt-3 text-xl font-extrabold text-balance">{submittedPrompt}</h2>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      {t("courseSummary", { minutes: getTotalMinutes(chainPlaces) })}
                    </p>
                    {radiusMessage && (
                      <p className="mt-1 text-xs font-semibold text-danger">{radiusMessage}</p>
                    )}
                    <div className="mt-3">
                      <ConstellationCard places={chainPlaces} />
                    </div>
                    {recommendReason && (
                      <p className="mt-2 text-xs leading-5 text-muted-strong">{recommendReason}</p>
                    )}
                  </article>

                  <div className="grid gap-2" ref={chainListRef}>
                    {chainPlaces.map((place, index) => {
                      const localizedPlace = localizePlace(place, locale);
                      return (
                      <article
                        className={cn(
                          "chain-card-in flex min-w-0 items-center gap-2 rounded-lg border border-border bg-surface p-2.5 shadow-soft transition",
                          draggingChainId === place.id && "opacity-60",
                        )}
                        data-chain-id={place.id}
                        key={place.id}
                        style={{ animationDelay: `${index * 60}ms` }}
                      >
                        <button
                          aria-label={t("reorderAria")}
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
                            <span className="block truncate text-sm font-extrabold">{localizedPlace.name}</span>
                            <span className="block truncate text-xs text-muted">
                              {localizedPlace.area} · {localizedPlace.duration}
                            </span>
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            aria-label={t("moveUpAria")}
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-strong disabled:opacity-30"
                            disabled={index === 0}
                            onClick={() => moveStop(index, -1)}
                            type="button"
                          >
                            <ChevronUpIcon className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={t("moveDownAria")}
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-muted-strong disabled:opacity-30"
                            disabled={index === chainPlaces.length - 1}
                            onClick={() => moveStop(index, 1)}
                            type="button"
                          >
                            <ChevronDownIcon className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={t("deleteAria")}
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-danger"
                            onClick={() => removeStop(place.id)}
                            type="button"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                      </article>
                      );
                    })}
                  </div>

                  <Button
                    disabled={chainPlaces.length < 2}
                    onClick={() => setShowPublish(true)}
                  >
                    {t("confirmCourse", { count: chainPlaces.length })}
                  </Button>

                  {otherPlacesByCategory.length > 0 && (
                    <div className="grid gap-3.5">
                      <h3 className="text-sm font-extrabold text-muted-strong">{t("otherPlacesHeading")}</h3>
                      {otherPlacesByCategory.map((group) => (
                        <div className="min-w-0" key={group.category}>
                          <p className="mb-1.5 text-xs font-bold text-muted">{categoryLabel(group.category)}</p>
                          <div className="flex items-center gap-2">
                            <div className="place-list-scroll flex min-w-0 flex-1 gap-2.5 overflow-x-auto">
                              {group.places.map((place) => {
                                const localizedPlace = localizePlace(place, locale);
                                return (
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
                                    <span className="truncate text-xs font-bold">{localizedPlace.name}</span>
                                    <span className="truncate text-[11px] text-muted">{localizedPlace.area}</span>
                                    <span className="mt-1 text-[11px] font-extrabold text-primary">
                                      {t("addToChainLabel")}
                                    </span>
                                  </span>
                                </button>
                                );
                              })}
                            </div>
                            <button
                              aria-label={t("categoryMoreAria", { category: categoryLabel(group.category) })}
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
            <div className={cn(tabSlideClass, "flex h-full min-h-full flex-col px-5 py-4")}>
              <h1 className="text-xl font-extrabold">{t("exploreHeading")}</h1>
              <p className="mt-1 text-xs text-muted text-balance">{t("exploreSubtitle")}</p>

              <div className="glass-panel mt-4 flex h-11 shrink-0 items-center gap-2 rounded-lg px-3">
                <SearchIcon className="h-4 w-4 shrink-0 text-muted" />
                <input
                  aria-label={t("exploreSearchAria")}
                  className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none placeholder:text-muted"
                  onChange={(event) => setExploreQuery(event.target.value)}
                  placeholder={t("exploreSearchPlaceholder")}
                  type="search"
                  value={exploreQuery}
                />
              </div>

              <div className="mt-3 flex items-center justify-end gap-2">
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
                      {mode === "list" ? t("viewList") : t("viewMap")}
                    </button>
                  ))}
                </div>
              </div>

              {exploreView === "list" ? (
                <div className="mt-4 pb-4">
                  <TripFeedList
                    emptyLabel={t("exploreEmpty")}
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
            <div className={cn(tabSlideClass, "px-5 py-4")}>
              <h1 className="text-xl font-extrabold">{t("rankingHeading")}</h1>
              <p className="mt-1 text-xs text-muted text-balance">
                {rankingPeriod === "weekly" ? t("rankingWeeklySubtitle") : t("rankingLiveSubtitle")}
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
                    {period === "weekly" ? t("rankingWeekly") : t("rankingLive")}
                  </button>
                ))}
              </div>

              <div className="mt-4">
                <TripFeedList
                  emptyLabel={t("rankingEmpty")}
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
            <div className={tabSlideClass}>
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
            </div>
          )}
        </div>

        {showBottomNav && (
          <nav className="nav-pop-in grid shrink-0 grid-cols-4 border-t border-border bg-surface/95 [padding-bottom:env(safe-area-inset-bottom)]">
            {tabs.map(({ icon: Icon, id, label }) => (
              <button
                className={cn(
                  "flex flex-col items-center gap-1 py-2.5 text-xs font-bold text-muted transition-colors duration-300",
                  activeTab === id && "text-primary",
                )}
                data-tour={`nav-${id}`}
                key={id}
                onClick={() => setActiveTab(id)}
                type="button"
              >
                <span className="relative grid place-items-center">
                  {activeTab === id && <span aria-hidden="true" className="nav-icon-glow" />}
                  <Icon className="relative z-10 h-5 w-5" />
                </span>
                {label}
              </button>
            ))}
          </nav>
        )}

        {viewingCategory && (
          <CategorySheet
            areaName={t("seoulWide")}
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
            onLoadToChain={loadTripToChain}
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
