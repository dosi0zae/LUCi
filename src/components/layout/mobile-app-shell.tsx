"use client";

import {
  CSSProperties,
  FormEvent,
  PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
  AiSparklesIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  CloseIcon,
  CompassIcon,
  GripIcon,
  LocateIcon,
  MapSearchIcon,
  MenuIcon,
  MinusIcon,
  MoreIcon,
  NavigationIcon,
  PinIcon,
  PlaylistAddIcon,
  PlusIcon,
  RefreshIcon,
  RotateUpIcon,
  RouteIcon,
  SearchIcon,
  TrashIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { IntroSplash } from "@/components/layout/intro-splash";
import { CourseSkeleton } from "@/features/mobile/course-skeleton";
import { flyDot, haptic } from "@/features/mobile/motion";
import { cn } from "@/lib/utils";
import {
  getPlaceById,
  getPlacesByIds,
  getSeedComments,
  estimateLegMinutes,
  getTotalMinutes,
  haversineKm,
  isDiningCategory,
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
import { readInitialLocale, useCategoryLabel, useLocale, usePromptExamples, useT } from "@/features/mobile/i18n/i18n-context";
import { dictionaries } from "@/features/mobile/i18n/translations";
import { buildPromptSuggestions, fetchSeoulWeather } from "@/features/mobile/prompt-suggestions";
import { PlaceMapScreen } from "@/features/mobile/place-map-screen";
import { categoryText, isCustomId, loadCustomPlaces, subscribeCustomPlaces } from "@/features/mobile/custom-places";
import { CategorySheet, type PlaceBadgeKind } from "@/features/mobile/category-sheet";
import { SideMenu } from "@/features/mobile/side-menu";
import { ConstellationCard } from "@/features/mobile/constellation-card";
import { decodeCourseFromLocation } from "@/features/mobile/course-share";
import {
  ensureDiningLoadedForIds,
  ensureDiningNear,
  getLoadedDiningPlaces,
  subscribeDining,
} from "@/features/mobile/dining-store";
import { placeSubtitle } from "@/features/mobile/dining-tags";
import { CreatorProfileSheet } from "@/features/mobile/creator-profile-sheet";
import { loadKakaoMaps } from "@/features/mobile/kakao-loader";
import {
  GOOGLE_CLIENT_ID,
  isGoogleAccount,
  type GoogleAccount,
} from "@/features/mobile/google-auth";
import { buildGoogleMapsWalkingRouteUrl, buildKakaoWalkingRouteUrl } from "@/features/mobile/route-links";
import { OnboardingTour } from "@/features/mobile/onboarding-tour";
import { useHistoryLayers } from "@/features/mobile/use-history-layers";
import { LegalLinks } from "@/features/mobile/legal-links";
import { PlaceSheet } from "@/features/mobile/place-sheet";
import { PlaceScroller } from "@/features/mobile/place-scroller";
import { useDragScroll } from "@/features/mobile/use-drag-scroll";
import { MyPictureContext } from "@/features/mobile/my-badge";
import { MapAppsPopover } from "@/features/mobile/map-apps-popover";
import { SlidingTabs } from "@/features/mobile/sliding-tabs";
import { buildTasteProfile, tasteScore, type TasteProfile } from "@/features/mobile/taste";
import { useHorizontalSwipe } from "@/features/mobile/use-swipe";
import { PhotoLightbox, PlacePhoto, PlacePhotoThumb } from "@/features/mobile/place-photo";
import { RecommendFeedback } from "@/features/mobile/recommend-feedback";
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
import { TripDetailSheet, type DetailOrigin } from "@/features/mobile/trip-detail-sheet";
import { TripFeedList } from "@/features/mobile/trip-feed-list";
import { ProfileTab } from "@/features/mobile/profile-tab";

// There's no bottom tab bar: home is the base screen, explore opens from a floating
// button on it, and profile from the avatar in its top-right corner. Ranking lives inside
// explore as a sort option rather than its own screen.
type TabId = "home" | "explore" | "profile";
type ExploreSort = "all" | "weekly" | "live";
// Left to right in the tab bar: live, all (the default, in the middle), weekly. Swiping follows the same order.
const EXPLORE_SORT_ORDER: ExploreSort[] = ["live", "all", "weekly"];
// Where (px below the scroll area's top) the pinned sort tabs sit: centered on the back button.
// The tab bar pins (shrinking and rising to the top) once it has scrolled up this close to the top of the list.
const EXPLORE_TABS_PIN_TOP = 44;

const TAB_ORDER: TabId[] = ["home", "explore", "profile"];

const OTHER_PLACES_PER_CATEGORY = 6;

// How many "near this stop" suggestions a chain card shows when expanded, and the letters
// that tie each one to its marker on the map (letters, so they can't be confused with the
// numbered stops of the chain itself).
const NEARBY_LABELS = ["A", "B", "C", "D", "E"];

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}
// "다른 장소도 볼까요?" lists sights as ONE group ("명소": tourist spots, heritage, culture venues and festivals together,
// like the map screen's filter), then each kind of dining on its own.
type PlaceGroup = PlaceCategory | "sights";
const DINING_ORDER: PlaceGroup[] = ["식당", "카페", "술집"];
// Restaurants/cafés/bars listed under "다른 장소도 볼까요?" must be within this of some stop;
// the full "더보기" list reaches further.
const OTHER_DINING_RADIUS_KM = 1.5;
// Sights under the same heading: nothing across the river from a course in Yongsan.
const OTHER_SIGHTS_RADIUS_KM = 4;
const MORE_DINING_RADIUS_KM = 3;

// Dining stops closest to the course first, with well-known ones (and ones trending up)
// nudged ahead — a famous place 400 m further beats an unknown one next door.
function diningRank(place: MobilePlace, chain: MobilePlace[]): number {
  return (
    distanceToChainKm(place, chain) -
    (place.dining?.pop === "high" ? 0.5 : 0) -
    (place.dining?.hot === "surge" || place.dining?.hot === "rising" ? 0.15 : 0)
  );
}
// The first screen's pieces rise in after the splash on the very first visit, and straight away when
// the person comes back to it later in the same session.
let heroIntroPlayed = false;
const PROFILE_STORAGE_KEY = "tripchain:profile";
const RECENTLY_VIEWED_LIMIT = 10;
// Courses opened from a share link are kept on the device (newest first) up to this many.
const IMPORTED_TRIPS_LIMIT = 30;
// Stands in for the author of a course that came through a link: the link carries no author, and there is
// no profile behind it to open.
const SHARED_AUTHOR_HANDLE = "shared-link";
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
  useDragScroll();
  const t = useT();
  const categoryLabel = useCategoryLabel();
  const { locale } = useLocale();
  const staticPromptExamples = usePromptExamples();
  // Three phrases put together from the weather, the time and what is popular right now. The first paint
  // (server and client alike) uses the fixed list, then they are swapped in once, while the hero is still
  // rising in; the weather is asked for at most ~2.5 s, and without it the phrases use the time of day.
  const [dynamicPromptExamples, setDynamicPromptExamples] = useState<{ locale: string; list: string[] } | null>(null);
  const promptExamples =
    dynamicPromptExamples && dynamicPromptExamples.locale === locale
      ? dynamicPromptExamples.list
      : staticPromptExamples.slice(0, 3);

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
  // startScroll is the scroll position of the page then (the page may scroll while a card is held near its edge).
  const dragStateRef = useRef<{ id: string; startY: number; startTop: number; startScroll: number; lastY: number } | null>(null);
  // Takes the listeners of a drag in progress off the window again.
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const chainListRef = useRef<HTMLDivElement | null>(null);
  // Stops the user pinned keep their exact position: drag/optimize/swap work around them.
  const [isTitleScrolledAway, setIsTitleScrolledAway] = useState(false);
  // Explore/profile have no title to wait for: the top fade shows as soon as the page scrolls.
  const [isScrolled, setIsScrolled] = useState(false);
  // Explore: once its sort tabs have scrolled up to the back button's line they are pinned
  // there (a floating copy takes over from the in-flow one).
  const exploreTabsRef = useRef<HTMLDivElement>(null);
  const exploreInputRef = useRef<HTMLInputElement>(null);
  const [isExploreTabsPinned, setIsExploreTabsPinned] = useState(false);
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
  // The first screen's side menu (explore, profile, language), and a short message when the position could not be had.
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
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
  const [viewingCategory, setViewingCategory] = useState<PlaceGroup | null>(null);
  const [viewingAuthorHandle, setViewingAuthorHandle] = useState<string | null>(null);
  const [showPublish, setShowPublish] = useState(false);
  // The stop whose photo is open full-size.
  const [photoPlaceId, setPhotoPlaceId] = useState<string | null>(null);
  const [isOptimizePromptOpen, setIsOptimizePromptOpen] = useState(false);
  const [openTripId, setOpenTripId] = useState<string | null>(null);
  // The map screen (search a place, see what is around it, add stops to the course).
  const [isMapOpen, setIsMapOpen] = useState(false);
  // Where the button that opened it sits, so the green spreads from there.
  const [mapReveal, setMapReveal] = useState<{ x: number; y: number; r: number } | null>(null);

  const [publishedTrips, setPublishedTrips] = useState<FeedTrip[]>([]);
  // Courses that arrived through a share link: kept on this device so the one that was opened (and anything
  // the user then liked or saved) is still there next time, but never mixed into "my" courses.
  const [importedTrips, setImportedTrips] = useState<FeedTrip[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [bookmarkedPlaceIds, setBookmarkedPlaceIds] = useState<Set<string>>(new Set());
  const [userComments, setUserComments] = useState<Record<string, TripComment[]>>({});
  const [recentlyViewedTripIds, setRecentlyViewedTripIds] = useState<string[]>([]);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [account, setAccount] = useState<GoogleAccount | null>(null);
  const [signInError, setSignInError] = useState<string | null>(null);

  const [exploreQuery, setExploreQuery] = useState("");
  // Gemini's picks for a search phrase, keyed by the normalized phrase: the trip ids that
  // fit it best, in order. An empty list means "no AI result" (failed or nothing fit).
  const [aiSearchResults, setAiSearchResults] = useState<Record<string, string[]>>({});

  const [exploreSort, setExploreSort] = useState<ExploreSort>("all");
  // Which way the list slides in when the sort changes (null until the first change).
  const [exploreSlideClass, setExploreSlideClass] = useState<string | null>(null);

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
    // A fresh set of phrases each time the first screen comes up (and in the chosen language).
    if (hasResult) {
      return;
    }
    let cancelled = false;
    // Set once, so the visible phrase does not change twice: wait briefly for the weather (it is cached
    // after the first answer, so later visits are instant), then go without it.
    void Promise.race([fetchSeoulWeather(), new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 1200))]).then(
      (weather) => {
        if (!cancelled) {
          setDynamicPromptExamples({ locale, list: buildPromptSuggestions(locale, weather) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [hasResult, locale]);

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
    //
    // The on-screen keyboard also shrinks the visual viewport. That must NOT shrink the app:
    // while a text field is focused the height stays at its last keyboard-free value (so the
    // screen doesn't jump up when the keyboard opens) and the keyboard's height is published
    // separately as --kb-h, for the few bottom-anchored items that have to clear it.
    const viewport = window.visualViewport;
    let stableHeight = viewport?.height ?? window.innerHeight;

    function isTextFieldFocused() {
      const element = document.activeElement;
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      if (element instanceof HTMLInputElement) {
        return !["checkbox", "radio", "button", "submit", "range", "file"].includes(element.type);
      }
      return element instanceof HTMLTextAreaElement || element.isContentEditable;
    }

    function syncAppHeight() {
      const height = viewport?.height ?? window.innerHeight;
      const editing = isTextFieldFocused();
      if (!editing || height >= stableHeight) {
        stableHeight = height;
      }
      // Bottom of the visible area in layout coordinates is offsetTop + height (iOS may pan
      // the visual viewport while the keyboard is open).
      const covered = editing ? Math.max(0, Math.round(stableHeight - height - (viewport?.offsetTop ?? 0))) : 0;
      const root = document.documentElement.style;
      root.setProperty("--app-vh", `${stableHeight}px`);
      root.setProperty("--kb-h", `${covered}px`);
    }

    syncAppHeight();
    viewport?.addEventListener("resize", syncAppHeight);
    viewport?.addEventListener("scroll", syncAppHeight);
    window.addEventListener("resize", syncAppHeight);
    window.addEventListener("orientationchange", syncAppHeight);
    // Only when a text field gains focus: a button taking focus while the keyboard is still
    // closing must not make the app adopt the keyboard-shrunk height.
    function handleFocusIn() {
      if (isTextFieldFocused()) {
        syncAppHeight();
      }
    }
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      viewport?.removeEventListener("resize", syncAppHeight);
      viewport?.removeEventListener("scroll", syncAppHeight);
      window.removeEventListener("resize", syncAppHeight);
      window.removeEventListener("orientationchange", syncAppHeight);
      document.removeEventListener("focusin", handleFocusIn);
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
          account?: unknown;
          publishedTrips?: FeedTrip[];
          importedTrips?: FeedTrip[];
          likedIds?: string[];
          savedIds?: string[];
          bookmarkedPlaceIds?: string[];
          userComments?: Record<string, TripComment[]>;
          recentlyViewedTripIds?: string[];
        };

        // One-time hydration from localStorage on mount, not a reactive sync loop.
        /* eslint-disable react-hooks/set-state-in-effect */
        if (parsed.isSignedIn) setIsSignedIn(true);
        if (isGoogleAccount(parsed.account)) setAccount(parsed.account);
        if (Array.isArray(parsed.publishedTrips)) setPublishedTrips(parsed.publishedTrips);
        if (Array.isArray(parsed.importedTrips)) setImportedTrips(parsed.importedTrips);
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
          account,
          publishedTrips,
          importedTrips,
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
  }, [isSignedIn, account, publishedTrips, importedTrips, likedIds, savedIds, bookmarkedPlaceIds, userComments, recentlyViewedTripIds]);

  // The Google button returns an ID token; the server confirms it with Google (and that it was issued
  // for this app) before the account is trusted. Only the public profile is kept, never the token.
  async function handleGoogleToken(accessToken: string) {
    setSignInError(null);
    try {
      const response = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });
      const data = await response.json();
      if (!response.ok || !isGoogleAccount(data?.account)) {
        throw new Error("sign-in rejected");
      }
      setAccount(data.account);
      setIsSignedIn(true);
    } catch {
      setSignInError(t("googleSignInFailed"));
    }
  }

  function toggleSignIn() {
    if (isSignedIn) {
      setIsSignedIn(false);
      setAccount(null);
      setSignInError(null);
      return;
    }
    setIsSignedIn(true);
  }

  const [isRecommending, setIsRecommending] = useState(false);
  // True while an AI course is being made: the loading card shows and the first screen gives way to
  // the course layout right away instead of sitting still for several seconds.
  const [isGenerating, setIsGenerating] = useState(false);
  const courseRunRef = useRef(0);
  const [isHeroSearchFocused, setIsHeroSearchFocused] = useState(false);
  const frameRef = useRef<HTMLElement>(null);
  const addSourceRef = useRef<DOMRect | null>(null);
  const [detailPhoto, setDetailPhoto] = useState<DOMRect | null>(null);

  // Remember which "add" button was just tapped so the stop can fly from it to the course.
  useEffect(() => {
    function remember(event: MouseEvent) {
      const button = (event.target as Element | null)?.closest("[data-add-source]");
      if (button) {
        addSourceRef.current = button.getBoundingClientRect();
      }
    }
    document.addEventListener("click", remember, true);
    return () => document.removeEventListener("click", remember, true);
  }, []);

  // First screen: tilting the phone moves the glow blobs (iOS asks for motion access on the first tap).
  useEffect(() => {
    if (activeTab !== "home" || hasResult || isGenerating) {
      return;
    }
    const Orientation = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } })
      .DeviceOrientationEvent;
    if (!Orientation) {
      return;
    }
    const clamp = (value: number) => Math.max(-1, Math.min(1, value));
    let attached = false;
    // Set straight away: the CSS transition on the blobs already smooths the jumps between readings.
    function onTilt(event: DeviceOrientationEvent) {
      if (event.gamma === null || event.beta === null) {
        return;
      }
      heroBlobsRef.current?.style.setProperty("--px", clamp(event.gamma / 22).toFixed(3));
      heroBlobsRef.current?.style.setProperty("--py", clamp((event.beta - 45) / 22).toFixed(3));
    }
    function attach() {
      if (!attached) {
        attached = true;
        window.addEventListener("deviceorientation", onTilt);
      }
    }
    const askForAccess = () => {
      Orientation.requestPermission?.()
        .then((state) => {
          if (state === "granted") {
            attach();
          }
        })
        .catch(() => undefined);
    };
    if (typeof Orientation.requestPermission === "function") {
      window.addEventListener("pointerdown", askForAccess, { once: true });
    } else {
      attach();
    }
    return () => {
      window.removeEventListener("pointerdown", askForAccess);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, [activeTab, hasResult, isGenerating]);
  const [detailOrigin, setDetailOrigin] = useState<DetailOrigin | null>(null);
  // The stop that is sliding away before it is really removed from the course.
  const [removing, setRemoving] = useState<{ id: string; height: number } | null>(null);
  const heroBlobsRef = useRef<HTMLDivElement>(null);
  const [heroBaseDelay] = useState(() => (heroIntroPlayed ? 0 : 1100));
  useEffect(() => {
    heroIntroPlayed = true;
  }, []);
  const [recommendReason, setRecommendReason] = useState<string | null>(null);
  // The AI's name for the course, kept with the request it answered: it is shown only while that
  // request is still the course heading (loading a trip or a shared link replaces the heading).
  const [courseTitle, setCourseTitle] = useState<{ title: string; prompt: string } | null>(null);
  // Which stop's "..." menu (pin / delete) is open.
  const [stopMenuId, setStopMenuId] = useState<string | null>(null);
  const [isAiCourse, setIsAiCourse] = useState(false);
  const [usedAI, setUsedAI] = useState(false);
  // What the last recommendation was (sentence, stops, which model read it, which conditions it could not keep): the good / not good
  // row under the course sends it along with the answer. `id` is the run number, so each new recommendation starts a fresh row.
  const [lastRecommendation, setLastRecommendation] = useState<{
    id: number;
    prompt: string;
    placeIds: string[];
    usedAI: boolean;
    model: string | null;
    unmet: string[];
  } | null>(null);
  // What the request could not get (another city, a condition the data does not hold...): small notes under the introduction.
  const [courseNotices, setCourseNotices] = useState<string[]>([]);
  // The AI's answer for each radius tried on the current request, so stepping back restores that answer whole (stops, title,
  // introduction), not only its stops.
  const aiRadiusCacheRef = useRef<
    Map<number, { ids: string[]; reason: string | null; title: string | null; usedAI: boolean; anchor: { lat: number; lng: number } | null; areaFilter: string | null; model: string | null; unmet: string[]; notices: string[] }>
  >(new Map());
  const [isNavigateMenuOpen, setIsNavigateMenuOpen] = useState(false);
  const navButtonRef = useRef<HTMLButtonElement>(null);
  // The "tell the AI how to change this course" box under the course card.
  const [refineText, setRefineText] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refineNote, setRefineNote] = useState<{ text: string; isError: boolean } | null>(null);

  // Dining stops come from per-district files loaded on demand (dining-store). Whatever ids the
  // screen may show — the course, its swap candidates, saved trips, bookmarks — get their
  // districts loaded here, and diningVersion bumps so the lookups below are read again.
  const [diningVersion, setDiningVersion] = useState(0);
  useEffect(() => subscribeDining(() => setDiningVersion((version) => version + 1)), []);
  // Places found on the map screen (not in our own data) come back from this device's storage, and the screens
  // that already read places while rendering look again once they are in.
  useEffect(() => {
    loadCustomPlaces();
    return subscribeCustomPlaces(() => setDiningVersion((version) => version + 1));
  }, []);
  useEffect(() => {
    // A sample course in 탐색 has a meal and a café too: they load when its detail is opened.
    const openTripPlaceIds = openTripId ? [...publishedTrips, ...importedTrips, ...seedFeedTrips].find((trip) => trip.id === openTripId)?.placeIds ?? [] : [];
    void ensureDiningLoadedForIds([
      ...chainIds,
      ...swapCandidateIds,
      ...bookmarkedPlaceIds,
      ...publishedTrips.flatMap((trip) => trip.placeIds),
      ...importedTrips.flatMap((trip) => trip.placeIds),
      ...openTripPlaceIds,
    ]);
  }, [chainIds, swapCandidateIds, bookmarkedPlaceIds, publishedTrips, importedTrips, openTripId]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const chainPlaces = useMemo(() => getPlacesByIds(chainIds), [chainIds, diningVersion]);

  // The description under the course was written for the stops the course first had. When the stops change by hand (one
  // added, removed or swapped; a plain reorder does not count) it is written again for the new set, after a short pause so
  // several edits in a row make one request. While that runs the old text is shown dimmed; without a new text it goes away
  // rather than say what is no longer true.
  const [isDescribing, setIsDescribing] = useState(false);
  const describedKeyRef = useRef<string | null>(null);
  const stopSetKey = useMemo(() => [...chainIds].sort().join(","), [chainIds]);
  const latestStopSetKeyRef = useRef(stopSetKey);
  useEffect(() => {
    latestStopSetKeyRef.current = stopSetKey;
  }, [stopSetKey]);
  useEffect(() => {
    if (!recommendReason) {
      describedKeyRef.current = null;
      return;
    }
    if (describedKeyRef.current === null) {
      // The text has just arrived with this set of stops.
      describedKeyRef.current = stopSetKey;
      return;
    }
    if (describedKeyRef.current === stopSetKey) {
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setIsDescribing(true);
      let next: string | null = null;
      try {
        const response = await fetch("/api/describe-course", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stops: chainPlaces.map((place) => {
              const shown = localizePlace(place, locale);
              return { name: shown.name, category: place.category, area: shown.area };
            }),
            prompt: submittedPrompt,
            locale,
          }),
        });
        if (response.ok) {
          const data = await response.json();
          next = typeof data.reason === "string" && data.reason ? data.reason : null;
        }
      } catch {
        // No new text: the old one goes away below.
      }
      if (cancelled || latestStopSetKeyRef.current !== stopSetKey) {
        return;
      }
      setIsDescribing(false);
      if (next) {
        describedKeyRef.current = stopSetKey;
      }
      setRecommendReason(next);
    }, 1000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      setIsDescribing(false);
    };
  }, [stopSetKey, recommendReason, chainPlaces, submittedPrompt, locale]);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bookmarkedPlaceIds, diningVersion],
  );

  useEffect(() => {
    // A link built by buildCourseShareUrl encodes the course's place ids directly, so it
    // resolves the same way for anyone (no server-side trip storage needed — see
    // course-share.ts). It opens as the course's own detail screen (what the sharer was looking at), from
    // where "load into my courses" makes it editable. Consumed once on mount, then stripped from the URL so a
    // later refresh doesn't open it again.
    const decoded = decodeCourseFromLocation(window.location.search);
    if (!decoded) {
      return;
    }

    // t() still holds the default language here (the saved one is applied after this effect), so the texts come
    // straight from the language this device will show.
    const startLocale = dictionaries[readInitialLocale()];

    // The same stops always give the same id, so opening one link twice keeps a single entry.
    const key = decoded.placeIds.join(",");
    let hash = 0;
    for (let index = 0; index < key.length; index += 1) {
      hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
    }
    const sharedTrip: FeedTrip = {
      id: `shared-${hash.toString(36)}`,
      title: decoded.title || startLocale.sharedCourseFallbackTitle,
      description: "",
      authorHandle: SHARED_AUTHOR_HANDLE,
      authorName: startLocale.sharedCourseAuthor,
      visibility: "link",
      placeIds: decoded.placeIds,
      likes: 0,
      comments: 0,
      saved: 0,
      rankScore: 0,
      isMine: false,
      publishedAt: new Date().toISOString(),
    };
    /* eslint-disable react-hooks/set-state-in-effect */
    setImportedTrips((current) => [sharedTrip, ...current.filter((trip) => trip.id !== sharedTrip.id)].slice(0, IMPORTED_TRIPS_LIMIT));
    setRecentlyViewedTripIds((current) => [sharedTrip.id, ...current.filter((id) => id !== sharedTrip.id)].slice(0, RECENTLY_VIEWED_LIMIT));
    setOpenTripId(sharedTrip.id);
    /* eslint-enable react-hooks/set-state-in-effect */
    window.history.replaceState(null, "", window.location.pathname);
  }, []);
  // Restaurants/cafés/bars around the course also load on their own: a sights course has no
  // dining stop to pull a district in, yet "다른 장소" should still offer them.
  const chainKey = chainIds.join(",");
  useEffect(() => {
    if (chainPlaces.length > 0) {
      void ensureDiningNear(chainPlaces, MORE_DINING_RADIUS_KM);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainKey]);

  const groupLabel = (group: PlaceGroup) => (group === "sights" ? t("mapFilterSights") : categoryLabel(group));

  const otherPlacesByCategory = useMemo(() => {
    const remaining = places.filter(
      (place) => !chainIds.includes(place.id) && distanceToChainKm(place, chainPlaces) <= OTHER_SIGHTS_RADIUS_KM,
    );
    const byCategory = new Map<PlaceGroup, MobilePlace[]>();

    for (const place of remaining) {
      const group: PlaceGroup = isDiningCategory(place.category) ? place.category : "sights";
      const bucket = byCategory.get(group) ?? [];
      bucket.push(place);
      byCategory.set(group, bucket);
    }

    const nearbyDining = getLoadedDiningPlaces().filter(
      (place) => !chainIds.includes(place.id) && distanceToChainKm(place, chainPlaces) <= OTHER_DINING_RADIUS_KM,
    );
    for (const place of nearbyDining) {
      const bucket = byCategory.get(place.category) ?? [];
      bucket.push(place);
      byCategory.set(place.category, bucket);
    }

    // A food-led course lists restaurants/cafés/bars first, a sights course lists them last.
    const diningLed = chainPlaces.filter((place) => isDiningCategory(place.category)).length * 2 >= chainPlaces.length;
    const order: PlaceGroup[] = diningLed ? [...DINING_ORDER, "sights"] : ["sights", ...DINING_ORDER];

    return order
      .map((category) => ({
        category,
        // Closest to the current chain first — someone already headed to these 4 stops is
        // far more likely to add a 5th one nearby than a merely popular spot across town.
        places: (byCategory.get(category) ?? [])
          .sort((a, b) =>
            category !== "sights" && isDiningCategory(category)
              ? diningRank(a, chainPlaces) - diningRank(b, chainPlaces)
              : distanceToChainKm(a, chainPlaces) - distanceToChainKm(b, chainPlaces),
          )
          .slice(0, OTHER_PLACES_PER_CATEGORY),
      }))
      .filter((group) => group.places.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainIds, chainPlaces, diningVersion]);

  const viewingCategoryPlaces = useMemo(() => {
    if (!viewingCategory) {
      return [];
    }
    if (viewingCategory !== "sights" && isDiningCategory(viewingCategory)) {
      return getLoadedDiningPlaces()
        .filter(
          (place) =>
            place.category === viewingCategory &&
            !chainIds.includes(place.id) &&
            distanceToChainKm(place, chainPlaces) <= MORE_DINING_RADIUS_KM,
        )
        .sort((a, b) => diningRank(a, chainPlaces) - diningRank(b, chainPlaces))
        .slice(0, 60);
    }
    return places
      .filter((place) => !isDiningCategory(place.category) && !chainIds.includes(place.id))
      .sort((a, b) => distanceToChainKm(a, chainPlaces) - distanceToChainKm(b, chainPlaces))
      // All the sights together are over a thousand: the nearest ones are what someone adding a stop wants.
      .slice(0, 80);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chainIds, chainPlaces, viewingCategory, diningVersion]);

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
      [...publishedTrips, ...importedTrips, ...seedFeedTrips].map((trip) => {
        const extraComments = userComments[trip.id]?.length ?? 0;
        return extraComments > 0 ? { ...trip, comments: trip.comments + extraComments } : trip;
      }),
    [publishedTrips, importedTrips, userComments],
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
  const aiSearchIds = aiSearchResults[normalizedExploreQuery];
  const isAiSearching =
    activeTab === "explore" && normalizedExploreQuery.length >= 2 && aiSearchIds === undefined;

  // Free-form search: after a short pause in typing, Gemini picks the courses that fit the
  // phrase. Until it answers (or if it can't) the plain text match below is what shows.
  useEffect(() => {
    const query = normalizedExploreQuery;
    if (activeTab !== "explore" || query.length < 2 || aiSearchResults[query] !== undefined) {
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      let ids: string[] = [];
      try {
        const response = await fetch("/api/search-trips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: exploreQuery.trim(),
            trips: allTrips.map((trip) => {
              const localized = localizeTrip(trip, locale);
              const tripPlaces = getPlacesByIds(trip.placeIds);
              return {
                id: trip.id,
                title: localized.title,
                description: localized.description,
                area: tripPlaces[0]?.area ?? "",
                places: tripPlaces.map((place) => place.name),
              };
            }),
          }),
          signal: controller.signal,
        });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.ids)) {
            ids = data.ids.filter((id: unknown): id is string => typeof id === "string");
          }
        }
      } catch {
        if (controller.signal.aborted) {
          return;
        }
      }
      setAiSearchResults((current) => ({ ...current, [query]: ids }));
    }, 600);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [activeTab, normalizedExploreQuery, aiSearchResults, exploreQuery, allTrips, locale]);

  function selectExploreSort(next: ExploreSort) {
    if (next === exploreSort) {
      return;
    }
    setExploreSlideClass(
      EXPLORE_SORT_ORDER.indexOf(next) > EXPLORE_SORT_ORDER.indexOf(exploreSort)
        ? "tab-slide-in-right"
        : "tab-slide-in-left",
    );
    setExploreSort(next);
  }

  // Swiping the list left/right moves to the next/previous sort, like the tab switch.
  const exploreSwipe = useHorizontalSwipe((direction) => {
    const next = EXPLORE_SORT_ORDER[EXPLORE_SORT_ORDER.indexOf(exploreSort) + direction];
    if (next) {
      selectExploreSort(next);
    }
  });

  // The explore tab bar is ONE control that morphs: in the page it is the full-width bar with the long words; when it has
  // scrolled up to the top it shrinks (and shortens its words) while it rises into the top bar, beside the back button.
  // Both words are always there and cross-fade, so nothing pops.
  const morphLabel = (long: string, short: string) => (
    <span className="grid place-items-center">
      <span className="col-start-1 row-start-1 transition-opacity duration-200" style={{ opacity: isExploreTabsPinned ? 0 : 1, transitionDelay: isExploreTabsPinned ? "0ms" : "220ms" }}>
        {long}
      </span>
      <span className="col-start-1 row-start-1 transition-opacity duration-200" style={{ opacity: isExploreTabsPinned ? 1 : 0, transitionDelay: isExploreTabsPinned ? "0ms" : "220ms" }}>
        {short}
      </span>
    </span>
  );
  const exploreTabs = (
    <SlidingTabs
      onChange={selectExploreSort}
      fullWidth
      options={[
        { value: "live", label: morphLabel(t("rankingLive"), t("rankingLiveShort")) },
        { value: "all", label: t("exploreSortAll") },
        { value: "weekly", label: morphLabel(t("rankingWeekly"), t("rankingWeeklyShort")) },
      ]}
      value={exploreSort}
    />
  );
  // True for a moment after the bar pins or unpins: only then does its top move with a transition (while it is
  // free it must follow the scrolling list exactly).
  const [isExploreTabsSettling, setIsExploreTabsSettling] = useState(false);

  // The taste behind the 전체 order is taken when Explore opens, not live: liking or saving a
  // course while browsing shouldn't make cards jump around under the finger. It updates the
  // next time the screen is opened.
  const [tasteSnapshot, setTasteSnapshot] = useState<TasteProfile>(() =>
    buildTasteProfile({ likedTrips: [], savedTrips: [], savedPlaces: [] }),
  );
  useLayoutEffect(() => {
    if (activeTab === "explore") {
      // The tab bar starts from its slot at the top of the page again (not where it was when Explore was left).
      frameRef.current?.style.removeProperty("--tabs-y");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setTasteSnapshot(buildTasteProfile({ likedTrips, savedTrips, savedPlaces: bookmarkedPlaces }));
    }
    // Deliberately only when the tab changes (see above).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const exploreTrips = useMemo(() => {
    let matching: FeedTrip[];
    if (!normalizedExploreQuery) {
      matching = allTrips;
    } else if (aiSearchIds && aiSearchIds.length > 0) {
      const byId = new Map(allTrips.map((trip) => [trip.id, trip]));
      matching = aiSearchIds.map((id) => byId.get(id)).filter((trip): trip is FeedTrip => Boolean(trip));
    } else {
      matching = allTrips.filter((trip) => {
        const tripPlaces = getPlacesByIds(trip.placeIds);
        const text = [
          trip.title,
          trip.description,
          trip.authorName,
          ...tripPlaces.map((place) => `${place.name} ${place.area}`),
        ]
          .join(" ")
          .toLowerCase();
        return text.includes(normalizedExploreQuery);
      });
    }

    if (exploreSort === "live") {
      return [...matching].sort(
        (a, b) => b.likes + b.saved + b.comments - (a.likes + a.saved + a.comments),
      );
    }
    if (exploreSort === "weekly") {
      return [...matching].sort((a, b) => b.rankScore - a.rankScore);
    }
    // 전체: ordered by the user's taste (what they saved and liked) — except when Gemini
    // picked the courses for a search, whose order is by relevance. Ties go to the newer one.
    if (normalizedExploreQuery && aiSearchIds && aiSearchIds.length > 0) {
      return matching;
    }
    // The user's own courses come first (newest first: their ids carry the time they were saved), then the rest by
    // taste. The two rankings ("live", "weekly") are not touched: a number there says how popular a course is.
    return matching
      .map((trip) => ({ trip, score: tasteScore(trip, tasteSnapshot) }))
      .sort((a, b) => {
        if (a.trip.isMine !== b.trip.isMine) {
          return a.trip.isMine ? -1 : 1;
        }
        if (a.trip.isMine) {
          return b.trip.id.localeCompare(a.trip.id);
        }
        return b.score - a.score || b.trip.publishedAt.localeCompare(a.trip.publishedAt);
      })
      .map((entry) => entry.trip);
  }, [allTrips, normalizedExploreQuery, aiSearchIds, exploreSort, tasteSnapshot]);

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
    setCourseNotices([]);
    setIsAiCourse(false);
    setCourseAnchor(anchor);
    setCourseAreaFilter(null);
    setRadiusMessage(null);
  }

  async function startCourseFromPrompt(nextPrompt: string, radiusOverride?: number) {
    radiusChainCacheRef.current.clear();
    // A radius step keeps the other radii's answers; anything else is a new request.
    if (radiusOverride === undefined) {
      aiRadiusCacheRef.current.clear();
    }
    // Browser Back during generation bumps this counter; the run then drops its result.
    const run = ++courseRunRef.current;
    const isCancelled = () => run !== courseRunRef.current;
    setIsRecommending(true);
    setIsGenerating(true);
    setIsMenuOpen(false);
    setIsHeroSearchFocused(false);
    setRecommendReason(null);
    setCourseTitle(null);
    setCourseNotices([]);
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
          // A radius step asks the same sentence again: it is not a new request for the log.
          radiusStep: radiusOverride !== undefined,
        }),
      });

      if (!response.ok) {
        throw new Error("recommend request failed");
      }

      const data = await response.json();

      if (!Array.isArray(data.placeIds) || data.placeIds.length === 0) {
        throw new Error("recommend response malformed");
      }

      await ensureDiningLoadedForIds(data.placeIds);
      if (isCancelled()) return;
      replaceChain(data.placeIds);
      setRecommendReason(typeof data.reason === "string" ? data.reason : null);
      setCourseTitle(typeof data.title === "string" && data.title ? { title: data.title, prompt: nextPrompt } : null);
      setUsedAI(data.usedAI === true);
      setLastRecommendation({
        id: run,
        prompt: nextPrompt,
        placeIds: data.placeIds.filter((id: unknown): id is string => typeof id === "string"),
        usedAI: data.usedAI === true,
        model: typeof data.model === "string" ? data.model : null,
        unmet: Array.isArray(data.unmet) ? data.unmet.filter((tag: unknown): tag is string => typeof tag === "string") : [],
      });
      setSubmittedPrompt(nextPrompt);
      setCourseAnchor(
        data.anchor && typeof data.anchor.lat === "number" && typeof data.anchor.lng === "number"
          ? { lat: data.anchor.lat, lng: data.anchor.lng }
          : null,
      );
      setCourseAreaFilter(typeof data.areaFilter === "string" ? data.areaFilter : null);
      const notices = Array.isArray(data.notices) ? data.notices.filter((text: unknown): text is string => typeof text === "string") : [];
      setCourseNotices(notices);
      aiRadiusCacheRef.current.set(effectiveRadius, {
        ids: data.placeIds.filter((id: unknown): id is string => typeof id === "string"),
        reason: typeof data.reason === "string" ? data.reason : null,
        title: typeof data.title === "string" && data.title ? data.title : null,
        usedAI: data.usedAI === true,
        anchor:
          data.anchor && typeof data.anchor.lat === "number" && typeof data.anchor.lng === "number"
            ? { lat: data.anchor.lat, lng: data.anchor.lng }
            : null,
        areaFilter: typeof data.areaFilter === "string" ? data.areaFilter : null,
        model: typeof data.model === "string" ? data.model : null,
        unmet: Array.isArray(data.unmet) ? data.unmet.filter((tag: unknown): tag is string => typeof tag === "string") : [],
        notices,
      });
    } catch {
      if (isCancelled()) return;
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
      if (!isCancelled()) {
        setIsRecommending(false);
        setIsGenerating(false);
        setRadiusMessage(null);
        haptic([12, 50, 12]);
      }
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

    // An AI course answers a sentence ("반포한강공원 보고 근처 걷는 코스"): a different radius is the same sentence asked again,
    // so the stops, the title and the introduction stay one answer. (Building a plain chain around the old centre would drop
    // what the person asked for while the heading still said it.) An answer already given for that radius is restored whole.
    if (isAiCourse && usedAI && submittedPrompt) {
      setRadiusKm(nextRadius);
      const cachedAnswer = aiRadiusCacheRef.current.get(nextRadius);
      if (cachedAnswer) {
        void (async () => {
          await ensureDiningLoadedForIds(cachedAnswer.ids);
          replaceChain(cachedAnswer.ids);
          setRecommendReason(cachedAnswer.reason);
          setCourseTitle(cachedAnswer.title ? { title: cachedAnswer.title, prompt: submittedPrompt } : null);
          setUsedAI(cachedAnswer.usedAI);
          setCourseAnchor(cachedAnswer.anchor);
          setCourseAreaFilter(cachedAnswer.areaFilter);
          setCourseNotices(cachedAnswer.notices);
          setLastRecommendation({ id: ++courseRunRef.current, prompt: submittedPrompt, placeIds: cachedAnswer.ids, usedAI: cachedAnswer.usedAI, model: cachedAnswer.model, unmet: cachedAnswer.unmet });
          setRadiusMessage(null);
        })();
        return;
      }
      void startCourseFromPrompt(submittedPrompt, nextRadius);
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
    return optimizeRoutePreservingPins(getPlacesByIds(ids), pinnedIds, false).map((place) => place.id);
  }

  // Every wholesale chain replacement (new search, refresh, radius step, loaded trip, ...)
  // starts a different course, so pins from the old one don't carry over.
  function replaceChain(ids: string[]) {
    setChainIds(ids);
    setPinnedIds(new Set());
    setExpandedStopId(null);
  }

  function locateNearby() {
    setLocationNotice(null);
    if (!navigator.geolocation) {
      setLocationNotice(t("locationFailed"));
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
      (error) => {
        setIsLocating(false);
        // Say why nothing happened: the permission is off (the person has to turn it on) or the position just did not come.
        setLocationNotice(t(error.code === error.PERMISSION_DENIED ? "locationDenied" : "locationFailed"));
      },
      { timeout: 8000 },
    );
  }

  // The message goes away by itself.
  useEffect(() => {
    if (!locationNotice) {
      return;
    }
    const timer = window.setTimeout(() => setLocationNotice(null), 6000);
    return () => window.clearTimeout(timer);
  }, [locationNotice]);

  // Asks /api/refine-course to change the current course as the user worded it ("카페 하나 더",
  // "두 번째 장소 빼줘"). The server answers with the whole new id list, validated against real
  // candidates; pinned stops always survive.
  async function refineCourse(instruction: string) {
    const text = instruction.trim();
    if (!text || isRefining || chainIds.length === 0) {
      return;
    }
    setIsRefining(true);
    setRefineNote(null);
    try {
      const response = await fetch("/api/refine-course", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: text, stopIds: chainIds, pinnedIds: [...pinnedIds], locale }),
      });
      const data = await response.json();
      if (data?.code === "tooManyStops") {
        setRefineNote({ text: t("refineTooManyStops"), isError: true });
        return;
      }
      if (!response.ok || !data.ok || !Array.isArray(data.ids)) {
        throw new Error("refine failed");
      }
      let ids = data.ids as string[];
      // The server only knows our own places, so a stop found on the map screen comes back missing: put it back
      // where it fits best.
      for (const customId of chainIds.filter((id) => isCustomId(id) && !ids.includes(id))) {
        const place = getPlaceById(customId);
        if (place) {
          const at = findBestInsertionIndex(getPlacesByIds(ids), place);
          ids = [...ids.slice(0, at), customId, ...ids.slice(at)];
        }
      }
      const changed = ids.join(",") !== chainIds.join(",");
      await ensureDiningLoadedForIds(ids);
      setChainIds(ids);
      setExpandedStopId(null);
      if (Array.isArray(data.added) && data.added.length > 0) {
        setAddedId(data.added[0]);
        window.setTimeout(() => setAddedId(null), 1100);
      }
      setRefineNote({ text: data.reason || t(changed ? "refineDone" : "refineNoChange"), isError: false });
      setRefineText("");
    } catch {
      setRefineNote({ text: t("refineFailed"), isError: true });
    } finally {
      setIsRefining(false);
    }
  }

  function removeStop(id: string) {
    // The card slides away first (it keeps its height until the gap closes), then the stop goes.
    if (removing) {
      return;
    }
    const card = chainListRef.current?.querySelector<HTMLElement>(`[data-chain-id="${CSS.escape(id)}"]`);
    if (card && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRemoving({ id, height: card.offsetHeight });
      window.setTimeout(() => {
        setRemoving(null);
        removeStopNow(id);
      }, 420);
      return;
    }
    removeStopNow(id);
  }

  function removeStopNow(id: string) {
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
    setChainIds(optimizeRoutePreservingPins(chainPlaces, pinnedIds, false).map((place) => place.id));
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

  async function toggleSwapPanel(id: string) {
    setStaticPanelId(null);
    if (expandedStopId === id) {
      setExpandedStopId(null);
      return;
    }
    const index = chainPlaces.findIndex((place) => place.id === id);
    // Alternatives for a restaurant/café/bar are other ones nearby, which may sit in a
    // district that isn't loaded yet.
    if (isDiningCategory(chainPlaces[index].category)) {
      await ensureDiningNear([chainPlaces[index]], 2);
    }
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

  useEffect(() => () => dragCleanupRef.current?.(), []);

  function getChainCard(id: string): HTMLElement | null {
    return chainListRef.current?.querySelector<HTMLElement>(`[data-chain-id="${CSS.escape(id)}"]`) ?? null;
  }

  function getChainScroller(): HTMLElement | null {
    return chainListRef.current?.closest<HTMLElement>(".app-scroll-area") ?? null;
  }

  // Keeps the dragged card glued to the pointer: its slot (offsetTop) jumps whenever the
  // order changes mid-drag, so the transform is whatever offset closes the gap between
  // where the pointer is and where the card's slot currently sits (and the page may have scrolled since).
  function positionDraggedCard() {
    const dragState = dragStateRef.current;
    const card = dragState ? getChainCard(dragState.id) : null;
    if (!dragState || !card) {
      return;
    }
    const scrolled = (getChainScroller()?.scrollTop ?? 0) - dragState.startScroll;
    const offset = dragState.lastY - dragState.startY - (card.offsetTop - dragState.startTop) + scrolled;
    card.style.transform = `translateY(${offset}px) scale(1.02)`;
  }

  // Which slot the pointer is over, and the order that follows from it.
  function updateChainDrag() {
    const dragState = dragStateRef.current;
    const container = chainListRef.current;
    if (!dragState || !container) {
      return;
    }

    // Slot geometry comes from untransformed offsets (not getBoundingClientRect) so the
    // dragged card's own follow-the-pointer transform can't feed back into which slot it
    // thinks it's hovering and make the order flicker.
    const cards = [...container.querySelectorAll<HTMLElement>("[data-chain-id]")];
    const origin = cards[0]?.offsetTop ?? 0;
    const pointerY = dragState.lastY - container.getBoundingClientRect().top;
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

  function finishChainDrag() {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
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

  // The drag is followed on the window, not on the handle: when the order changes React moves the dragged card's element
  // in the page, and a browser drops the pointer capture of an element that is moved, which used to stop the drag halfway
  // (the card stayed lifted and the order stopped following the finger).
  function handleChainDragStart(event: ReactPointerEvent<HTMLButtonElement>, id: string) {
    // React only suppresses mouse/click handlers on a disabled button, not pointer ones.
    if (pinnedIds.has(id) || dragStateRef.current) {
      return;
    }
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Only a nicety now: the window follows the drag anyway.
    }
    const card = getChainCard(id);
    dragStateRef.current = {
      id,
      lastY: event.clientY,
      startScroll: getChainScroller()?.scrollTop ?? 0,
      startTop: card?.offsetTop ?? 0,
      startY: event.clientY,
    };
    setDraggingChainId(id);

    const pointerId = event.pointerId;
    let frame = 0;

    // Holding a card near the top or bottom edge of the screen scrolls the page, faster the closer to the edge.
    function autoScroll() {
      const dragState = dragStateRef.current;
      const scroller = getChainScroller();
      if (dragState && scroller) {
        const box = scroller.getBoundingClientRect();
        const EDGE = 90;
        const top = box.top + 72; // the floating buttons are over the top of the page
        const bottom = box.bottom - 16;
        let speed = 0;
        if (dragState.lastY < top + EDGE) {
          speed = -Math.min(18, ((top + EDGE - dragState.lastY) / EDGE) * 18);
        } else if (dragState.lastY > bottom - EDGE) {
          speed = Math.min(18, ((dragState.lastY - (bottom - EDGE)) / EDGE) * 18);
        }
        if (speed !== 0) {
          const before = scroller.scrollTop;
          scroller.scrollTop += speed;
          if (scroller.scrollTop !== before) {
            updateChainDrag();
          }
        }
        frame = window.requestAnimationFrame(autoScroll);
      }
    }
    frame = window.requestAnimationFrame(autoScroll);

    function onMove(moveEvent: PointerEvent) {
      if (moveEvent.pointerId !== pointerId || !dragStateRef.current) {
        return;
      }
      dragStateRef.current.lastY = moveEvent.clientY;
      updateChainDrag();
    }
    function onEnd(endEvent: PointerEvent) {
      if (endEvent.pointerId === pointerId) {
        finishChainDrag();
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    dragCleanupRef.current = () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
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

  // A card that was just added may be off-screen (e.g. added from the place sheet or the
  // "other places" strip): bring it into view so its glow is actually seen.
  useEffect(() => {
    if (!addedId) {
      return;
    }
    const card = chainListRef.current?.querySelector<HTMLElement>(`[data-chain-id="${addedId}"]`);
    if (!card) {
      return;
    }
    const rect = card.getBoundingClientRect();
    if (rect.top < 72 || rect.bottom > window.innerHeight - 24) {
      card.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [addedId]);

  function openMap(from: HTMLElement) {
    const frame = frameRef.current?.getBoundingClientRect();
    // The green circle inside the button (data-morph) is what grows into the screen; a plain button grows from itself.
    const rect = (from.querySelector("[data-morph]") ?? from).getBoundingClientRect();
    setMapReveal(
      frame ? { x: rect.left + rect.width / 2 - frame.left, y: rect.top + rect.height / 2 - frame.top, r: rect.width / 2 } : null,
    );
    setIsMapOpen(true);
  }

  function addToChain(place: MobilePlace) {
    haptic();
    if (!hasResult) {
      setSubmittedPrompt(t("startedFromPlacePrompt", { name: place.name }));
      replaceChain([place.id]);
      setSelectedPlaceId(null);
      return;
    }

    if (!chainIds.includes(place.id)) {
      const from = addSourceRef.current;
      addSourceRef.current = null;
      if (from) {
        flyDot(from, () =>
          (chainListRef.current?.querySelector(`[data-chain-id="${CSS.escape(place.id)}"]`) ?? chainListRef.current)?.getBoundingClientRect() ?? null,
        );
      }
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

  function setTripCover(tripId: string, placeId: string) {
    setPublishedTrips((current) =>
      current.map((trip) => (trip.id === tripId ? { ...trip, coverPlaceId: placeId, coverImage: undefined } : trip)),
    );
  }

  function handlePublish(input: {
    title: string;
    description: string;
    visibility: TripVisibility;
    coverPlaceId: string;
    coverImage?: string;
  }) {
    const trip: FeedTrip = {
      // handlePublish only ever runs from PublishSheet's submit click, never during
      // render, so a timestamp-based id here is a safe, one-shot side effect.
      // eslint-disable-next-line react-hooks/purity
      id: `mine-${Date.now()}`,
      title: input.title,
      description: input.description,
      authorHandle: "you",
      authorName: account?.name ?? t("travelerName"),
      visibility: input.visibility,
      placeIds: chainIds,
      coverPlaceId: input.coverPlaceId,
      coverImage: input.coverImage,
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
    haptic();
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
    haptic();
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
      authorName: account?.name ?? t("travelerName"),
      text: trimmed,
    };

    setUserComments((current) => ({
      ...current,
      [tripId]: [...(current[tripId] ?? []), comment],
    }));
  }

  function toggleBookmarkPlace(id: string) {
    haptic();
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

  function viewTrip(trip: FeedTrip, origin?: DOMRect, photo?: DOMRect) {
    setDetailPhoto(photo ?? null);
    const frame = frameRef.current?.getBoundingClientRect();
    setDetailOrigin(
      origin && frame
        ? {
            top: Math.max(0, origin.top - frame.top),
            left: Math.max(0, origin.left - frame.left),
            right: Math.max(0, frame.right - origin.right),
            bottom: Math.max(0, frame.bottom - origin.bottom),
          }
        : null,
    );
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
    setCourseNotices([]);
    setIsAiCourse(false);
    setOpenTripId(null);
    setActiveTab("home");
  }

  // The browser's Back button steps out of the topmost open screen (topmost first) instead of
  // leaving the site: explore/profile → the first screen, a trip or place sheet → what was under it.
  useHistoryLayers([
    { open: isMenuOpen, close: () => setIsMenuOpen(false) },
    { open: viewingAuthorHandle !== null, close: () => setViewingAuthorHandle(null) },
    { open: openTripId !== null, close: () => setOpenTripId(null) },
    { open: showPublish, close: () => setShowPublish(false) },
    { open: isOptimizePromptOpen, close: () => setIsOptimizePromptOpen(false) },
    { open: photoPlaceId !== null, close: () => setPhotoPlaceId(null) },
    { open: selectedPlaceId !== null, close: () => setSelectedPlaceId(null) },
    { open: isMapOpen, close: () => setIsMapOpen(false) },
    { open: viewingCategory !== null, close: () => setViewingCategory(null) },
    { open: activeTab !== "home", close: () => setActiveTab("home") },
    {
      open: hasResult || isGenerating,
      close: () => {
        courseRunRef.current += 1; // cancels a generation still in flight
        setIsGenerating(false);
        setIsRecommending(false);
        setSubmittedPrompt("");
      },
    },
  ]);

  const searchForm = (
    <>
    <form
      className="glass-panel flex min-h-16 items-center gap-2 rounded-[2rem] py-2.5 pl-4 pr-2.5"
      data-tour="search-form"
      onSubmit={recommend}
    >
      <SearchIcon className="h-[1.375rem] w-[1.375rem] shrink-0 text-muted" />
      <input
        aria-label={t("searchInputAria")}
        className="min-w-0 flex-1 text-ellipsis bg-transparent text-base font-bold outline-none placeholder:font-semibold placeholder:text-muted"
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={t("searchPlaceholder")}
        type="search"
        value={prompt}
      />
      <button
        aria-label={t("locateNearbyAria")}
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted transition hover:bg-surface-muted hover:text-foreground active:scale-95 disabled:opacity-60"
        disabled={isLocating}
        onClick={locateNearby}
        title={t("locateNearbyTitle")}
        type="button"
      >
        {isLocating ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
        ) : (
          <LocateIcon className="h-[1.125rem] w-[1.125rem]" />
        )}
      </button>
      <button
        aria-label={prompt.trim() ? t("searchSubmitPromptAria") : t("searchSubmitAutoAria")}
        className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-white shadow-[0_6px_16px_rgba(47,111,228,0.35)] transition hover:bg-primary-strong active:scale-95 disabled:opacity-60"
        disabled={isRecommending}
        title={prompt.trim() ? t("searchSubmitPromptTitle") : t("searchSubmitAutoTitle")}
        type="submit"
      >
        {isRecommending ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
        ) : prompt.trim() ? (
          <ArrowRightIcon className="h-[1.125rem] w-[1.125rem]" />
        ) : (
          <AiSparklesIcon className="h-[1.375rem] w-[1.375rem]" />
        )}
      </button>
    </form>
    {locationNotice && (
      <p className="mt-2.5 break-keep px-3 text-center text-sm font-semibold text-danger" role="status">
        {locationNotice}
      </p>
    )}
    </>
  );

  return (
    <MyPictureContext.Provider value={account?.picture ?? null}>
    <main className="h-[var(--app-vh,100svh)] bg-[#edf2f7] text-foreground">
      <section className="relative mx-auto flex h-[var(--app-vh,100svh)] w-full max-w-[430px] flex-col overflow-hidden bg-background shadow-panel [padding-top:env(safe-area-inset-top)] sm:max-h-[900px]" ref={frameRef}>
        <IntroSplash contained />
        <SideMenu
          onClose={() => setIsMenuOpen(false)}
          onExplore={() => setActiveTab("explore")}
          onProfile={() => setActiveTab("profile")}
          open={isMenuOpen}
        />
        <div
          className="app-scroll-area min-h-0 flex-1 overflow-y-auto"
          // Room to scroll a focused field above the keyboard (the first screen instead lifts
          // its two bottom buttons, so its layout stays put).
          style={activeTab === "home" && !hasResult ? undefined : { paddingBottom: "var(--kb-h, 0px)" }}
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
            container.style.setProperty("--title-p", Math.min(1, container.scrollTop / 70).toFixed(3));
            const scrolled = container.scrollTop > 8;
            setIsScrolled((current) => (current === scrolled ? current : scrolled));
            const tabs = exploreTabsRef.current;
            const pinned = tabs
              ? tabs.getBoundingClientRect().top - container.getBoundingClientRect().top <= EXPLORE_TABS_PIN_TOP
              : false;
            if (tabs && frameRef.current) {
              // Where the bar sits in the page (px from the top of the frame): the morphing bar starts from here.
              frameRef.current.style.setProperty("--tabs-y", `${tabs.getBoundingClientRect().top - frameRef.current.getBoundingClientRect().top}px`);
            }
            if (pinned !== isExploreTabsPinned) {
              setIsExploreTabsPinned(pinned);
              setIsExploreTabsSettling(true);
              window.setTimeout(() => setIsExploreTabsSettling(false), pinned ? 600 : 260);
            }
          }}
        >
          {activeTab === "home" && (
            !hasResult && !isGenerating ? (
              <div
                className={cn(tabSlideClass, "hero-root relative min-h-full")}
                data-focus={isHeroSearchFocused}
                // The glow blobs lean toward the finger (each by its own depth, see .hero-blob).
                onPointerMove={(event) => {
                  const box = event.currentTarget.getBoundingClientRect();
                  const blobs = heroBlobsRef.current;
                  if (blobs && box.width > 0) {
                    blobs.style.setProperty("--px", (((event.clientX - box.left) / box.width - 0.5) * 2).toFixed(3));
                    blobs.style.setProperty("--py", (((event.clientY - box.top) / box.height - 0.5) * 2).toFixed(3));
                  }
                }}
                style={{ "--hero-base": `${heroBaseDelay}ms` } as CSSProperties}
              >
                <div className="hero-blobs" aria-hidden="true" ref={heroBlobsRef}>
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

                <div className="relative z-10 px-5 pt-[3.75rem] text-center">
                  {/* While the box is in use nothing in the layout moves (on iOS the keyboard makes the browser pan
                      the page itself, and anything the page does to the layout at the same time fights that pan
                      and judders). Only transforms and opacity: the logo shrinks to half size and travels down to
                      sit just above the box (--logo-fly-y is measured when the box gets focus), while the title
                      and subtitle scatter upward one after the other. Leaving the box plays it all backwards. */}
                  <div className={cn("relative z-10 py-1 [--rise:0ms]", heroBaseDelay === 0 && "hero-rise")}>
                    <div className="hero-logo-fly">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt="Trip Chain" className="hero-logo-float mx-auto block h-[5.3125rem] w-auto" src="/tripchain-logo.svg" />
                    </div>
                  </div>
                  <div aria-hidden={isHeroSearchFocused} className="hero-head-title">
                    <h1 className="hero-rise mt-3 break-keep text-[2rem] font-extrabold leading-[2.5rem] tracking-tight text-balance [--rise:110ms]">
                      {t("heroTitle")}
                    </h1>
                  </div>
                  <div aria-hidden={isHeroSearchFocused} className="hero-head-sub">
                    <p className="hero-rise mx-auto mt-4 max-w-[20.5rem] whitespace-pre-line break-keep text-base leading-7 text-muted [--rise:220ms]">
                      {t("heroSubtitle")}
                    </p>
                  </div>

                  <div
                    className="hero-search hero-rise relative mt-8 text-left [--rise:330ms]"
                    onBlurCapture={(event) => {
                      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                        setIsHeroSearchFocused(false);
                      }
                    }}
                    // Only a text field counts. The example under the box is a button inside this wrapper:
                    // its own focus (the first thing a tap does) must not fold the header, or the example
                    // would move out from under the finger before the tap could land.
                    onFocusCapture={(event) => {
                      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
                        if (!isHeroSearchFocused) {
                          // How far the logo has to travel: from where it sits to 2.58 rem above the box (its
                          // bottom edge is the scaling origin, so only the bottom edges matter). Measured now,
                          // before anything has moved, so the rectangles are the resting ones.
                          const root = event.currentTarget.closest<HTMLElement>(".hero-root");
                          const logo = root?.querySelector<HTMLElement>(".hero-logo-fly");
                          const form = event.currentTarget.querySelector("form");
                          if (root && logo && form) {
                            const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
                            const dy = form.getBoundingClientRect().top - 2.58 * rem - logo.getBoundingClientRect().bottom;
                            root.style.setProperty("--logo-fly-y", `${Math.round(dy)}px`);
                          }
                        }
                        setIsHeroSearchFocused(true);
                      }
                    }}
                  >
                    {searchForm}

                    {/* The rotating example stays under the box (also while typing). */}
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
                  className="ios-glass hero-rise hero-dock absolute inset-x-0 z-10 mx-auto flex h-12 w-fit items-center gap-2.5 rounded-full pl-6 pr-2 text-base font-bold [--rise:480ms] [bottom:calc(2.5rem+env(safe-area-inset-bottom))]"
                  data-tour="quick-browse"
                  onClick={(event) => openMap(event.currentTarget)}
                  style={{ color: "var(--success)" }}
                  type="button"
                >
                  {t("quickBrowse")}
                  {/* The same --success lime as the label, with a white arrow. */}
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-success text-white" data-morph>
                    <MapSearchIcon className="h-[1.125rem] w-[1.125rem]" />
                  </span>
                </button>

                {/* Terms and privacy policy under the explore button (Google asks for them on the home page). They stay put and fade out while the keyboard is up. */}
                <LegalLinks className="hero-rise hero-legal absolute inset-x-0 z-10 [--rise:600ms] [bottom:calc(0.75rem+env(safe-area-inset-bottom))]" />
              </div>
            ) : (
              <div className={cn(tabSlideClass, "relative flex min-h-full flex-col px-5 pb-24 pt-5")}>
                <header className="relative z-10 pt-12 text-left">
                  <h1
                    className="scroll-title text-3xl font-extrabold leading-tight tracking-normal text-balance"
                    data-home-title
                  >
                    {t("heroTitle")}
                  </h1>
                </header>

                <div className="relative z-10 mt-7">{searchForm}</div>

              {isGenerating ? (
                <section className="mt-5">
                  <CourseSkeleton />
                </section>
              ) : hasResult && (
                // minmax(0,1fr) + min-w-0: a grid item otherwise grows to its widest child (the badge +
                // radius controls row, a long title or description) and sticks out past the screen.
                <section className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-4">
                  <article className="min-w-0 ios-card p-5">
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
                      <span
                        className={cn(
                          "inline-flex h-8 shrink-0 items-center rounded-full px-3.5 text-sm font-bold",
                          isAiCourse && usedAI ? "bg-primary-soft text-primary-strong" : "bg-surface-muted text-muted-strong",
                        )}
                      >
                        {isAiCourse && usedAI ? t("aiCourseBadge") : t("basicCourseBadge")}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <div className="ios-pill flex h-10 items-center rounded-full">
                          <button
                            aria-label={t("radiusNarrower")}
                            className="ios-btn-bare grid h-10 w-9 place-items-center rounded-full disabled:opacity-40"
                            disabled={isRecommending || radiusKm === RADIUS_STEPS_KM[0]}
                            onClick={() => changeRadius(-1)}
                            title={t("radiusNarrower")}
                            type="button"
                          >
                            <MinusIcon className="h-4 w-4" />
                          </button>
                          <span className="min-w-[3.25rem] text-center text-sm font-bold text-muted-strong">
                            {t("radiusLabel", { km: radiusKm })}
                          </span>
                          <button
                            aria-label={t("radiusWider")}
                            className="ios-btn-bare grid h-10 w-9 place-items-center rounded-full disabled:opacity-40"
                            disabled={
                              isRecommending ||
                              radiusKm === RADIUS_STEPS_KM[RADIUS_STEPS_KM.length - 1] ||
                              isRadiusAtMaxCoverage
                            }
                            onClick={() => changeRadius(1)}
                            title={t("radiusWider")}
                            type="button"
                          >
                            <PlusIcon className="h-4 w-4" />
                          </button>
                        </div>
                        <button
                          aria-label={t("refreshCourseAria")}
                          className="ios-btn grid h-10 w-10 place-items-center rounded-full disabled:opacity-60"
                          disabled={isRecommending}
                          onClick={() => refreshCourse()}
                          title={t("refreshCourseTitle")}
                          type="button"
                        >
                          <RefreshIcon className={cn("h-[1.125rem] w-[1.125rem]", isRecommending && "animate-spin")} />
                        </button>
                        {chainPlaces.length >= 2 && (
                          <div className="relative">
                            <button
                              aria-label={t("navigateCourseAria")}
                              ref={navButtonRef}
                              className={cn(
                                "grid h-10 w-10 place-items-center rounded-full",
                                isNavigateMenuOpen ? "ios-btn ios-btn-on" : "ios-btn",
                              )}
                              onClick={() => setIsNavigateMenuOpen((open) => !open)}
                              title={t("navigateCourseTitle")}
                              type="button"
                            >
                              <NavigationIcon className="h-[1.125rem] w-[1.125rem]" />
                            </button>
                            {isNavigateMenuOpen && (
                              <button
                                aria-hidden="true"
                                className="fixed inset-0 z-10 cursor-default"
                                onClick={() => setIsNavigateMenuOpen(false)}
                                tabIndex={-1}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                    <MapAppsPopover
                        alignTo={navButtonRef}
                        inline
                                items={[
                                  {
                                    key: "kakao",
                                    label: t("mapKakao"),
                                    brand: "kakaomap",
                                    onSelect: () => {
                                      setIsNavigateMenuOpen(false);
                                      window.open(buildKakaoWalkingRouteUrl(chainPlaces), "_blank", "noopener,noreferrer");
                                    },
                                  },
                                  {
                                    key: "google",
                                    label: t("mapGoogle"),
                                    brand: "googlemaps",
                                    onSelect: () => {
                                      setIsNavigateMenuOpen(false);
                                      window.open(buildGoogleMapsWalkingRouteUrl(chainPlaces), "_blank", "noopener,noreferrer");
                                    },
                                  },
                                ]}
                                open={isNavigateMenuOpen}
                              />
                    {courseTitle && courseTitle.prompt === submittedPrompt ? (
                      <>
                        <h2 className="mt-5 break-keep text-2xl font-extrabold leading-8 tracking-tight text-balance min-[360px]:text-[1.75rem] min-[360px]:leading-9">{courseTitle.title}</h2>
                        <p className="mt-2 line-clamp-1 text-sm text-muted">{submittedPrompt}</p>
                      </>
                    ) : (
                      <h2 className="mt-5 break-keep text-2xl font-extrabold leading-8 tracking-tight text-balance min-[360px]:text-[1.75rem] min-[360px]:leading-9">{submittedPrompt}</h2>
                    )}
                    <p className="mt-2 text-sm font-semibold leading-5 text-muted-strong">
                      {t("courseSummary", { minutes: getTotalMinutes(chainPlaces) })}
                    </p>
                    {radiusMessage && (
                      <p className="mt-1 text-sm font-semibold text-danger">{radiusMessage}</p>
                    )}
                    <div className="mt-4 overflow-hidden rounded-3xl">
                      <ConstellationCard nudgeOptimize={!isOptimized} onOptimize={optimizeOrder} places={chainPlaces} suggestions={suggestionPlaces} />
                    </div>
                    {recommendReason && (
                      <p className={cn("mt-4 break-keep text-[0.9375rem] leading-6 text-muted-strong text-pretty transition-opacity duration-300", isDescribing && "opacity-50")}>{recommendReason}</p>
                    )}
                    {courseNotices.length > 0 && (
                      <ul className="mt-3 grid gap-1.5 rounded-2xl bg-surface-muted px-3.5 py-3">
                        {courseNotices.map((text) => (
                          <li className="break-keep text-sm font-semibold leading-5 text-muted-strong" key={text}>
                            {text}
                          </li>
                        ))}
                      </ul>
                    )}
                    {isAiCourse && !usedAI && !isRecommending && (
                      <p className="mt-3 text-sm leading-5 text-muted">{t("aiFallbackNotice")}</p>
                    )}

                    {/* Natural-language edits to this course. */}
                    <div className="mt-5 border-t border-border pt-4">
                      <form
                        className="ios-pill flex min-h-12 items-center gap-2.5 rounded-full py-1 pl-4 pr-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          void refineCourse(refineText);
                        }}
                      >
                        <AiSparklesIcon className="h-[1.125rem] w-[1.125rem] shrink-0 text-primary" />
                        <input
                          aria-label={t("refineInputAria")}
                          className="min-w-0 flex-1 text-ellipsis bg-transparent text-[1rem] font-semibold outline-none placeholder:font-medium placeholder:text-muted"
                          disabled={isRefining}
                          onChange={(event) => setRefineText(event.target.value)}
                          placeholder={t("refinePlaceholder")}
                          type="text"
                          value={refineText}
                        />
                        <button
                          aria-label={t("refineSubmitAria")}
                          className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary text-white transition hover:bg-primary-strong active:scale-95 disabled:opacity-50"
                          disabled={isRefining || !refineText.trim()}
                          type="submit"
                        >
                          {isRefining ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                          ) : (
                            <ArrowRightIcon className="h-4 w-4" />
                          )}
                        </button>
                      </form>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(
                          [
                            "refineExample1",
                            chainPlaces.some((place) => place.category === "식당") ? "refineExample4" : "refineExample2",
                            "refineExample3",
                          ] as const
                        ).map((key) => (
                          <button
                            className="ios-btn rounded-full px-3.5 py-2 text-sm font-semibold disabled:opacity-50"
                            disabled={isRefining}
                            key={key}
                            onClick={() => void refineCourse(t(key))}
                            type="button"
                          >
                            {t(key)}
                          </button>
                        ))}
                      </div>
                      {refineNote && (
                        <p
                          className={cn(
                            "mt-3 text-sm leading-5",
                            refineNote.isError ? "font-semibold text-danger" : "text-muted-strong",
                          )}
                        >
                          {refineNote.text}
                        </p>
                      )}
                    </div>
                  </article>

                  <div className="grid gap-3" ref={chainListRef}>
                    {chainPlaces.map((place, index) => {
                      const localizedPlace = localizePlace(place, locale);
                      const isPinned = pinnedIds.has(place.id);
                      const isSwapOpen = expandedStopId === place.id;
                      const isDragging = draggingChainId === place.id;
                      const isStopMenuOpen = stopMenuId === place.id;
                      return (
                      <article
                        className={cn(
                          "relative min-w-0 p-3",
                          isPinned ? "ios-row ios-row-pinned" : "ios-row",
                          isDragging && "ios-row-dragging",
                          !enteredIds.has(place.id) && "chain-card-in",
                          swapFlash?.cardId === place.id && "chain-card-swapped",
                          addedId === place.id && "chain-card-added",
                          removing?.id === place.id && "chain-card-out",
                          isDragging || isStopMenuOpen ? "z-20" : "transition-shadow",
                        )}
                        data-chain-id={place.id}
                        key={place.id}
                        onAnimationEnd={(event) => {
                          if (event.target === event.currentTarget) {
                            setEnteredIds((current) => new Set(current).add(place.id));
                          }
                        }}
                        style={
                          removing?.id === place.id
                            ? ({ "--card-h": `${removing.height}px` } as CSSProperties)
                            : { animationDelay: `${index * 60}ms` }
                        }
                      >
                        <div className="flex min-w-0 items-center gap-2">
                        <button
                          aria-label={t("reorderAria")}
                          className="relative grid h-10 w-5 shrink-0 touch-none place-items-center text-muted before:absolute before:-inset-x-2 before:inset-y-0 before:content-[''] disabled:opacity-30"
                          disabled={isPinned}
                          onPointerDown={(event) => handleChainDragStart(event, place.id)}
                          type="button"
                        >
                          <GripIcon className="h-4 w-4" />
                        </button>

                        <div className="flex min-w-0 flex-1 items-center gap-3">
                          <PlacePhotoThumb
                            badge={
                              <span className="absolute -bottom-1 -left-1 grid h-6 w-6 place-items-center rounded-full border-2 border-white bg-[#b7e86b] text-xs font-extrabold text-[#0b1220]">
                                {index + 1}
                              </span>
                            }
                            label={localizedPlace.name}
                            onFallback={() => setSelectedPlaceId(place.id)}
                            onOpenPhoto={() => setPhotoPlaceId(place.id)}
                            place={place}
                            size="md"
                          />
                          <div className="min-w-0 flex-1 text-left">
                            {/* Typography goes on the inner span: the global `button { font: inherit }`
                                is unlayered and would beat these utilities on the button itself. */}
                            <button
                              className="block w-full text-left"
                              onClick={() => setSelectedPlaceId(place.id)}
                              type="button"
                            >
                              <span className="block truncate text-[1.0625rem] font-bold leading-6">{localizedPlace.name}</span>
                            </button>
                            <span className="block truncate text-sm text-muted">
                              {placeSubtitle(localizedPlace, categoryText(place, categoryLabel), locale)}
                              {index > 0 && (
                                <>
                                  {" · "}
                                  {t("legFromPrevious", { minutes: estimateLegMinutes(chainPlaces[index - 1], place) })}
                                </>
                              )}
                            </span>
                          </div>
                        </div>

                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            aria-expanded={isSwapOpen}
                            aria-label={t("swapToggleAria")}
                            className={cn(
                              "grid h-10 w-10 place-items-center rounded-full disabled:opacity-30",
                              isSwapOpen ? "ios-btn ios-btn-on" : "ios-btn",
                            )}
                            disabled={isPinned}
                            onClick={() => toggleSwapPanel(place.id)}
                            title={t("swapToggleAria")}
                            type="button"
                          >
                            <MapSearchIcon className="h-[1.125rem] w-[1.125rem]" />
                          </button>
                          <div className="relative">
                            <button
                              aria-expanded={isStopMenuOpen}
                              aria-label={t("moreOptionsAria")}
                              className="ios-btn grid h-10 w-10 place-items-center rounded-full"
                              onClick={() => setStopMenuId(isStopMenuOpen ? null : place.id)}
                              title={t("moreOptionsAria")}
                              type="button"
                            >
                              <MoreIcon className="h-5 w-5" />
                            </button>
                            {isStopMenuOpen && (
                              <>
                                <button
                                  aria-hidden="true"
                                  className="fixed inset-0 z-10 cursor-default"
                                  onClick={() => setStopMenuId(null)}
                                  tabIndex={-1}
                                />
                                <div className="ios-menu absolute right-0 top-full z-30 mt-2 w-56 p-1.5">
                                  <button
                                    aria-pressed={isPinned}
                                    className="ios-menu-item flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[0.9375rem] font-semibold"
                                    onClick={() => {
                                      setStopMenuId(null);
                                      togglePin(place.id);
                                    }}
                                    type="button"
                                  >
                                    <PinIcon className={cn("h-5 w-5", isPinned ? "text-primary" : "text-muted-strong")} />
                                    {isPinned ? t("unpinStopAria") : t("pinStopAria")}
                                  </button>
                                  <button
                                    className="ios-menu-item flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left text-[0.9375rem] font-semibold text-danger"
                                    onClick={() => {
                                      setStopMenuId(null);
                                      removeStop(place.id);
                                    }}
                                    type="button"
                                  >
                                    <TrashIcon className="h-5 w-5" />
                                    {t("deleteAria")}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        </div>

                        {isSwapOpen && (
                          <div
                            className={cn("grid", staticPanelId !== place.id && "nearby-panel-in")}
                            onAnimationEnd={refreshCardTops}
                          >
                            <div className="min-h-0 overflow-hidden">
                              <div className="mt-3 border-t border-border pt-3">
                                <p className="mb-2 text-sm font-bold text-muted">
                                  {t("swapHeading", { name: localizedPlace.name })}
                                </p>
                                {panelStops.length === 0 ? (
                                  <p className="text-sm text-muted">{t("swapEmpty")}</p>
                                ) : (
                                  <ul className="grid gap-2.5">
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
                                          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-primary bg-white text-xs font-extrabold text-primary">
                                            {NEARBY_LABELS[nearbyIndex]}
                                          </span>
                                          <button
                                            className="flex min-w-0 flex-1 items-center gap-2 text-left"
                                            onClick={() => setSelectedPlaceId(nearby.id)}
                                            type="button"
                                          >
                                            <PlacePhoto className="h-12 w-12 rounded-md" fallbackSize="md" place={nearby} />
                                            <span className="min-w-0 flex-1">
                                              <span className="block truncate text-[0.9375rem] font-bold">{localizedNearby.name}</span>
                                              <span className="block truncate text-xs text-muted">
                                                {localizedNearby.area} · {formatDistance(distanceKm)}
                                              </span>
                                            </span>
                                          </button>
                                          {swapFlash?.rowId === nearby.id && (
                                            <span className="swap-badge shrink-0 rounded-full bg-primary px-2.5 py-1 text-xs font-extrabold text-white">
                                              {t("swappedBadge")}
                                            </span>
                                          )}
                                          <button
                                            aria-label={t("swapPickLabel")}
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong transition hover:bg-primary hover:text-white active:scale-95"
                                            onClick={() => replaceStop(place.id, nearby)}
                                            title={t("swapPickLabel")}
                                            type="button"
                                          >
                                            <RotateUpIcon className="h-4 w-4" />
                                          </button>
                                          <button
                                            aria-label={t("addToChainLabel")}
                                            data-add-source
                                            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary-soft text-primary-strong transition hover:bg-primary hover:text-white active:scale-95"
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
                    className="h-14 text-[1.0625rem] shadow-[0_10px_28px_rgba(47,111,228,0.32)] active:scale-[0.98]"
                    disabled={chainPlaces.length < 2}
                    onClick={requestPublish}
                    shape="pill"
                  >
                    {t("confirmCourse", { count: chainPlaces.length })}
                  </Button>

                  {isAiCourse && lastRecommendation && !isRecommending && (
                    <RecommendFeedback
                      key={lastRecommendation.id}
                      locale={locale}
                      model={lastRecommendation.model}
                      placeIds={lastRecommendation.placeIds}
                      prompt={lastRecommendation.prompt}
                      unmet={lastRecommendation.unmet}
                      usedAI={lastRecommendation.usedAI}
                    />
                  )}

                  {otherPlacesByCategory.length > 0 && (
                    <div className="grid gap-4">
                      <h3 className="mt-2 text-xl font-extrabold tracking-tight">{t("otherPlacesHeading")}</h3>
                      {otherPlacesByCategory.map((group) => (
                        <div className="min-w-0" key={group.category}>
                          <div className="mb-2 flex items-center justify-between gap-2">
                            <p className="text-base font-bold text-muted-strong">{groupLabel(group.category)}</p>
                            <button
                              aria-label={t("categoryMoreAria", { category: groupLabel(group.category) })}
                              className="text-primary transition hover:opacity-70"
                              onClick={() => setViewingCategory(group.category)}
                              type="button"
                            >
                              <span className="text-sm font-bold">{t("categoryMore")}</span>
                            </button>
                          </div>
                          <div className="relative">
                            <PlaceScroller>
                              {group.places.map((place) => {
                                const localizedPlace = localizePlace(place, locale);
                                return (
                                <div className="relative w-36 shrink-0" key={place.id}>
                                  <button
                                    className="ios-row ios-row-strip flex w-full flex-col overflow-hidden text-left"
                                    onClick={() => setSelectedPlaceId(place.id)}
                                    type="button"
                                  >
                                    <span className="block h-36 w-full shrink-0 overflow-hidden bg-surface-muted">
                                      <PlacePhoto className="h-full w-full" place={place} />
                                    </span>
                                    <span className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-3">
                                      <span className="truncate text-[0.9375rem] font-bold">{localizedPlace.name}</span>
                                      <span className="truncate text-xs text-muted">
                                        {localizedPlace.area} · {formatDistance(distanceToChainKm(place, chainPlaces))}
                                      </span>
                                    </span>
                                  </button>
                                  <button
                                    aria-label={t("addToChainLabel")}
                                            data-add-source
                                    className="absolute right-2.5 top-2.5 grid h-9 w-9 place-items-center rounded-full border border-white/80 bg-primary text-white shadow-[0_2px_10px_rgba(15,23,42,0.35)] transition duration-150 hover:bg-primary-strong active:scale-95"
                                    onClick={() => addToChain(place)}
                                    title={t("addToChainLabel")}
                                    type="button"
                                  >
                                    <PlaylistAddIcon className="h-4 w-4" />
                                  </button>
                                </div>
                                );
                              })}
                            </PlaceScroller>
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
            <div className={cn(tabSlideClass, "flex h-full min-h-full flex-col px-5 pb-4 pt-3")}>
              {/* The title shares the back button's line (to its right) and scrolls away. */}
              <div className="flex h-11 shrink-0 items-center pl-14">
                <h1 className="scroll-title text-2xl font-extrabold tracking-tight">{t("exploreHeading")}</h1>
              </div>
              {/* Three equal thirds, so the default tab ("all") sits exactly in the middle. */}
              {/* shrink-0: in this flex column a fixed-height empty box would be squeezed to nothing and the list would
                  slide up under the tab bar. */}
              <div aria-hidden="true" className="mx-auto mt-4 h-[3.15rem] w-full max-w-[20rem] shrink-0" ref={exploreTabsRef} />

              {/* Room at the bottom for the floating search bar. */}
              <div className="min-h-[50vh]" {...exploreSwipe}>
              <div
                className={cn("mt-4 [padding-bottom:calc(5.5rem+env(safe-area-inset-bottom))]", exploreSlideClass)}
                key={exploreSort}
              >
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
              </div>
            </div>
          )}

          {activeTab === "profile" && (
            <div className={cn(tabSlideClass, "pt-[3.5rem]")}>
              <ProfileTab
                account={account}
                bookmarkedPlaces={bookmarkedPlaces}
                googleEnabled={Boolean(GOOGLE_CLIENT_ID)}
                isSignedIn={isSignedIn}
                likedIds={likedIds}
                likedTrips={likedTrips}
                myTrips={publishedTrips}
                onOpenTrip={viewTrip}
                onSelectPlace={setSelectedPlaceId}
                onToggleLike={toggleLike}
                onToggleSave={toggleSave}
                onGoogleError={() => setSignInError(t("googleSignInFailed"))}
                onGoogleToken={handleGoogleToken}
                onToggleSignIn={toggleSignIn}
                recentlyViewedTrips={recentlyViewedTrips}
                savedIds={savedIds}
                savedTrips={savedTrips}
                signInError={signInError}
              />
            </div>
          )}
        </div>

        {/* The first screen stays bare ("바로 탐색하기" is its way into explore). Profile and
            explore icons only appear once a course exists. */}
        {activeTab === "home" && !hasResult && !isGenerating && (
          <button
            aria-expanded={isMenuOpen}
            aria-label={t("menuOpenAria")}
            // Just the icon, in the brand blue: no circle behind it (the tap area is still 44 px).
            className="hero-rise absolute left-4 z-20 grid h-11 w-11 place-items-center text-primary [--rise:200ms] [top:calc(0.75rem+env(safe-area-inset-top))]"
            data-tour="menu-button"
            onClick={() => setIsMenuOpen(true)}
            type="button"
          >
            <MenuIcon className="h-[1.375rem] w-[1.375rem]" />
          </button>
        )}
        {(activeTab !== "home" || hasResult || isGenerating) && (
          <>
            <div
              aria-hidden="true"
              className={cn(
                "pointer-events-none absolute inset-x-0 top-0 z-10 [height:calc(5.25rem+env(safe-area-inset-top))] transition-opacity duration-300",
                (activeTab === "home" ? isTitleScrolledAway : isScrolled) ? "opacity-100" : "opacity-0",
              )}
              // Solid behind the status bar and the controls, then a short fade. (A blurred,
              // half-transparent fade left a smeared ghost of the cards under the buttons.)
              style={{
                background:
                  "linear-gradient(to bottom, var(--background) 0%, var(--background) 66%, transparent 100%)",
              }}
            />
            {activeTab === "home" && (
              <>
            <div
              className={cn(
                "pointer-events-none absolute left-5 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 flex h-10 items-center transition-opacity duration-300",
                isTitleScrolledAway ? "opacity-100" : "opacity-0",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="Trip Chain" className="block h-[1.375rem] w-auto" src="/tripchain-logo-horizontal.svg" />
            </div>
            <button
              aria-label={t("navProfile")}
              className="absolute right-4 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 ios-glass grid h-11 w-11 place-items-center rounded-full text-muted-strong"
              onClick={() => setActiveTab("profile")}
              type="button"
            >
              <UserIcon className="h-[1.375rem] w-[1.375rem]" />
            </button>
            <button
              aria-label={t("navExplore")}
              className="absolute right-[4.25rem] [top:calc(0.75rem+env(safe-area-inset-top))] z-20 ios-glass grid h-11 w-11 place-items-center rounded-full text-muted-strong"
              onClick={() => setActiveTab("explore")}
              type="button"
            >
              <CompassIcon className="h-[1.375rem] w-[1.375rem]" />
            </button>
            <button
              aria-label={t("navMap")}
              data-map-button
              className="absolute right-[7.5rem] [top:calc(0.75rem+env(safe-area-inset-top))] z-20 ios-glass grid h-11 w-11 place-items-center rounded-full text-muted-strong"
              onClick={(event) => openMap(event.currentTarget)}
              type="button"
            >
              <MapSearchIcon className="h-[1.375rem] w-[1.375rem]" />
            </button>
              </>
            )}
            {activeTab === "explore" && (
              // Free: it sits where its slot in the page is (--tabs-y) and follows the scrolling exactly. Pinned: it
              // narrows (the width is the room between the back button and the other margin) and rises to the top bar;
              // the width goes first and the rise follows a beat later, so it never runs into the back button. Coming back it is
              // the other way round: it comes down first and widens once it is clear of the button.
              <div
                className="pointer-events-none absolute inset-x-0 z-20 flex justify-center"
                style={{
                  top: isExploreTabsPinned ? "calc(9px + env(safe-area-inset-top))" : "var(--tabs-y, 4.5rem)",
                  transition: isExploreTabsPinned ? "top 380ms cubic-bezier(0.22, 1, 0.36, 1) 90ms" : isExploreTabsSettling ? "top 200ms ease-out" : "none",
                }}
              >
                <div
                  className="pointer-events-auto"
                  style={{
                    width: isExploreTabsPinned ? "min(15rem, calc(100% - 9rem))" : "min(20rem, calc(100% - 2.5rem))",
                    transition: `width 240ms cubic-bezier(0.22, 1, 0.36, 1) ${isExploreTabsPinned ? 0 : 200}ms`,
                  }}
                >
                  {exploreTabs}
                </div>
              </div>
            )}
            {activeTab === "explore" && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-background via-background/85 to-transparent px-5 pt-10 [padding-bottom:calc(1rem+env(safe-area-inset-bottom))]">
                <div className="ios-glass pointer-events-auto flex h-14 items-center gap-2.5 rounded-full px-5">
                  {isAiSearching ? (
                    <span className="h-5 w-5 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-primary" />
                  ) : aiSearchIds && aiSearchIds.length > 0 ? (
                    <AiSparklesIcon className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
                  )}
                  <input
                    aria-label={t("exploreSearchAria")}
                    className="map-search-input min-w-0 flex-1 text-ellipsis bg-transparent text-base font-semibold outline-none placeholder:text-muted"
                    onChange={(event) => setExploreQuery(event.target.value)}
                    placeholder={t("exploreSearchPlaceholder")}
                    ref={exploreInputRef}
                    type="search"
                    value={exploreQuery}
                  />
                  {exploreQuery && (
                    <button
                      aria-label={t("cancel")}
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted relative before:absolute before:-inset-2.5 before:content-['']"
                      onClick={() => {
                        setExploreQuery("");
                        exploreInputRef.current?.focus();
                      }}
                      type="button"
                    >
                      <CloseIcon className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
            {activeTab !== "home" && (
              <button
                aria-label={t("backAria")}
                className="absolute left-4 [top:calc(0.75rem+env(safe-area-inset-top))] z-20 ios-glass grid h-11 w-11 place-items-center rounded-full text-muted-strong"
                onClick={() => setActiveTab("home")}
                type="button"
              >
                <ArrowLeftIcon className="h-[1.375rem] w-[1.375rem]" />
              </button>
            )}
          </>
        )}

        {viewingCategory && (
          <CategorySheet
            areaName={t("seoulWide")}
            badges={viewingCategoryBadges}
            label={groupLabel(viewingCategory)}
            onClose={() => setViewingCategory(null)}
            onSelectPlace={(id) => {
              setViewingCategory(null);
              setSelectedPlaceId(id);
            }}
            places={viewingCategoryPlaces}
          />
        )}

        {isMapOpen && (
          <PlaceMapScreen
            chainPlaces={chainPlaces}
            diningVersion={diningVersion}
            onAddPlace={addToChain}
            onClose={() => setIsMapOpen(false)}
            onOpenPlace={(id) => setSelectedPlaceId(id)}
            onRemovePlace={removeStopNow}
            onViewCourse={() => {
              setActiveTab("home");
              setIsMapOpen(false);
            }}
            revealFrom={mapReveal}
          />
        )}

        {selectedPlace && (
          <PlaceSheet
            key={selectedPlace.id}
            comments={userComments[selectedPlace.id] ?? []}
            isBookmarked={bookmarkedPlaceIds.has(selectedPlace.id)}
            isInChain={chainIds.includes(selectedPlace.id)}
            onAddComment={(text) => addComment(selectedPlace.id, text)}
            onAddToChain={addToChain}
            onClose={() => setSelectedPlaceId(null)}
            onSelectPlace={setSelectedPlaceId}
            onToggleBookmark={toggleBookmarkPlace}
            place={selectedPlace}
          />
        )}

        {photoPlaceId && (
          <PhotoLightbox
            name={localizePlace(getPlaceById(photoPlaceId) ?? chainPlaces[0], locale).name}
            onClose={() => setPhotoPlaceId(null)}
            place={getPlaceById(photoPlaceId) ?? chainPlaces[0]}
          />
        )}

        {isOptimizePromptOpen && (
          <div
            className="sheet-backdrop absolute inset-0 z-50 grid place-items-center bg-black/35 px-7"
            onClick={() => setIsOptimizePromptOpen(false)}
            role="presentation"
          >
            {/* The app's own dialog look: a frosted, very round card, a tinted icon, round pill buttons (the blue one is
                the action, the grey one the way out). */}
            <div
              aria-labelledby="optimize-prompt-title"
              aria-modal="true"
              className="sheet-panel w-full max-w-[20rem] read-surface rounded-[2rem] p-6 text-center"
              onClick={(event) => event.stopPropagation()}
              role="dialog"
            >
              <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary-soft text-primary-strong">
                <RouteIcon className="h-7 w-7" />
              </span>
              <h3 className="mt-4 text-xl font-extrabold tracking-tight" id="optimize-prompt-title">
                {t("optimizePromptTitle")}
              </h3>
              <p className="mt-1.5 break-keep text-sm leading-6 text-muted-strong text-balance">{t("optimizePromptBody")}</p>
              <div className="mt-6 grid gap-2.5">
                <button
                  className="h-12 rounded-full bg-primary text-base font-extrabold text-white shadow-[0_8px_20px_-6px_rgba(47,111,228,0.55)] transition active:scale-[0.98]"
                  onClick={() => confirmOptimizeThenPublish(true)}
                  type="button"
                >
                  {t("optimizePromptYes")}
                </button>
                <button
                  className="ios-btn h-12 rounded-full text-base font-bold transition active:scale-[0.98]"
                  onClick={() => confirmOptimizeThenPublish(false)}
                  type="button"
                >
                  {t("optimizePromptNo")}
                </button>
              </div>
            </div>
          </div>
        )}

        {showPublish && (
          <PublishSheet
            // The AI's own title and introduction, when this course came from the AI (the person can clear and rewrite them).
            defaultDescription={isAiCourse && usedAI ? (recommendReason ?? "") : ""}
            defaultTitle={isAiCourse && usedAI && courseTitle && courseTitle.prompt === submittedPrompt ? courseTitle.title : ""}
            onCancel={() => setShowPublish(false)}
            onPublish={handlePublish}
            places={chainPlaces}
          />
        )}

        {openTrip && (
          <TripDetailSheet
            origin={detailOrigin}
            photoFrom={detailPhoto}
            comments={openTripComments}
            isLiked={likedIds.has(openTrip.id)}
            isSaved={savedIds.has(openTrip.id)}
            onAddComment={(text) => addComment(openTrip.id, text)}
            onClose={() => setOpenTripId(null)}
            onDelete={deleteTrip}
            onLoadToChain={loadTripToChain}
            onOpenAuthor={(handle) => setViewingAuthorHandle(handle)}
            bookmarkedPlaceIds={bookmarkedPlaceIds}
            chainIds={chainIds}
            onAddPlaceComment={addComment}
            onAddPlaceToChain={addToChain}
            onSetCover={setTripCover}
            onToggleBookmarkPlace={toggleBookmarkPlace}
            placeComments={userComments}
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
    </MyPictureContext.Provider>
  );
}
