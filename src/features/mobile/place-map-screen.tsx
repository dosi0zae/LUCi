"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ArrowLeftIcon, ArrowRightIcon, CloseIcon, LocateIcon, MapPinIcon, MapSearchIcon, SearchIcon } from "@/components/layout/app-icons";
import { getLoadedDiningPlaces, ensureDiningNear } from "@/features/mobile/dining-store";
import { categoryOfResult, categoryText, placeFromResult, registerCustomPlace, type MapSearchResult } from "@/features/mobile/custom-places";
import { useCategoryLabel, useLocale, useT } from "@/features/mobile/i18n/i18n-context";
import { loadKakaoMaps, type KakaoCustomOverlay, type KakaoMap, type KakaoMapsApi, type KakaoPolyline } from "@/features/mobile/kakao-loader";
import { CategoryIcon } from "@/features/mobile/place-icons";
import { categoryTone, haversineKm, localizePlace, places, type MobilePlace, type PlaceCategory } from "@/features/mobile/mobile-data";
import { isSameSpot } from "@/features/mobile/recommend-engine";
import { cn } from "@/lib/utils";

// The map screen: a map and one search box. Look up a place or an address, the map goes there and the sights, restaurants,
// cafés and bars around it pop up as pins; each can be added to the course ("담기"), and the course keeps itself in the
// shortest order. It works on the same course as the rest of the app (the tray at the bottom IS the current course).

const SEOUL_CENTER = { lat: 37.5665, lng: 126.978 };
const NEARBY_RADII_KM = [0.6, 1.0];

type Filter = "all" | "sights" | "식당" | "카페" | "술집";
const FILTERS: Filter[] = ["all", "sights", "식당", "카페", "술집"];

function diningRank(place: MobilePlace): number {
  return (place.dining?.pop === "high" ? 2 : 0) + (place.dining?.hot === "surge" || place.dining?.hot === "rising" ? 1 : 0) + place.savedBy / 2000;
}

// What is worth showing around a point: the best-known sights and the best restaurants, cafés and bars close to it
// (widening once if the area is thin). A filter shows more of one kind.
function findNearby(points: { lat: number; lng: number }[], anchor: MobilePlace | null, filter: Filter): MobilePlace[] {
  const dining = getLoadedDiningPlaces();
  for (const radius of NEARBY_RADII_KM) {
    const within = (place: MobilePlace) =>
      points.some((point) => haversineKm(point, place) <= radius) && place.id !== anchor?.id && !(anchor && isSameSpot(anchor, place));
    const take = (category: PlaceCategory, limit: number) =>
      dining.filter((place) => place.category === category && within(place)).sort((a, b) => diningRank(b) - diningRank(a)).slice(0, limit);
    const sights = (limit: number) =>
      places
        .filter((place) => !place.nightOnly && within(place))
        .sort((a, b) => (b.fameScore ?? 0) - (a.fameScore ?? 0))
        .slice(0, limit);

    const picked =
      filter === "all"
        ? [...sights(14), ...take("식당", 6), ...take("카페", 6), ...take("술집", 4)]
        : filter === "sights"
          ? sights(28)
          : take(filter, 20);
    if (picked.length >= 6 || radius === NEARBY_RADII_KM[NEARBY_RADII_KM.length - 1]) {
      return picked;
    }
  }
  return [];
}

// A search result is one of our own places when its Kakao id is the tail of one of our ids (sight-…, dining-…,
// kakao-…) or, failing that, the same name at (nearly) the same spot.
function matchKnownPlace(result: MapSearchResult): MobilePlace | null {
  const pool = [...places, ...getLoadedDiningPlaces()];
  const byId = pool.find((place) => place.id.endsWith(`-${result.id}`));
  if (byId) {
    return byId;
  }
  return pool.find((place) => place.name === result.name && haversineKm(place, result) < 0.08) ?? null;
}

