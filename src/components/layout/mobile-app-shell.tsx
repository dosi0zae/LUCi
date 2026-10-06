"use client";

import {
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowRightIcon,
  CompassIcon,
  GripIcon,
  LightbulbIcon,
  LocateIcon,
  MapSearchIcon,
  MinusIcon,
  NavigationIcon,
  PinIcon,
  PlaylistAddIcon,
  PlusIcon,
  RefreshIcon,
  RotateUpIcon,
  SearchIcon,
  TrashIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { IntroSplash } from "@/components/layout/intro-splash";
import { cn } from "@/lib/utils";
import {
  getPlaceById,
  getPlaceImageUrl,
  getPlacesByIds,
  getSeedComments,
  getTotalMinutes,
  haversineKm,
  localizePlace,
  localizeTrip,
  places,
  seedFeedTrips,
  type FeedTrip,
  type MobilePlace,
  type PlaceCategory,
  type TripComment,
  type TripVisibility,
} from "@/features/mobile/mobile-data";
import { useCategoryLabel, useLocale, usePromptExamples, useT } from "@/features/mobile/i18n/i18n-context";
import { CategorySheet, type PlaceBadgeKind } from "@/features/mobile/category-sheet";
import { LanguageMenuButton } from "@/features/mobile/language-menu-button";
import { ConstellationCard } from "@/features/mobile/constellation-card";
import { decodeCourseFromLocation } from "@/features/mobile/course-share";
import { CreatorProfileSheet } from "@/features/mobile/creator-profile-sheet";
import { ExploreMap } from "@/features/mobile/explore-map";
import { loadKakaoMaps } from "@/features/mobile/kakao-loader";
import { buildGoogleMapsWalkingRouteUrl, buildKakaoWalkingRouteUrl } from "@/features/mobile/route-links";
import { OnboardingTour } from "@/features/mobile/onboarding-tour";
import { PlaceSheet } from "@/features/mobile/place-sheet";
import { PlaceThumb } from "@/features/mobile/place-thumb";
import { PublishSheet } from "@/features/mobile/publish-sheet";
import {
  buildChain,
  DEFAULT_RADIUS_KM,
  derivePreference,
  EXACT_ROUTE_MAX,
  findBestInsertionIndex,
  isRouteOptimized,
  optimizeRoutePreservingPins,
  RADIUS_STEPS_KM,
  rankReplacementStops,
} from "@/features/mobile/recommend-engine";
import { TripDetailSheet } from "@/features/mobile/trip-detail-sheet";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { ProfileTab } from "@/features/mobile/profile-tab";

// There's no bottom tab bar: home is the base screen, explore opens from a floating
// button on it, and profile from the avatar in its top-right corner. Ranking lives inside
// explore as a sort option rather than its own screen.
type TabId = "home" | "explore" | "profile";
type ExploreSort = "all" | "weekly" | "live";

const TAB_ORDER: TabId[] = ["home", "explore", "profile"];

const OTHER_PLACES_PER_CATEGORY = 3;

// How many "near this stop" suggestions a chain card shows when expanded, and the letters
// that tie each one to its marker on the map (letters, so they can't be confused with the
// numbered stops of the chain itself).
const NEARBY_LABELS = ["A", "B", "C", "D", "E"];

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
const CATEGORY_ORDER: PlaceCategory[] = ["관광지", "문화재", "문화시설", "축제행사"];
const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const PROFILE_STORAGE_KEY = "tripchain:profile";
const RECENTLY_VIEWED_LIMIT = 10;
const TUTORIAL_STORAGE_KEY = "tripchain:tutorialSeen";
// A place this close to any current stop is "실제로 걸어서 들를 수 있는" close, not just
// closer-than-average — used to decide the "주변" badge in the category sheet.
const NEAR_CHAIN_BADGE_RADIUS_KM = 1;

function distanceToChainKm(place: MobilePlace, chain: MobilePlace[]): number {
  if (chain.length === 0) {
    return Infinity;
  }
  return Math.min(...chain.map((stop) => haversineKm(stop, place)));
}

function median(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function MobileAppShell() {
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const promptExamples = usePromptExamples();

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
  // startY/startTop are the pointer's clientY and the card's offsetTop when the drag began;
  // lastY follows the pointer — together they keep the dragged card under the finger even
  // as reordering moves its slot.
  const dragStateRef = useRef<{ id: string; startY: number; startTop: number; lastY: number } | null>(null);
  const chainListRef = useRef<HTMLDivElement | null>(null);
  // Stops the user pinned keep their exact position: drag/optimize/swap work around them.
  const [isTitleScrolledAway, setIsTitleScrolledAway] = useState(false);
  // The one chain card whose alternatives panel is open (accordion — opening another
  // closes it).
  const [expandedStopId, setExpandedStopId] = useState<string | null>(null);
  // The alternatives listed in the open swap panel. Frozen when it opens so that swapping
  // one in can hand its slot (same letter, same row) to the stop that was just replaced.
  const [swapCandidateIds, setSwapCandidateIds] = useState<string[]>([]);
  // After a swap: the stop that just moved into the course and the one that moved into
  // the panel, so both can play the "swapped" animation. `staticPanelId` keeps the new
  // card's panel from replaying its open animation (it's already open).
  const [swapFlash, setSwapFlash] = useState<{ cardId: string; rowId: string } | null>(null);
  const [staticPanelId, setStaticPanelId] = useState<string | null>(null);
  // The stop that was just added to the course (glows briefly, like a swapped-in one).
  const [addedId, setAddedId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(() => new Set());
  // Cards whose entrance animation has finished. A card that's merely been moved in the DOM
  // by a reorder must not replay it (the class would restart on every move).
  const [enteredIds, setEnteredIds] = useState<Set<string>>(() => new Set());
  // Last-known offsetTop per card, for the FLIP slide when the order changes.
  const cardTopsRef = useRef<Map<string, number>>(new Map());
  const [isLocating, setIsLocating] = useState(false);
  const [radiusKm, setRadiusKm] = useState<(typeof RADIUS_STEPS_KM)[number]>(DEFAULT_RADIUS_KM);
  // The anchor the CURRENT course was actually built around, so wider/narrower can
  // reuse it directly instead of re-rolling location/AI intent from scratch.
  const [courseAnchor, setCourseAnchor] = useState<{ lat: number; lng: number } | null>(null);
  // A district the prompt named explicitly (e.g. "종로구") — wider/narrower stays inside
  // it (buildChain treats it as a hard ceiling, not just a starting point).
  const [courseAreaFilter, setCourseAreaFilter] = useState<string | null>(null);
  const [radiusMessage, setRadiusMessage] = useState<string | null>(null);
  // Remembers the last chain seen at each radius step for the CURRENT course, so
  // stepping 4km -> 8km -> back to 4km restores exactly what was there before instead of
  // rebuilding a fresh (differently-randomized) chain. Cleared whenever a genuinely new
  // course starts (search, quick-browse, locate-nearby, refresh); a ref because it's
  // pure bookkeeping that should never itself trigger a render.
  const radiusChainCacheRef = useRef<Map<number, string[]>>(new Map());

  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [viewingCategory, setViewingCategory] = useState<PlaceCategory | null>(null);
  const [viewingAuthorHandle, setViewingAuthorHandle] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  const [isOptimizePromptOpen, setIsOptimizePromptOpen] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);

  const [publishedTrips, setPublishedTrips] = useState<FeedTrip[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [bookmarkedPlaceIds, setBookmarkedPlaceIds] = useState<Set<string>>(new Set());
  const [userComments, setUserComments] = useState<Record<string, TripComment[]>>({});
  const [recentlyViewedTripIds, setRecentlyViewedTripIds] = useState<string[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);

  const [exploreView, setExploreView] = useState<"list" | "map">("list");
  const [exploreQuery, setExploreQuery] = useState("");
  const [exploreUserLocation, setExploreUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [exploreSort, setExploreSort] = useState<ExploreSort>("all");

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
    if (!hasResult) {
      return;
    }
    radiusChainCacheRef.current.set(radiusKm, chainIds);
  }, [hasResult, radiusKm, chainIds]);

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
    // iOS standalone (home-screen) PWA mode has been observed resolving 100svh/100dvh
    // taller than the actual visible screen, pushing the bottom nav off-screen — a real
    // pixel measurement from visualViewport (falls back to window.innerHeight) sidesteps
    // that unit-resolution bug entirely instead of trusting any CSS viewport unit.
    function syncAppHeight() {
      const height = window.visualViewport?.height ?? window.innerHeight;
      document.documentElement.style.setProperty("--app-vh", `${height}px`);
    }

    syncAppHeight();
    window.visualViewport?.addEventListener("resize", syncAppHeight);
    window.addEventListener("resize", syncAppHeight);
    window.addEventListener("orientationchange", syncAppHeight);

    return () => {
      window.visualViewport?.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("orientationchange", syncAppHeight);
    };
  }, []);

  useEffect(() => {
    try {
      // A shared-course link (see course-share.ts) should open straight into that course,
      // not get blocked behind the first-run tutorial.
      if (!window.localStorage.getItem(TUTORIAL_STORAGE_KEY) && !window.location.search.includes("course=")) {
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
          bookmarkedPlaceIds?: string[];
          userComments?: Record<string, TripComment[]>;
          recentlyViewedTripIds?: string[];
        };

        // One-time hydration from localStorage on mount, not a reactive sync loop.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (parsed.isSignedIn) setIsSignedIn(true);
        if (Array.isArray(parsed.publishedTrips)) setPublishedTrips(parsed.publishedTrips);
        if (Array.isArray(parsed.likedIds)) setLikedIds(new Set(parsed.likedIds));
        if (Array.isArray(parsed.savedIds)) setSavedIds(new Set(parsed.savedIds));
        if (Array.isArray(parsed.bookmarkedPlaceIds)) {
          setBookmarkedPlaceIds(new Set(parsed.bookmarkedPlaceIds));
        }
        if (parsed.userComments && typeof parsed.userComments === "object") {
          setUserComments(parsed.userComments);
        }
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
          bookmarkedPlaceIds: [...bookmarkedPlaceIds],
          userComments,
          recentlyViewedTripIds,
        }),
      );
    } catch {
      // Storage may be unavailable (private mode, quota) — persistence is best-effort.
    }
  }, [isSignedIn, publishedTrips, likedIds, savedIds, bookmarkedPlaceIds, userComments, recentlyViewedTripIds]);

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
  const [usedAI, setUsedAI] = useState(false);
  const [isNavigateMenuOpen, setIsNavigateMenuOpen] = useState(false);

  const chainPlaces = useMemo(() => getPlacesByIds(chainIds), [chainIds]);
  const isOptimized = useMemo(() => isRouteOptimized(chainPlaces, pinnedIds), [chainPlaces, pinnedIds]);
  // The alternatives listed under the open card: the frozen candidate list minus anything
  // that has since joined the course, with distances from the stop they'd replace.
  const panelStops = useMemo(() => {
    const expanded = chainPlaces.find((place) => place.id === expandedStopId);
    if (!expanded) {
      return [];
    }
    const inChain = new Set(chainPlaces.map((place) => place.id));
    return getPlacesByIds(swapCandidateIds.filter((id) => !inChain.has(id))).map((place) => ({
      place,
      distanceKm: haversineKm(expanded, place),
    }));
  }, [chainPlaces, expandedStopId, swapCandidateIds]);
  const suggestionPlaces = useMemo(() => panelStops.map((entry) => entry.place), [panelStops]);
  // The full set of places "넓게" could ever draw from for the current course — the
  // named district's places, or every place in Seoul otherwise. Comparing the current
  // radius's coverage against this tells us whether widening further would actually add
  // any new candidates, instead of just reshuffling the same already-complete pool into
  // a "different"-looking course.
  const radiusScopePlaces = useMemo(
    () => (courseAreaFilter ? places.filter((place) => place.area === courseAreaFilter) : places),
    [courseAreaFilter],
  );
  const isRadiusAtMaxCoverage = useMemo(() => {
    if (!courseAnchor) {
      return false;
    }
    const withinCurrentRadius = radiusScopePlaces.filter(
      (place) => haversineKm(courseAnchor, place) <= radiusKm,
    ).length;
    return withinCurrentRadius >= radiusScopePlaces.length;
  }, [courseAnchor, radiusKm, radiusScopePlaces]);
  // A lightweight taste profile inferred from the user's own bookmarked places (see
  // derivePreference), fed into every course build so recommendations nudge toward what
  // this person has already shown they like, without needing a backend to store it.
  const preference = useMemo(
    () => derivePreference([...bookmarkedPlaceIds]),
    [bookmarkedPlaceIds],
  );

  useEffect(() => {
    // A link built by buildCourseShareUrl encodes the course's place ids directly, so it
    // resolves the same way for anyone (no server-side trip storage needed — see
    // course-share.ts). Consumed once on mount, then stripped from the URL so a later
    // refresh or radius/refresh action doesn't keep reloading this same shared course.
    const decoded = decodeCourseFromLocation(window.location.search);
    if (!decoded) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setChainIds(decoded.placeIds);
    setSubmittedPrompt(decoded.title || t("sharedCourseFallbackTitle"));
    setRecommendReason(null);
    setIsAiCourse(false);
    setActiveTab("home");
    window.history.replaceState(null, "", window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
      // Closest to the current chain first — someone already headed to these 4 stops is
      // far more likely to add a 5th one nearby than a merely popular spot across town.
      places: (byCategory.get(category) ?? [])
        .sort((a, b) => distanceToChainKm(a, chainPlaces) - distanceToChainKm(b, chainPlaces))
        .slice(0, OTHER_PLACES_PER_CATEGORY),
    })).filter((group) => group.places.length > 0);
  }, [chainIds, chainPlaces]);

  const viewingCategoryPlaces = useMemo(() => {
    if (!viewingCategory) {
      return [];
    }
    return places
      .filter((place) => place.category === viewingCategory && !chainIds.includes(place.id))
      .sort((a, b) => distanceToChainKm(a, chainPlaces) - distanceToChainKm(b, chainPlaces));
  }, [chainIds, chainPlaces, viewingCategory]);

  // One badge per place in the open category sheet, explaining at a glance why it's
  // listed: genuinely walkable from the current chain, objectively popular among the
  // remaining candidates, or neither (still a reasonable pick, just not for either
  // reason above) — "인기" is relative to THIS list's own median, not a global popularity
  // cutoff, so it stays meaningful whether the category has 5 candidates or 50.
  const viewingCategoryBadges = useMemo(() => {
    const badges = new Map<string, PlaceBadgeKind>();
    if (viewingCategoryPlaces.length === 0) {
      return badges;
    }
    const medianSavedBy = median(viewingCategoryPlaces.map((place) => place.savedBy));
    for (const place of viewingCategoryPlaces) {
      if (distanceToChainKm(place, chainPlaces) <= NEAR_CHAIN_BADGE_RADIUS_KM) {
        badges.set(place.id, "near");
      } else if (place.savedBy >= medianSavedBy) {
        badges.set(place.id, "popular");
      } else {
        badges.set(place.id, "recommended");
      }
    }
    return badges;
  }, [viewingCategoryPlaces, chainPlaces]);

  const allTrips = useMemo(
    () =>
      [...publishedTrips, ...seedFeedTrips].map((trip) => {
        const extraComments = userComments[trip.id]?.length ?? 0;
        return extraComments > 0 ? { ...trip, comments: trip.comments + extraComments } : trip;
      }),
    [publishedTrips, userComments],
  );
  const savedTrips = useMemo(
    () => allTrips.filter((trip) => savedIds.has(trip.id)),
    [allTrips, savedIds],
  );
  const likedTrips = useMemo(
    () => allTrips.filter((trip) => likedIds.has(trip.id)),
    [allTrips, likedIds],
  );
  const bookmarkedPlaces = useMemo(
    () => places.filter((place) => bookmarkedPlaceIds.has(place.id)),
    [bookmarkedPlaceIds],
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
  const openTripComments = useMemo(() => {
    if (!openTrip) {
      return [];
    }
    // The user's own comments show first (most recent contribution), then the seeded
    // sample so a freshly-commented trip doesn't bury what was just posted.
    return [...(userComments[openTrip.id] ?? []), ...getSeedComments(openTrip.id)];
  }, [openTrip, userComments]);

  const normalizedExploreQuery = exploreQuery.trim().toLowerCase();
  const exploreTrips = useMemo(() => {
    const matching = allTrips.filter((trip) => {
      if (!normalizedExploreQuery) {
        return true;
      }
      const text = [trip.title, trip.description, trip.authorName].join(" ").toLowerCase();
      return text.includes(normalizedExploreQuery);
    });

    if (exploreSort === "live") {
      return [...matching].sort(
        (a, b) => b.likes + b.saved + b.comments - (a.likes + a.saved + a.comments),
      );
    }
    if (exploreSort === "weekly") {
      return [...matching].sort((a, b) => b.rankScore - a.rankScore);
    }
    return matching;
  }, [allTrips, normalizedExploreQuery, exploreSort]);
  const exploreMapPlaces = places;
  const exploreMapCenter = exploreUserLocation ?? SEOUL_CENTER;
  const exploreMapLevel = exploreUserLocation ? 4 : 9;

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
    radiusChainCacheRef.current.clear();
    const anchor = explicitAnchor !== undefined ? explicitAnchor : await getCurrentLocation();
    const { placeIds } = buildChain({
      categories: [],
      attributes: [],
      placeCount: 4,
      anchor,
      radiusKm: radiusOverride ?? radiusKm,
      ...preference,
    });

    setSubmittedPrompt(nextPrompt);
    replaceChain(placeIds);
    setRecommendReason(null);
    setIsAiCourse(false);
    setCourseAnchor(anchor);
    setCourseAreaFilter(null);
    setRadiusMessage(null);
  }

  async function startCourseFromPrompt(nextPrompt: string, radiusOverride?: number) {
    radiusChainCacheRef.current.clear();
    setIsRecommending(true);
    setRecommendReason(null);
    setIsAiCourse(true);
    setUsedAI(false);
    const effectiveRadius = radiusOverride ?? radiusKm;

    try {
      // hasSpecificLocation (server-side, from the prompt itself) takes priority over
      // this anchor when the prompt already names its own area.
      const anchor = await getCurrentLocation();
      const response = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: nextPrompt,
          locale,
          anchor,
          radiusKm: effectiveRadius,
          bookmarkedPlaceIds: [...bookmarkedPlaceIds],
        }),
      });

      if (!response.ok) {
        throw new Error("recommend request failed");
      }

      const data = await response.json();

      if (!Array.isArray(data.placeIds) || data.placeIds.length === 0) {
        throw new Error("recommend response malformed");
      }

      replaceChain(data.placeIds);
      setRecommendReason(typeof data.reason === "string" ? data.reason : null);
      setUsedAI(data.usedAI === true);
      setSubmittedPrompt(nextPrompt);
      setCourseAnchor(
        data.anchor && typeof data.anchor.lat === "number" && typeof data.anchor.lng === "number"
          ? { lat: data.anchor.lat, lng: data.anchor.lng }
          : null,
      );
      setCourseAreaFilter(typeof data.areaFilter === "string" ? data.areaFilter : null);
    } catch {
      const result = buildChain({
        categories: [],
        attributes: [],
        placeCount: 4,
        radiusKm: effectiveRadius,
        ...preference,
      });
      replaceChain(result.placeIds);
      setSubmittedPrompt(nextPrompt);
      setCourseAnchor(result.anchor);
      setCourseAreaFilter(null);
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

  // Adjusts scope around the SAME anchor the current course started from, rather than
  // re-rolling location/AI intent (that's what the refresh button is for). When the
  // course is anchored to a named district (courseAreaFilter), buildChain treats that
  // district as a hard ceiling — radius genuinely narrows/widens the pool within it, but
  // widening can never spill into a neighboring district. If the anchor genuinely can't
  // support the requested radius, says so instead of silently expanding past it.
  function changeRadius(direction: -1 | 1) {
    if (!courseAnchor) {
      setRadiusMessage(t("radiusUnavailable"));
      return;
    }

    // Widening further wouldn't add any new candidates (already covers every place in
    // scope) — say so instead of silently reshuffling the same pool into a course that
    // only looks different.
    if (direction === 1 && isRadiusAtMaxCoverage) {
      setRadiusMessage(t("radiusNoWiderRoom"));
      return;
    }

    const currentIndex = RADIUS_STEPS_KM.indexOf(radiusKm);
    const baseIndex = currentIndex === -1 ? RADIUS_STEPS_KM.indexOf(DEFAULT_RADIUS_KM) : currentIndex;
    const nextIndex = Math.min(RADIUS_STEPS_KM.length - 1, Math.max(0, baseIndex + direction));
    const nextRadius = RADIUS_STEPS_KM[nextIndex];

    if (nextRadius === radiusKm) {
      return;
    }

    // Stepping back to a radius already seen this course restores exactly what was
    // there instead of rebuilding a fresh (differently-randomized) chain — only the
    // refresh button or a new search should ever produce a genuinely new pick.
    const cachedChainIds = radiusChainCacheRef.current.get(nextRadius);
    if (cachedChainIds) {
      setRadiusKm(nextRadius);
      replaceChain(cachedChainIds);
      setRadiusMessage(null);
      return;
    }

    const result = buildChain({
      categories: [],
      attributes: [],
      placeCount: chainPlaces.length || 4,
      anchor: courseAnchor,
      areaFilter: courseAreaFilter,
      radiusKm: nextRadius,
      strictRadius: true,
      ...preference,
    });

    if (result.placeIds.length < 2) {
      setRadiusMessage(t("radiusNoPlaces"));
      return;
    }

    setRadiusKm(nextRadius);
    replaceChain(result.placeIds);
    setRecommendReason(null);
    setRadiusMessage(null);
  }

  // A course's stop order isn't always a sensible walking route — manually adding stops
  // one at a time only ever inserts each new one at its single best spot (never
  // re-checks earlier stops), and a shared/loaded course carries whatever order its
  // original author left it in. This re-sorts the CURRENT stops for the shortest walk
  // without changing which places are in the chain.
  // The shortest-walk order is the default whenever a stop is added or swapped in — there's
  // no separate "optimize" button. Pinned stops stay exactly where they are and the rest
  // are re-sorted around them; that's also how a hand-dragged order survives (pin it).
  // Past EXACT_ROUTE_MAX stops the only optimizer left is a greedy approximation that
  // would scramble a long hand-built chain, so those keep the cheapest-insertion order.
  function autoOrder(ids: string[]): string[] {
    if (ids.length > EXACT_ROUTE_MAX) {
      return ids;
    }
    return optimizeRoutePreservingPins(getPlacesByIds(ids), pinnedIds).map((place) => place.id);
  }

  // Every wholesale chain replacement (new search, refresh, radius step, loaded trip, ...)
  // starts a different course, so pins from the old one don't carry over.
  function replaceChain(ids: string[]) {
    setChainIds(ids);
    setPinnedIds(new Set());
    setExpandedStopId(null);
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

  function removeStop(id: string) {
    setChainIds((current) => current.filter((placeId) => placeId !== id));
    setExpandedStopId((current) => (current === id ? null : current));
    setPinnedIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
  }

  // The explicit "shortest walk" action (the map's route button): reorders the unpinned
  // stops, whatever the count, and reports whether anything actually moved.
  function optimizeOrder(): boolean {
    if (isOptimized) {
      return false;
    }
    setChainIds(optimizeRoutePreservingPins(chainPlaces, pinnedIds).map((place) => place.id));
    return true;
  }

  // "코스 확정하기": if the walk could be shorter, ask before publishing.
  function requestPublish() {
    if (isOptimized) {
      setShowPublish(true);
    } else {
      setIsOptimizePromptOpen(true);
    }
  }

  function confirmOptimizeThenPublish(shouldOptimize: boolean) {
    if (shouldOptimize) {
      optimizeOrder();
    }
    setIsOptimizePromptOpen(false);
    setShowPublish(true);
  }

  function togglePin(id: string) {
    // A pinned stop can't be swapped, so pinning closes its alternatives panel.
    if (expandedStopId === id) {
      setExpandedStopId(null);
    }
    setPinnedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSwapPanel(id: string) {
    setStaticPanelId(null);
    if (expandedStopId === id) {
      setExpandedStopId(null);
      return;
    }
    const index = chainPlaces.findIndex((place) => place.id === id);
    setSwapCandidateIds(
      rankReplacementStops(chainPlaces, index, {
        areaFilter: courseAreaFilter,
        limit: NEARBY_LABELS.length,
      }).map((entry) => entry.place.id),
    );
    setExpandedStopId(id);
  }

  // Puts the picked alternative into the stop's slot and hands the old stop the
  // alternative's row in the panel (so "C" now offers what C replaced). The panel stays open
  // on the new card, and both sides play a short animation so the swap is visible.
  function replaceStop(oldId: string, replacement: MobilePlace) {
    setSwapCandidateIds((current) => current.map((id) => (id === replacement.id ? oldId : id)));
    setEnteredIds((current) => new Set(current).add(replacement.id));
    setExpandedStopId(replacement.id);
    setStaticPanelId(replacement.id);
    setSwapFlash({ cardId: replacement.id, rowId: oldId });
    window.setTimeout(() => setSwapFlash(null), 1100);
    // The slot stays where it is: re-optimizing here would move the card the user is
    // working on out from under them. Reordering is a separate, explicit action.
    setChainIds((current) => current.map((id) => (id === oldId ? replacement.id : id)));
  }

  function reorderChainTo(id: string, toIndex: number) {
    setChainIds((current) => {
      const fromIndex = current.indexOf(id);
      if (fromIndex === -1 || fromIndex === toIndex) {
        return current;
      }
      const desired = [...current];
      const [moved] = desired.splice(fromIndex, 1);
      desired.splice(toIndex, 0, moved);
      if (pinnedIds.size === 0) {
        return desired;
      }

      // Pinned stops never move: keep them at their current slots and deal the unpinned
      // ones into the remaining slots in the order the drag just produced, so dragging
      // past a pinned card hops over it instead of nudging it.
      const freeOrder = desired.filter((placeId) => !pinnedIds.has(placeId));
      let cursor = 0;
      const next = current.map((placeId) => (pinnedIds.has(placeId) ? placeId : freeOrder[cursor++]));
      return next.every((placeId, index) => placeId === current[index]) ? current : next;
    });
  }

  function getChainCard(id: string): HTMLElement | null {
    return chainListRef.current?.querySelector<HTMLElement>(`[data-chain-id="${CSS.escape(id)}"]`) ?? null;
  }

  // Keeps the dragged card glued to the pointer: its slot (offsetTop) jumps whenever the
  // order changes mid-drag, so the transform is whatever offset closes the gap between
  // where the pointer is and where the card's slot currently sits.
  function positionDraggedCard() {
    const dragState = dragStateRef.current;
    const card = dragState ? getChainCard(dragState.id) : null;
    if (!dragState || !card) {
      return;
    }
    const offset = dragState.lastY - dragState.startY - (card.offsetTop - dragState.startTop);
    card.style.transform = `translateY(${offset}px) scale(1.02)`;
  }

  function handleChainDragStart(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    // React only suppresses mouse/click handlers on a disabled button, not pointer ones.
    if (pinnedIds.has(id)) {
      return;
    }
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const card = getChainCard(id);
    dragStateRef.current = {
      id,
      lastY: event.clientY,
      startTop: card?.offsetTop ?? 0,
      startY: event.clientY,
    };
    setDraggingChainId(id);
  }

  function handleChainDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const dragState = dragStateRef.current;
    const container = chainListRef.current;
    if (!dragState || !container) {
      return;
    }

    dragState.lastY = event.clientY;

    // Slot geometry comes from untransformed offsets (not getBoundingClientRect) so the
    // dragged card's own follow-the-pointer transform can't feed back into which slot it
    // thinks it's hovering and make the order flicker.
    const cards = [...container.querySelectorAll<HTMLElement>("[data-chain-id]")];
    const origin = cards[0]?.offsetTop ?? 0;
    const pointerY = event.clientY - container.getBoundingClientRect().top;
    let targetIndex = cards.length - 1;

    for (let i = 0; i < cards.length; i++) {
      const mid = cards[i].offsetTop - origin + cards[i].offsetHeight / 2;
      if (pointerY < mid) {
        targetIndex = i;
        break;
      }
    }

    reorderChainTo(dragState.id, targetIndex);
    positionDraggedCard();
  }

  function handleChainDragEnd() {
    const dragState = dragStateRef.current;
    const card = dragState ? getChainCard(dragState.id) : null;
    dragStateRef.current = null;
    setDraggingChainId(null);

    if (!card) {
      return;
    }
    // Settle into the slot instead of snapping: animate from where the finger left it.
    const from = card.style.transform || "translateY(0)";
    card.style.transform = "";
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      card.animate([{ transform: from }, { transform: "translateY(0) scale(1)" }], {
        duration: 220,
        easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      });
    }
  }

  function refreshCardTops() {
    const container = chainListRef.current;
    if (!container) {
      return;
    }
    cardTopsRef.current = new Map(
      [...container.querySelectorAll<HTMLElement>("[data-chain-id]")].map((card) => [
        card.dataset.chainId as string,
        card.offsetTop,
      ]),
    );
  }

  // Opening/closing a card's panel moves every card below it without changing the order,
  // so the cached positions the FLIP below compares against go stale. While a panel is
  // animating open they're dropped (its onAnimationEnd re-measures); after a close
  // there's nothing animating, so they're re-measured straight away.
  useLayoutEffect(() => {
    if (expandedStopId === null) {
      refreshCardTops();
    } else {
      cardTopsRef.current = new Map();
    }
  }, [expandedStopId]);

  // FLIP: whenever the order (or membership) changes, every card that landed somewhere
  // else slides from its previous position to its new one rather than teleporting — this
  // is what makes dragging, deleting, and swapping read as motion. The dragged card is
  // skipped (it's driven by the pointer instead), and nothing animates on first paint.
  useLayoutEffect(() => {
    const container = chainListRef.current;
    if (!container) {
      cardTopsRef.current = new Map();
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const draggingId = dragStateRef.current?.id;
    const nextTops = new Map<string, number>();

    for (const card of container.querySelectorAll<HTMLElement>("[data-chain-id]")) {
      const id = card.dataset.chainId as string;
      const top = card.offsetTop;
      nextTops.set(id, top);
      const previousTop = cardTopsRef.current.get(id);
      if (!reduceMotion && previousTop !== undefined && previousTop !== top && id !== draggingId) {
        card.animate(
          [{ transform: `translateY(${previousTop - top}px)` }, { transform: "translateY(0)" }],
          { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
    }

    cardTopsRef.current = nextTops;
    positionDraggedCard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainIds]);

  function addToChain(place: MobilePlace) {
    if (!hasResult) {
      setSubmittedPrompt(t("startedFromPlacePrompt", { name: place.name }));
      replaceChain([place.id]);
      setSelectedPlaceId(null);
      return;
    }

    if (!chainIds.includes(place.id)) {
      // Same blue glow as a swap, so the card that just joined is easy to spot.
      setAddedId(place.id);
      window.setTimeout(() => setAddedId(null), 1100);
    }
    setChainIds((current) => {
      if (current.includes(place.id)) {
        return current;
      }
      const insertAt = findBestInsertionIndex(getPlacesByIds(current), place);
      return autoOrder([...current.slice(0, insertAt), place.id, ...current.slice(insertAt)]);
    });
    setSelectedPlaceId(null);
  }

  function handlePublish(input: { title: string; description: string; visibility: TripVisibility }) {
    const trip: FeedTrip = {
      // handlePublish only ever runs from PublishSheet's submit click, never during
      // render, so a timestamp-based id here is a safe, one-shot side effect.
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
    replaceChain([]);
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

  function addComment(tripId: string, text: string) {
    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const comment: TripComment = {
      id: `comment-${Date.now()}`,
      authorName: t("travelerName"),
      text: trimmed,
    };

    setUserComments((current) => ({
      ...current,
      [tripId]: [...(current[tripId] ?? []), comment],
    }));
  }

  function toggleBookmarkPlace(id: string) {
    setBookmarkedPlaceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function deleteTrip(id: string) {
    setPublishedTrips((current) => current.filter((trip) => trip.id !== id));
    setLikedIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSavedIds((current) => {
      if (!current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setRecentlyViewedTripIds((current) => current.filter((tripId) => tripId !== id));
    setOpenTripId(null);
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
    replaceChain(trip.placeIds);
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
    <main className="h-[var(--app-vh,100svh)] bg-[#edf2f7] text-foreground">
      <section className="relative mx-auto flex h-[var(--app-vh,100svh)] w-full max-w-[430px] flex-col overflow-hidden bg-background shadow-panel [padding-top:env(safe-area-inset-top)] sm:max-h-[900px]">
        <IntroSplash contained />
        <div
          className="app-scroll-area min-h-0 flex-1 overflow-y-auto"
          onScroll={(event) => {
            // Once the page title has scrolled up under the floating profile/explore
            // buttons, a frosted fade appears behind them so they stay legible over
            // whatever is scrolling past.
            const container = event.currentTarget;
            const title = container.querySelector<HTMLElement>("[data-home-title]");
            const next = title
              ? title.getBoundingClientRect().bottom < container.getBoundingClientRect().top + 56
              : false;
            setIsTitleScrolledAway((current) => (current === next ? current : next));
          }}
        >
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
                  onClick={() => setActiveTab("explore")}
                  style={{ color: "var(--success)" }}
                  type="button"
                >
                  {t("quickBrowse")}
                </button>

                <LanguageMenuButton className="absolute left-5 z-20 [bottom:calc(1rem+env(safe-area-inset-bottom))]" />
              </div>
            ) : (
              <div className={cn(tabSlideClass, "relative flex min-h-full flex-col px-5 pb-24 pt-5")}>
                <header className="relative z-10 text-left">
                  <p className="text-xs font-extrabold text-primary">Trip Chain Beta</p>
                  <h1
                    className="mt-3 text-3xl font-extrabold leading-tight tracking-normal text-balance"
                    data-home-title
                  >
                    {t("heroTitle")}
                  </h1>
                </header>

                <div className="relative z-10 mt-7">{searchForm}</div>

              {hasResult && (
                <section className="mt-5 grid gap-4">
                  <article className="rounded-lg border border-border bg-surface p-4 shadow-soft">
                    <div className="flex items-center justify-between gap-3">
                      <Badge tone={isAiCourse && usedAI ? "blue" : "neutral"}>
                        {isAiCourse && usedAI ? t("aiCourseBadge") : t("basicCourseBadge")}
                      </Badge>
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
                          disabled={
                            isRecommending ||
                            radiusKm === RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1] ||
                            isRadiusAtMaxCoverage
                          }
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
                        {chainPlaces.length >= 2 && (
                          <div className="relative">
                            <button
                              aria-label={t("navigateCourseAria")}
                              className={cn(
                                "grid h-8 w-8 place-items-center rounded-full border transition",
                                isNavigateMenuOpen
                                  ? "border-primary text-primary"
                                  : "border-border text-muted-strong hover:border-primary hover:text-primary",
                              )}
                              onClick={() => setIsNavigateMenuOpen((open) => !open)}
                              title={t("navigateCourseTitle")}
                              type="button"
                            >
                              <NavigationIcon className="h-3.5 w-3.5" />
                            </button>
                            {isNavigateMenuOpen && (
                              <>
                                <button
                                  aria-hidden="true"
                                  className="fixed inset-0 z-10 cursor-default"
                                  onClick={() => setIsNavigateMenuOpen(false)}
                                  tabIndex={-1}
                                />
                                <div className="absolute right-0 top-full z-20 mt-2 flex items-center gap-1.5 rounded-full border border-border bg-surface p-1.5 shadow-soft">
                                  <button
                                    aria-label={t("mapKakao")}
                                    className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full transition hover:opacity-80"
                                    onClick={() => {
                                      setIsNavigateMenuOpen(false);
                                      window.open(buildKakaoWalkingRouteUrl(chainPlaces), "_blank", "noopener,noreferrer");
                                    }}
                                    title={t("mapKakao")}
                                    type="button"
                                  >
                                    <img alt="" className="h-full w-full object-cover" src="/map-icons/kakao-map-pin.png" />
                                  </button>
                                  <button
                                    aria-label={t("mapGoogle")}
                                    className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full border border-border-strong bg-surface-muted transition hover:opacity-80"
                                    onClick={() => {
                                      setIsNavigateMenuOpen(false);
                                      window.open(
                                        buildGoogleMapsWalkingRouteUrl(chainPlaces),
                                        "_blank",
                                        "noopener,noreferrer",
                                      );
                                    }}
                                    title={t("mapGoogle")}
                                    type="button"
                                  >
                                    {/* Sized down so the rainbow pin itself roughly matches the size of
                                        the blue pin inside the Kakao badge (not the badge/frame size) —
                                        the extra room this reveals is the white background beneath it. */}
                                    <img
                                      alt=""
                                      className="h-full w-full scale-75 object-cover"
                                      src="/map-icons/google-maps-pin.jpg"
                                    />
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        )}
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
                      <ConstellationCard nudgeOptimize={!isOptimized} onOptimize={optimizeOrder} places={chainPlaces} suggestions={suggestionPlaces} />
                    </div>
                    {recommendReason && (
                      <p className="mt-2 text-xs leading-5 text-muted-strong">{recommendReason}</p>
                    )}
                    {isAiCourse && !usedAI && !isRecommending && (
                      <p className="mt-2 text-xs leading-5 text-muted">{t("aiFallbackNotice")}</p>
                    )}
                  </article>

                  <div className="grid gap-2" ref={chainListRef}>
                    {chainPlaces.map((place, index) => {
                      const localizedPlace = localizePlace(place, locale);
                      const isPinned = pinnedIds.has(place.id);
                      const isSwapOpen = expandedStopId === place.id;
                      const isDragging = draggingChainId === place.id;
                      return (
                      <article
                        className={cn(
                          "relative min-w-0 rounded-lg border bg-surface p-2.5 shadow-soft",
                          !enteredIds.has(place.id) && "chain-card-in",
                          swapFlash?.cardId === place.id && "chain-card-swapped",
                          addedId === place.id && "chain-card-added",
                          isPinned ? "border-primary" : "border-border",
                          isDragging ? "z-10 shadow-panel" : "transition-[border-color,box-shadow]",
                        )}
                        data-chain-id={place.id}
                        key={place.id}
                        onAnimationEnd={(event) => {
                          if (event.target === event.currentTarget) {
                            setEnteredIds((current) => new Set(current).add(place.id));
                          }
                        }}
                        style={{ animationDelay: `${index * 60}ms` }}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                        <button
                          aria-label={t("reorderAria")}
                          className="grid h-8 w-6 shrink-0 touch-none place-items-center text-muted disabled:opacity-30"
                          disabled={isPinned}
                          onPointerCancel={handleChainDragEnd}
                          onPointerDown={(event) => handleChainDragStart(event, place.id)}
                          onPointerMove={handleChainDragMove}
                          onPointerUp={handleChainDragEnd}
                          type="button"
                        >
                          <GripIcon className="h-4 w-4" />
                        </button>

                        <div className="flex min-w-0 flex-1 items-center gap-2.5">
                          <button
                            className="relative shrink-0"
                            onClick={() => setSelectedPlaceId(place.id)}
                            type="button"
                          >
                            <PlaceThumb category={place.category} size="sm" />
                            <span className="absolute -bottom-1 -left-1 grid h-4 w-4 place-items-center rounded-full bg-primary text-[9px] font-extrabold text-white ring-2 ring-background">
                              {index + 1}
                            </span>
                          </button>
                          <div className="min-w-0 flex-1 text-left">
                            {/* Typography goes on the inner span: the global `button { font: inherit }`
                                is unlayered and would beat these utilities on the button itself. */}
                            <button
                              className="block w-full text-left"
                              onClick={() => setSelectedPlaceId(place.id)}
                              type="button"
                            >
                              <span className="block truncate text-sm font-extrabold">{localizedPlace.name}</span>
                            </button>
                            <span className="block truncate text-xs text-muted">
                              {localizedPlace.area} · {localizedPlace.duration}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            aria-label={isPinned ? t("unpinStopAria") : t("pinStopAria")}
                            aria-pressed={isPinned}
                            className={cn(
                              "grid h-7 w-7 place-items-center rounded-sm border transition-colors duration-150",
                              isPinned
                                ? "border-primary bg-primary text-white hover:border-primary-strong hover:bg-primary-strong active:bg-primary-strong"
                                : "border-border text-muted-strong hover:border-primary hover:bg-primary/10 hover:text-primary active:border-primary active:bg-primary active:text-white",
                            )}
                            onClick={() => togglePin(place.id)}
                            title={isPinned ? t("unpinStopAria") : t("pinStopAria")}
                            type="button"
                          >
                            <PinIcon className="h-4 w-4" />
                          </button>
                          <button
                            aria-expanded={isSwapOpen}
                            aria-label={t("swapToggleAria")}
                            className={cn(
                              "grid h-7 w-7 place-items-center rounded-sm border transition-colors duration-150 disabled:opacity-30",
                              isSwapOpen
                                ? "border-primary bg-surface text-primary enabled:hover:bg-primary/10 enabled:active:bg-primary enabled:active:text-white"
                                : "border-border text-muted-strong enabled:hover:border-primary enabled:hover:bg-primary/10 enabled:hover:text-primary enabled:active:border-primary enabled:active:bg-primary enabled:active:text-white",
                            )}
                            disabled={isPinned}
                            onClick={() => toggleSwapPanel(place.id)}
                            title={t("swapToggleAria")}
                            type="button"
                          >
                            <MapSearchIcon className="h-4 w-4" />
                          </button>
                          <button
                            aria-label={t("deleteAria")}
                            className="grid h-7 w-7 place-items-center rounded-sm border border-border text-danger transition-colors duration-150 hover:border-danger hover:bg-danger/10 active:border-danger active:bg-danger active:text-white"
                            onClick={() => removeStop(place.id)}
                            type="button"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        </div>
                        </div>

                        {isSwapOpen && (
                          <div
                            className={cn("grid", staticPanelId !== place.id && "nearby-panel-in")}
                            onAnimationEnd={refreshCardTops}
                          >
                            <div className="min-h-0 overflow-hidden">
                              <div className="mt-2.5 border-t border-border pt-2.5">
                                <p className="mb-1.5 text-[11px] font-bold text-muted">
                                  {t("swapHeading", { name: localizedPlace.name })}
                                </p>
                                {panelStops.length === 0 ? (
                                  <p className="text-xs text-muted">{t("swapEmpty")}</p>
                                ) : (
                                  <ul className="grid gap-1.5">
                                    {panelStops.map(({ place: nearby, distanceKm }, nearbyIndex) => {
                                      const localizedNearby = localizePlace(nearby, locale);
                                      return (
                                        <li
                                          className={cn(
                                            "flex min-w-0 items-center gap-2 rounded-sm",
                                            swapFlash?.rowId === nearby.id && "swap-row-in",
                                          )}
                                          key={nearby.id}
                                        >
                                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-primary bg-white text-[10px] font-extrabold text-primary">
                                            {NEARBY_LABELS[nearbyIndex]}
                                          </span>
                                          <button
                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                            onClick={() => setSelectedPlaceId(nearby.id)}
                                            type="button"
                                          >
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                              alt=""
                                              className="h-9 w-9 shrink-0 rounded-sm bg-surface-muted object-cover"
                                              loading="lazy"
                                              src={getPlaceImageUrl(nearby.id)}
                                            />
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate text-xs font-bold">{localizedNearby.name}</span>
                                              <span className="block truncate text-[11px] text-muted">
                                                {localizedNearby.area} · {formatDistance(distanceKm)}
                                              </span>
                                            </span>
                                          </button>
                                          {swapFlash?.rowId === nearby.id && (
                                            <span className="swap-badge shrink-0 rounded-full bg-primary px-2 py-0.5 text-[10px] font-extrabold text-white">
                                              {t("swappedBadge")}
                                            </span>
                                          )}
                                          <button
                                            aria-label={t("swapPickLabel")}
                                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary text-primary transition hover:bg-primary hover:text-white"
                                            onClick={() => replaceStop(place.id, nearby)}
                                            title={t("swapPickLabel")}
                                            type="button"
                                          >
                                            <RotateUpIcon className="h-4 w-4" />
                                          </button>
                                          <button
                                            aria-label={t("addToChainLabel")}
                                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-primary text-primary transition hover:bg-primary hover:text-white"
                                            onClick={() => addToChain(nearby)}
                                            title={t("addToChainLabel")}
                                            type="button"
                                          >
                                            <PlaylistAddIcon className="h-4 w-4" />
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </article>
                      );
                    })}
                  </div>

                  <Button
                    disabled={chainPlaces.length < 2}
                    onClick={requestPublish}
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
              <button
                className="-ml-1 mb-2 self-start px-1 py-1 text-xs font-bold text-muted-strong transition hover:text-primary"
                onClick={() => setActiveTab("home")}
                type="button"
              >
                {t("back")}
              </button>
              <h1 className="text-xl font-extrabold">{t("exploreHeading")}</h1>
              <p className="mt-1 text-xs text-muted text-balance">
                {exploreSort === "weekly"
                  ? t("rankingWeeklySubtitle")
                  : exploreSort === "live"
                    ? t("rankingLiveSubtitle")
                    : t("exploreSubtitle")}
              </p>

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

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex shrink-0 rounded-sm border border-border bg-surface p-0.5 text-xs font-extrabold">
                  {(["all", "weekly", "live"] as const).map((sort) => (
                    <button
                      className={cn(
                        "rounded-xs px-2.5 py-1.5",
                        exploreSort === sort ? "bg-primary text-white" : "text-muted-strong",
                      )}
                      key={sort}
                      onClick={() => setExploreSort(sort)}
                      type="button"
                    >
                      {sort === "all"
                        ? t("exploreSortAll")
                        : sort === "weekly"
                          ? t("rankingWeekly")
                          : t("rankingLive")}
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
                    mode={exploreSort === "all" ? "explore" : "ranking"}
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

          {activeTab === "profile" && (
            <div className={tabSlideClass}>
              <button
                className="ml-4 mt-4 px-1 py-1 text-xs font-bold text-muted-strong transition hover:text-primary"
                onClick={() => setActiveTab("home")}
                type="button"
              >
                {t("back")}
              </button>
              <ProfileTab
                bookmarkedPlaces={bookmarkedPlaces}
                isSignedIn={isSignedIn}
                likedIds={likedIds}
                likedTrips={likedTrips}
                myTrips={publishedTrips}
                onOpenTrip={viewTrip}
                onSelectPlace={setSelectedPlaceId}
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

        {/* The first screen stays bare ("바로 탐색하기" is its way into explore). Profile and
            explore icons only appear once a course exists. */}
        {activeTab === "home" && hasResult && (
          <>
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 [height:calc(5.25rem+env(safe-area-inset-top))] transition-opacity duration-300",
                isTitleScrolledAway ? "opacity-100" : "opacity-0",
              )}
              style={{
                background:
                  "linear-gradient(to bottom, color-mix(in srgb, var(--background) 88%, transparent) 0%, color-mix(in srgb, var(--background) 62%, transparent) 55%, transparent 100%)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                maskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
                WebkitMaskImage: "linear-gradient(to bottom, black 55%, transparent 100%)",
              }}
            />
            <div
              className={cn(
                "pointer-events-none absolute left-5 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 flex h-10 items-center transition-opacity duration-300",
                isTitleScrolledAway ? "opacity-100" : "opacity-0",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Trip Chain" className="block h-[22px] w-auto" src="/tripchain-logo-horizontal.svg" />
            </div>
            <button
              aria-label={t("navProfile")}
              className="absolute right-4 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/90 text-muted-strong shadow-soft backdrop-blur transition hover:border-primary hover:text-primary"
              onClick={() => setActiveTab("profile")}
              type="button"
            >
              <UserIcon className="h-5 w-5" />
            </button>
            <button
              aria-label={t("navExplore")}
              className="absolute right-16 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 grid h-10 w-10 place-items-center rounded-full border border-border bg-surface/90 text-muted-strong shadow-soft backdrop-blur transition hover:border-primary hover:text-primary"
              onClick={() => setActiveTab("explore")}
              type="button"
            >
              <CompassIcon className="h-5 w-5" />
            </button>
          </>
        )}

        {viewingCategory && (
          <CategorySheet
            areaName={t("seoulWide")}
            badges={viewingCategoryBadges}
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
            isBookmarked={bookmarkedPlaceIds.has(selectedPlace.id)}
            isInChain={chainIds.includes(selectedPlace.id)}
            onAddToChain={addToChain}
            onClose={() => setSelectedPlaceId(null)}
            onToggleBookmark={toggleBookmarkPlace}
            place={selectedPlace}
          />
        )}

        {isOptimizePromptOpen && (
          <div
            className="sheet-backdrop absolute inset-0 z-50 grid place-items-center bg-black/40 px-8"
            onClick={() => setIsOptimizePromptOpen(false)}
            role="presentation"
          >
            <div
              aria-labelledby="optimize-prompt-title"
              aria-modal="true"
              className="sheet-panel w-full max-w-[320px] rounded-lg bg-surface p-4 shadow-panel"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <h3 className="text-base font-extrabold" id="optimize-prompt-title">
                {t("optimizePromptTitle")}
              </h3>
              <p className="mt-1.5 text-sm leading-6 text-muted-strong">{t("optimizePromptBody")}</p>
              <div className="mt-4 grid gap-2">
                <Button onClick={() => confirmOptimizeThenPublish(true)}>{t("optimizePromptYes")}</Button>
                <Button onClick={() => confirmOptimizeThenPublish(false)} variant="secondary">
                  {t("optimizePromptNo")}
                </Button>
              </div>
            </div>
          </div>
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
            comments={openTripComments}
            isLiked={likedIds.has(openTrip.id)}
            isSaved={savedIds.has(openTrip.id)}
            onAddComment={(text) => addComment(openTrip.id, text)}
            onClose={() => setOpenTripId(null)}
            onDelete={deleteTrip}
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