// An address is a spot, not a kind of place.
function resultCategory(result: MapSearchResult): PlaceCategory | null {
  return result.kind === "address" ? null : categoryOfResult(result);
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.max(10, Math.round((km * 1000) / 10) * 10)}m` : `${km.toFixed(1)}km`;
}

type PinProps = {
  category: PlaceCategory;
  number?: number;
  label?: string;
  selected: boolean;
  isAnchor: boolean;
  // A searched place of unknown kind: a plain map pin instead of one of our category icons.
  uncategorized?: boolean;
  delayMs: number | null;
  onSelect: () => void;
};

// One marker on the map. Stops in the course are numbered lime dots (like the course card's map); everything else is a
// small dot in its kind's color with its icon; the searched spot is larger, blue, and carries its name.
function Pin({ category, number, label, selected, isAnchor, uncategorized, delayMs, onSelect }: PinProps) {
  const inCourse = number !== undefined;
  return (
    <button className="relative flex flex-col items-center" onClick={onSelect} type="button">
      {/* Only the dot pops in (its own wrapper, so the pop does not fight the enlarged size of a chosen pin). */}
      <span
        className="block"
        style={delayMs === null ? undefined : { animation: "marker-pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) both", animationDelay: `${delayMs}ms` }}
      >
        <span
          className={cn(
            "grid place-items-center rounded-full border-2 border-white text-white shadow-[0_2px_5px_rgba(15,23,42,0.3)] transition-transform",
            isAnchor ? "h-7 w-7 bg-primary" : inCourse ? "h-8 w-8 text-sm font-extrabold" : "h-8 w-8",
            selected ? "scale-125" : "",
          )}
          style={isAnchor || inCourse ? (inCourse ? { background: "#b7e86b", color: "#0b1220" } : undefined) : { background: categoryTone[category] }}
        >
          {inCourse ? number : isAnchor ? <SearchIcon className="h-3.5 w-3.5" /> : uncategorized ? <MapPinIcon className="h-4 w-4" /> : <CategoryIcon category={category} className="h-4 w-4" />}
        </span>
      </span>
      {label && (
        // No box: the name is dark text with a white outline (drawn behind the letters) and a faint shadow so it
        // reads on any map tile. It sits lower when the pin is enlarged (a transform does not move the layout).
        // It is not part of the pop: it fades in once the dot has landed.
        <span
          className={cn("max-w-[9rem] truncate text-xs font-extrabold text-foreground", selected ? "mt-2.5" : "mt-1.5", delayMs !== null && "map-label-in")}
          style={{
            WebkitTextStroke: "3px #fff",
            paintOrder: "stroke fill",
            textShadow: "0 1px 3px rgba(15,23,42,0.3)",
            ...(delayMs === null ? {} : { animationDelay: `${delayMs + 420}ms` }),
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
}

type PlaceMapScreenProps = {
  chainPlaces: MobilePlace[];
  // Bumps whenever a dining district finishes loading elsewhere (the shell's counter), so the pins are read again.
  diningVersion: number;
  onAddPlace: (place: MobilePlace) => void;
  onRemovePlace: (id: string) => void;
  onOpenPlace: (id: string) => void;
  onViewCourse: () => void;
  onClose: () => void;
  // Where the button that opened this screen sits (px from the frame's top-left): the green spreads from there.
  revealFrom: { x: number; y: number; r: number } | null;
};

// The map section's background is lime; the controls are the theme blue, the color of the course they lead to.

export function PlaceMapScreen({ chainPlaces, diningVersion, onAddPlace, onRemovePlace, onOpenPlace, onViewCourse, onClose, revealFrom }: PlaceMapScreenProps) {
  const t = useT();
  const { locale } = useLocale();
  const categoryLabel = useCategoryLabel();
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;

  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const mapsRef = useRef<KakaoMapsApi | null>(null);
  const overlaysRef = useRef<{ overlay: KakaoCustomOverlay; root: Root }[]>([]);
  const polylineRef = useRef<KakaoPolyline | null>(null);
  const seenRef = useRef<Set<string>>(new Set());
  const skipSearchRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(appKey ? "loading" : "error");

  const [isClosing, setIsClosing] = useState(false);

  const rootRef = useRef<HTMLDivElement>(null);
  // Where the green draws back to when leaving, if that is not where it came from.
  const [closeTo, setCloseTo] = useState<{ x: number; y: number; r: number } | null>(null);

  // Leaves by drawing the green back into the map button that is on screen NOW: once a course exists that is the one in
  // the top bar (data-map-button), even when the map was opened from the first screen's big button, which is gone by
  // then. With no such button it goes back to where it came from.
  function leave(after: () => void) {
    if (isClosing) {
      return;
    }
    const button = document.querySelector<HTMLElement>("[data-map-button]");
    const frame = rootRef.current?.getBoundingClientRect();
    if (button && frame) {
      const rect = button.getBoundingClientRect();
      setCloseTo({ x: rect.left + rect.width / 2 - frame.left, y: rect.top + rect.height / 2 - frame.top, r: rect.width / 2 });
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      after();
      return;
    }
    setIsClosing(true);
    window.setTimeout(after, 400);
  }

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MapSearchResult[]>([]);
  const [searchState, setSearchState] = useState<"idle" | "searching" | "empty" | "failed">("idle");
  const [showResults, setShowResults] = useState(false);

  const [origin, setOrigin] = useState<{ lat: number; lng: number } | null>(null);
  // Opened with a course already in the tray: the map starts on that course and shows what is around ALL of its stops;
  // searching somewhere else (or "이 지역에서 찾기") leaves that.
  const [followCourse, setFollowCourse] = useState(() => chainPlaces.length > 0);
  // On a course, what is around it only shows once asked for ("주변 살펴보기").
  const [exploring, setExploring] = useState(false);
  const [anchor, setAnchor] = useState<MobilePlace | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapMoved, setMapMoved] = useState(false);
  const [dataVersion, setDataVersion] = useState(0);

  const chainIds = useMemo(() => new Set(chainPlaces.map((place) => place.id)), [chainPlaces]);

  const focusPoints = useMemo(
    () => (followCourse && chainPlaces.length > 0 ? chainPlaces : origin ? [origin] : []),
    [followCourse, chainPlaces, origin],
  );
  const hasFocus = focusPoints.length > 0;

  const showNearby = hasFocus && (!followCourse || exploring);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const nearby = useMemo(() => (showNearby ? findNearby(focusPoints, anchor, filter) : []), [showNearby, focusPoints, anchor, filter, dataVersion, diningVersion]);

  // The dining districts around the course load while the map is on it.
  useEffect(() => {
    if (followCourse && chainPlaces.length > 0) {
      void ensureDiningNear(chainPlaces, 1.3).then(() => setDataVersion((value) => value + 1));
    }
  }, [followCourse, chainPlaces]);

  // ---- the map ---------------------------------------------------------------------------------------------
  useEffect(() => {
    if (!appKey || !containerRef.current) {
      return;
    }
    let cancelled = false;
    let removeListener: (() => void) | null = null;
    let stopObserving: (() => void) | null = null;

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (cancelled || !containerRef.current) {
          return;
        }
        mapsRef.current = maps;
        const start = chainPlaces.length > 0 ? chainPlaces[0] : SEOUL_CENTER;
        const map = new maps.Map(containerRef.current, { center: new maps.LatLng(start.lat, start.lng), level: chainPlaces.length > 0 ? 5 : 7 });
        mapRef.current = map;
        // Kakao measures its box once; when the box changes size (the screen opening, a rotated phone) it has to be told,
        // or the middle of the map is not the middle of the box.
        const observer = new ResizeObserver(() => {
          const center = map.getCenter();
          map.relayout();
          map.setCenter(center);
        });
        observer.observe(containerRef.current);
        stopObserving = () => observer.disconnect();
        const handler = () => setMapMoved(true);
        maps.event.addListener(map, "dragend", handler);
        removeListener = () => maps.event.removeListener(map, "dragend", handler);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });

    return () => {
      cancelled = true;
      removeListener?.();
      stopObserving?.();
    };
    // The map is made once; the course it starts on does not matter after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appKey]);

  // Move to the searched spot.
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || !origin || status !== "ready") {
      return;
    }
    map.relayout();
    map.setCenter(new maps.LatLng(origin.lat, origin.lng));
    map.setLevel(4);
  }, [origin, status]);

  // Opened on a course: the map shows all of it, then widens to take in what is around it once that is known (so the
  // pins around the course are on screen, not just beyond the edge). Left alone once the map has been dragged.
  const fitStageRef = useRef(0);
  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || status !== "ready" || !followCourse || chainPlaces.length === 0 || mapMoved) {
      return;
    }
    const stage = nearby.length > 0 ? 2 : 1;
    if (fitStageRef.current >= stage) {
      return;
    }
    fitStageRef.current = stage;
    map.relayout();
    const shown = stage === 2 ? [...chainPlaces, ...nearby] : chainPlaces;
    if (shown.length === 1) {
      map.setCenter(new maps.LatLng(shown[0].lat, shown[0].lng));
      map.setLevel(4);
      return;
    }
    const bounds = new maps.LatLngBounds();
    shown.forEach((place) => bounds.extend(new maps.LatLng(place.lat, place.lng)));
    map.setBounds(bounds, 70);
  }, [status, followCourse, chainPlaces, nearby, mapMoved]);

  // ---- the pins ----------------------------------------------------------------------------------------------
  const selectedPlace = useMemo(
    () => [anchor, ...nearby, ...chainPlaces].find((place): place is MobilePlace => Boolean(place) && place?.id === selectedId) ?? null,
    [anchor, nearby, chainPlaces, selectedId],
  );

  useEffect(() => {
    const maps = mapsRef.current;
    const map = mapRef.current;
    if (!maps || !map || status !== "ready") {
      return;
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let popped = 0;
    const entries: { overlay: KakaoCustomOverlay; root: Root }[] = [];

    function addPin(place: MobilePlace, props: { number?: number; label?: string; isAnchor?: boolean; zIndex: number }) {
      const element = document.createElement("div");
      // React fills this element a moment after Kakao measures it, so Kakao's own anchoring (a fraction of the
      // measured width) would be off by half the pin's width. The pin centers itself on the point instead: half
      // its own width left, half its circle up (the name hangs below the circle).
      element.style.transform = `translate(-50%, -${props.isAnchor ? 14 : 16}px)`;
      const root = createRoot(element);
      const isNew = !seenRef.current.has(place.id) && !reduceMotion;
      root.render(
        <Pin
          category={place.category}
          uncategorized={place.uncategorized}
          delayMs={isNew ? 60 + popped++ * 45 : null}
          isAnchor={Boolean(props.isAnchor)}
          label={props.label}
          number={props.number}
          onSelect={() => setSelectedId(place.id)}
          selected={place.id === selectedId}
        />,
      );
      const overlay = new maps!.CustomOverlay({
        clickable: true,
        content: element,
        position: new maps!.LatLng(place.lat, place.lng),
        xAnchor: 0,
        yAnchor: 0,
        zIndex: props.zIndex,
      });
      overlay.setMap(map);
      entries.push({ overlay, root });
    }

    const shown = new Set<string>();
    // The order here is the order they pop in: the searched place first, then the course, then what is around.
    if (anchor && !chainIds.has(anchor.id)) {
      addPin(anchor, { isAnchor: true, label: localizePlace(anchor, locale).name, zIndex: 20 });
      shown.add(anchor.id);
    }
    chainPlaces.forEach((place, index) => {
      addPin(place, { number: index + 1, zIndex: 15 });
      shown.add(place.id);
    });
    nearby.forEach((place) => {
      if (!chainIds.has(place.id)) {
        addPin(place, { zIndex: 5 });
        shown.add(place.id);
      }
    });
    seenRef.current = shown;

    polylineRef.current?.setMap(null);
    polylineRef.current = null;
    if (chainPlaces.length >= 2) {
      polylineRef.current = new maps.Polyline({
        path: chainPlaces.map((place) => new maps.LatLng(place.lat, place.lng)),
        strokeColor: "#b7e86b",
        strokeOpacity: 0.95,
        strokeStyle: "solid",
        strokeWeight: 5,
      });
      polylineRef.current.setMap(map);
    }

    overlaysRef.current = entries;
    return () => {
      entries.forEach(({ overlay, root }) => {
        overlay.setMap(null);
        // Unmounting while React is still rendering this effect's tree is not allowed, so it waits a tick.
        window.setTimeout(() => root.unmount(), 0);
      });
      polylineRef.current?.setMap(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nearby, anchor, chainPlaces, selectedId, status, locale]);

  // ---- search ------------------------------------------------------------------------------------------------
  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false;
      return;
    }
    const text = query.trim();
    if (text.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setSearchState("idle");
      return;
    }
    setSearchState("searching");
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/map-search?q=${encodeURIComponent(text)}`, { signal: controller.signal });
        if (!response.ok) {
          throw new Error("search failed");
        }
        const data = (await response.json()) as { results?: MapSearchResult[] };
        setResults(data.results ?? []);
        setSearchState(data.results && data.results.length > 0 ? "idle" : "empty");
        setShowResults(true);
      } catch (error) {
        if ((error as Error).name !== "AbortError") {
          setSearchState("failed");
          setShowResults(true);
        }
      }
    }, 350);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // What counts as already on the map when the pins around are redrawn (another filter): the stops of the course and the
  // searched spot stay as they are, and only what is around pops in.
  function keepCourseStill() {
    seenRef.current = new Set([...chainPlaces.map((place) => place.id), ...(anchor ? [anchor.id] : [])]);
  }

  async function goTo(point: { lat: number; lng: number }, spot: MobilePlace | null) {
    await ensureDiningNear([point], 1.3);
    keepCourseStill();
    setFollowCourse(false);
    setAnchor(spot);
    setOrigin(point);
    setSelectedId(null);
    setMapMoved(false);
    setDataVersion((value) => value + 1);
  }

  async function selectResult(result: MapSearchResult) {
    skipSearchRef.current = true;
    setQuery(result.name);
    setResults([]);
    setShowResults(false);
    setSearchState("idle");
    inputRef.current?.blur();
    await ensureDiningNear([result], 1.3);
    const known = result.kind === "place" ? matchKnownPlace(result) : null;
    await goTo({ lat: result.lat, lng: result.lng }, known ?? placeFromResult(result));
    // The searched place is the first thing to look at.
    setSelectedId(known?.id ?? `custom-${result.id}`);
  }

  function searchThisArea() {
    const center = mapRef.current?.getCenter();
    if (center) {
      void goTo({ lat: center.getLat(), lng: center.getLng() }, null);
    }
  }

  function locateMe() {
    if (!navigator.geolocation) {
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => void goTo({ lat: position.coords.latitude, lng: position.coords.longitude }, null),
      () => undefined,
      { timeout: 8000 },
    );
  }

  function addPlace(place: MobilePlace) {
    // A place that is not in our own data has to be known to the app before a course can hold it.
    if (place.source === "custom") {
      registerCustomPlace(place);
    }
    onAddPlace(place);
  }

  // The card fades out instead of vanishing: the place it showed is kept for a moment while it leaves.
  const [leavingCard, setLeavingCard] = useState<MobilePlace | null>(null);
  function selectPlace(id: string | null) {
    if (id === null && selectedPlace) {
      const leaving = selectedPlace;
      setLeavingCard(leaving);
      window.setTimeout(() => setLeavingCard((current) => (current?.id === leaving.id ? null : current)), 220);
    } else {
      setLeavingCard(null);
    }
    setSelectedId(id);
  }
  const cardPlace = selectedPlace ?? leavingCard;
  const isCardLeaving = !selectedPlace && leavingCard !== null;

  const detail = cardPlace ? localizePlace(cardPlace, locale) : null;
  const detailDistance = cardPlace && hasFocus ? formatDistance(Math.min(...focusPoints.map((point) => haversineKm(point, cardPlace)))) : null;
  const inCourse = cardPlace ? chainIds.has(cardPlace.id) : false;

  return (
    <div
      className={cn("absolute inset-0 z-30 bg-[#b7e86b]", isClosing ? "map-reveal-out" : "map-reveal")}
      ref={rootRef}
      style={
        {
          "--rx": `${(closeTo ?? revealFrom)?.x ?? 187}px`,
          "--ry": `${(closeTo ?? revealFrom)?.y ?? 700}px`,
          "--r0": `${(closeTo ?? revealFrom)?.r ?? 16}px`,
        } as CSSProperties
      }
    >
      {/* The button's map icon, still white on the circle, fades as the circle grows. */}
      <span
        aria-hidden="true"
        className="map-reveal-glyph pointer-events-none absolute grid place-items-center text-white"
        style={{ left: "calc(var(--rx) - 0.5625rem)", top: "calc(var(--ry) - 0.5625rem)", width: "1.125rem", height: "1.125rem" }}
      >
        <MapSearchIcon className="h-[1.125rem] w-[1.125rem]" />
      </span>
      <div className={cn("absolute inset-0", isClosing ? "map-content-out" : "map-content-in")}>
        {/* The map: a big rounded card in the middle of the screen, not the whole screen. */}
        <div className="absolute inset-x-2.5 overflow-hidden rounded-[2rem] bg-background shadow-[0_14px_30px_-14px_rgba(50,80,10,0.55)] [bottom:calc(0.625rem+env(safe-area-inset-bottom))] [top:calc(0.625rem+env(safe-area-inset-top))]">
          <div className="place-map absolute inset-0" ref={containerRef} />

          <div className="absolute inset-x-3 top-3 z-30">
            <div className="flex items-center gap-2">
              <button
                aria-label={t("backAria")}
                className="map-glass grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted-strong"
                onClick={() => leave(onClose)}
                type="button"
              >
                <ArrowLeftIcon className="h-[1.375rem] w-[1.375rem]" />
              </button>
              <div className="map-glass flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4">
                <SearchIcon className="h-[1.125rem] w-[1.125rem] shrink-0 text-muted" />
                <input
                  aria-label={t("mapSearchPlaceholder")}
                  className="min-w-0 flex-1 text-ellipsis bg-transparent text-base font-semibold outline-none placeholder:text-muted map-search-input"
                  onChange={(event) => setQuery(event.target.value)}
                  onFocus={() => results.length > 0 && setShowResults(true)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && results[0]) {
                      void selectResult(results[0]);
                    }
                  }}
                  placeholder={t("mapSearchPlaceholder")}
                  ref={inputRef}
                  type="search"
                  value={query}
                />
                {searchState === "searching" && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-border-strong border-t-primary" />}
                {query && searchState !== "searching" && (
                  <button
                    aria-label={t("cancel")}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-muted"
                    onClick={() => {
                      setQuery("");
                      setResults([]);
                      setShowResults(false);
                      inputRef.current?.focus();
                    }}
                    type="button"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            {showResults && (
              <div className="ios-menu mt-2 max-h-[18rem] overflow-y-auto p-1.5">
                {searchState === "failed" ? (
                  <p className="px-3 py-3 text-sm font-semibold text-muted">{t("mapSearchFailed")}</p>
                ) : results.length === 0 ? (
                  <p className="px-3 py-3 text-sm font-semibold text-muted">{t("mapNoResults")}</p>
                ) : (
                  results.map((result) => (
                    <button
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left active:bg-black/5"
                      key={`${result.kind}-${result.id}`}
                      onClick={() => void selectResult(result)}
                      type="button"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-white" style={{ background: resultCategory(result) ? categoryTone[resultCategory(result)!] : "var(--muted)" }}>
                        {resultCategory(result) ? <CategoryIcon category={resultCategory(result)!} className="h-4 w-4" /> : <MapPinIcon className="h-4 w-4" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.9375rem] font-extrabold">{result.name}</span>
                        <span className="block truncate text-xs font-semibold text-muted">
                          {result.kind === "address" ? `${t("mapAddressTag")} · ` : ""}
                          {result.address}
                        </span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>


          {status === "error" && (
            <p className="absolute inset-x-8 top-1/2 -translate-y-1/2 text-center text-sm font-semibold text-muted">{t("mapSearchFailed")}</p>
          )}

          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center gap-2 px-3 pt-[4.25rem]">
            {showNearby && (
              <div className="app-scroll-area pointer-events-auto -mx-3 -my-2 flex w-[calc(100%+1.5rem)] gap-2 overflow-x-auto px-3 py-2 [&>:first-child]:ml-auto [&>:last-child]:mr-auto">
                {FILTERS.map((item) => (
                  <button
                    className={cn("h-9 shrink-0 rounded-full px-3.5 text-sm font-bold", filter === item ? "bg-primary text-white shadow-[0_2px_8px_rgba(47,111,228,0.4)]" : "map-glass text-muted-strong")}
                    key={item}
                    onClick={() => {
                      keepCourseStill();
                      setFilter(item);
                    }}
                    type="button"
                  >
                    {item === "all" ? t("mapFilterAll") : item === "sights" ? t("mapFilterSights") : categoryLabel(item)}
                  </button>
                ))}
              </div>
            )}
            {showNearby && nearby.length === 0 && (
              <p className="map-glass rounded-2xl px-4 py-3 text-center text-sm font-semibold text-muted-strong">{t("mapNothingNearby")}</p>
            )}
            {followCourse && !exploring && chainPlaces.length > 0 && (
              <button
                className="map-glass pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-extrabold text-primary-strong"
                onClick={() => setExploring(true)}
                type="button"
              >
                <MapSearchIcon className="h-4 w-4" />
                {t("mapExploreAround")}
              </button>
            )}
            {hasFocus && mapMoved && (
              <button
                className="map-glass pointer-events-auto flex h-10 items-center gap-1.5 rounded-full px-4 text-sm font-extrabold text-primary-strong"
                onClick={searchThisArea}
                type="button"
              >
                <SearchIcon className="h-4 w-4" />
                {t("mapSearchThisArea")}
              </button>
            )}
          </div>

          {/* The pin that was tapped, and under it the course so far (the same course as the rest of the app). */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col gap-2 p-3">
            <button
              aria-label={t("locateNearbyAria")}
              className="map-glass pointer-events-auto grid h-11 w-11 shrink-0 place-items-center self-end rounded-full text-muted-strong"
              onClick={locateMe}
              type="button"
            >
              <LocateIcon className="h-[1.25rem] w-[1.25rem]" />
            </button>
            {detail && cardPlace && (
              <div key={cardPlace.id} className={cn("pointer-events-auto read-surface rounded-3xl p-4", isCardLeaving ? "map-card-out" : "map-card-in")}>
                <div className="flex items-start gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-white" style={{ background: cardPlace.uncategorized ? "var(--muted)" : categoryTone[cardPlace.category] }}>
                    {cardPlace.uncategorized ? <MapPinIcon className="h-5 w-5" /> : <CategoryIcon category={cardPlace.category} className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-extrabold">{detail.name}</p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-muted">
                      {categoryText(cardPlace, categoryLabel)}
                      {detail.area ? `${categoryText(cardPlace, categoryLabel) ? " · " : ""}${detail.area}` : ""}
                      {detailDistance && cardPlace.id !== anchor?.id ? ` · ${detailDistance}` : ""}
                    </p>
                    {detail.description && <p className="mt-1.5 line-clamp-2 text-[0.8125rem] leading-5 text-muted-strong">{detail.description}</p>}
                  </div>
                  <button
                    aria-label={t("cancel")}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted"
                    onClick={() => selectPlace(null)}
                    type="button"
                  >
                    <CloseIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="h-10 rounded-full bg-black/[0.06] text-sm font-extrabold" onClick={() => onOpenPlace(cardPlace.id)} type="button">
                    {t("mapDetails")}
                  </button>
                  <button
                    className={cn("h-10 rounded-full text-sm font-extrabold", inCourse ? "bg-primary-soft text-primary-strong" : "bg-primary text-white")}
                    onClick={() => (inCourse ? onRemovePlace(cardPlace.id) : addPlace(cardPlace))}
                    type="button"
                  >
                    {inCourse ? t("mapAddedStop") : t("mapAddStop")}
                  </button>
                </div>
              </div>
            )}

            {chainPlaces.length > 0 && (
              <div className="pointer-events-auto read-surface rounded-3xl p-3">
                <div className="flex items-center justify-between gap-3 px-1">
                  <p className="text-sm font-extrabold">{t("mapCourseTray", { count: chainPlaces.length })}</p>
                  <button
                    className="flex h-8 items-center gap-1 rounded-full bg-primary px-3.5 text-sm font-extrabold text-white"
                    onClick={() => leave(onViewCourse)}
                    type="button"
                  >
                    {t("mapViewCourse")}
                    <ArrowRightIcon className="h-4 w-4" />
                  </button>
                </div>
                <div className="app-scroll-area mt-2 flex gap-2 overflow-x-auto">
                  {chainPlaces.map((place, index) => (
                    <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-black/[0.06] pl-1.5 pr-1 text-xs font-bold" key={place.id}>
                      <button className="flex items-center gap-1.5" onClick={() => setSelectedId(place.id)} type="button">
                        <span className="grid h-5 w-5 place-items-center rounded-full text-[0.6875rem] font-extrabold" style={{ background: "#b7e86b", color: "#0b1220" }}>
                          {index + 1}
                        </span>
                        <span className="max-w-[7rem] truncate">{localizePlace(place, locale).name}</span>
                      </button>
                      <button
                        aria-label={t("mapRemoveStopAria", { name: place.name })}
                        className="grid h-6 w-6 place-items-center rounded-full text-muted"
                        onClick={() => onRemovePlace(place.id)}
                        type="button"
                      >
                        <CloseIcon className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
