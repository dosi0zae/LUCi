"use client";

import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  InteractiveMap,
  type HighlightedRoute,
  type RouteImportRequest,
  type SearchRecommendationRequest,
} from "@/features/map/interactive-map";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IntroSplash } from "@/components/layout/intro-splash";
import {
  CompassIcon,
  HomeIcon,
  PlusIcon,
  SearchIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { cn } from "@/lib/utils";

type AppTab = "home" | "explore" | "create" | "ranking" | "profile";

const tabCopy: Record<AppTab, { label: string; title: string; eyebrow: string }> = {
  home: {
    label: "홈",
    title: "오늘 성수와 광진을 한 번에 훑어보세요",
    eyebrow: "Today",
  },
  explore: {
    label: "탐색",
    title: "지도 위 장소를 검색하고 후보를 고르세요",
    eyebrow: "Explorer",
  },
  create: {
    label: "만들기",
    title: "장소를 끌어 나의 체인으로 연결하세요",
    eyebrow: "Builder",
  },
  ranking: {
    label: "랭킹",
    title: "지금 많이 저장된 체인을 확인하세요",
    eyebrow: "Ranking",
  },
  profile: {
    label: "프로필",
    title: "나의 저장, 체인, 활동을 관리하세요",
    eyebrow: "Profile",
  },
};

const bottomNav: Array<{ id: AppTab; icon: typeof HomeIcon }> = [
  { id: "home", icon: HomeIcon },
  { id: "explore", icon: CompassIcon },
  { id: "create", icon: PlusIcon },
  { id: "ranking", icon: TrophyIcon },
  { id: "profile", icon: UserIcon },
];

const homeHighlights = [
  { label: "추천 장소", value: "56", meta: "성동/광진 샘플 포인트" },
  { label: "오늘 체인", value: "8", meta: "전시, 카페, 팝업 조합" },
  { label: "평균 동선", value: "2.1km", meta: "도보 중심 루트" },
];

const rankingItems = [
  { rank: 1, title: "성수 팝업 밀도 높은 90분", saved: "2,521", tags: "#팝업 #성수" },
  { rank: 2, title: "서울숲 카페와 전시 산책", saved: "2,011", tags: "#산책 #카페" },
  { rank: 3, title: "건대 저녁 데이트 체인", saved: "1,698", tags: "#전시 #디저트" },
];

const rankingRoutePlaceIds = [
  ["seongsu-sneaker-popup", "seongsu-beauty-popup", "seongsu-dessert-popup", "seongsu-fragrance-popup"],
  ["seoulforest-tea-house", "forest-design-gallery", "seongsu-cafe-street-walk", "seongsu-gallery"],
  ["konkuk-project-space", "konkuk-latte-house", "konkuk-fashion-popup", "konkuk-character-popup"],
] as const;

const profileStats = [
  { label: "저장한 장소", value: "18" },
  { label: "작성 중 체인", value: "3" },
  { label: "이번 주 방문", value: "5" },
];

const limeButtonClass =
  "border border-warning/50 bg-warning/70 text-foreground shadow-soft hover:border-warning hover:bg-warning";
const limeSecondaryButtonClass =
  "border-warning/45 bg-surface/78 text-muted-strong hover:border-warning hover:bg-warning/25";
const limeBadgeClass = "bg-warning/35 text-muted-strong";

export function AppShell() {
  const [activeTab, setActiveTab] = useState<AppTab>("home");
  const [isPanelOpen, setIsPanelOpen] = useState(true);
  const [panelPosition, setPanelPosition] = useState({ x: 16, y: 16 });
  const [highlightedRouteId, setHighlightedRouteId] = useState<string | null>(null);
  const [routeImportRequest, setRouteImportRequest] = useState<RouteImportRequest | null>(null);
  const [globalSearchQuery, setGlobalSearchQuery] = useState("");
  const [searchRecommendationRequest, setSearchRecommendationRequest] =
    useState<SearchRecommendationRequest | null>(null);
  const dragOffsetRef = useRef<{ x: number; y: number } | null>(null);
  const contentAreaRef = useRef<HTMLElement | null>(null);
  const hasPlacedPanelRef = useRef(false);
  const activeCopy = tabCopy[activeTab];
  const highlightedRoute = useMemo<HighlightedRoute | null>(() => {
    if (!highlightedRouteId) {
      return null;
    }

    const item = rankingItems.find((rankingItem) => String(rankingItem.rank) === highlightedRouteId);
    const placeIds = rankingRoutePlaceIds[Number(highlightedRouteId) - 1];

    if (!item || !placeIds) {
      return null;
    }

    return {
      id: `ranking-${item.rank}`,
      label: item.title,
      placeIds: [...placeIds],
    };
  }, [highlightedRouteId]);

  function getRankingRoute(item: (typeof rankingItems)[number]): HighlightedRoute {
    const placeIds = rankingRoutePlaceIds[item.rank - 1] ?? [];

    return {
      id: `ranking-${item.rank}`,
      label: item.title,
      placeIds: [...placeIds],
    };
  }

  useEffect(() => {
    const area = contentAreaRef.current;

    if (!area || hasPlacedPanelRef.current) {
      return;
    }

    const panelWidth = 340;
    const mapControlReserve = 128;
    const areaRect = area.getBoundingClientRect();

    setPanelPosition({
      x: Math.max(16, areaRect.width - panelWidth - mapControlReserve),
      y: 16,
    });
    hasPlacedPanelRef.current = true;
  }, []);

  const panelContent = useMemo(() => {
    if (activeTab === "home") {
      return (
        <div className="grid gap-2">
          <div className="grid grid-cols-3 gap-2">
            {homeHighlights.map((item) => (
              <div className="rounded-sm border border-border bg-surface/78 p-2" key={item.label}>
                <p className="text-xs font-semibold text-muted">{item.label}</p>
                <p className="mt-1 text-base font-bold">{item.value}</p>
                <p className="mt-0.5 line-clamp-1 text-xs leading-4 text-muted">{item.meta}</p>
              </div>
            ))}
          </div>
          <div className="rounded-sm border border-border bg-surface/78 p-2.5">
            <Badge className={limeBadgeClass}>추천 시작점</Badge>
            <p className="mt-2 text-sm font-bold">성수역 주변에서 팝업과 카페를 먼저 훑기</p>
            <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">
              좌측 장소 탐색에서 카테고리를 고르고, 마음에 드는 장소를 후보로 추가해보세요.
            </p>
          </div>
        </div>
      );
    }

    if (activeTab === "explore") {
      return (
        <div className="grid gap-2">
          {["카테고리 아이콘으로 필터링", "추천순, 저장순, 거리순 정렬", "장소 클릭 시 지도 이동"].map(
            (item, index) => (
              <div className="flex items-center gap-3 rounded-sm border border-border bg-surface/78 p-3" key={item}>
                <span className="grid h-7 w-7 place-items-center rounded-xs bg-warning/35 text-xs font-bold text-muted-strong">
                  {index + 1}
                </span>
                <p className="text-sm font-semibold">{item}</p>
              </div>
            ),
          )}
          <Button
            className={cn("mt-1", limeSecondaryButtonClass)}
            onClick={() => setIsPanelOpen(false)}
            size="sm"
            variant="secondary"
          >
            지도에서 바로 탐색
          </Button>
        </div>
      );
    }

    if (activeTab === "create") {
      return (
        <div className="grid gap-3">
          <div className="rounded-sm border border-border bg-surface/78 p-3">
            <p className="text-sm font-bold">드래그로 체인 만들기</p>
            <p className="mt-1 text-xs leading-5 text-muted">
              좌측 장소 카드를 나의 체인 패널로 끌어 넣으면 후보가 추가됩니다. 체인 안에서도 순서를 드래그로 바꿀 수 있어요.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className={limeButtonClass} size="sm">
              체인 만들기 시작
            </Button>
            <Button className={limeSecondaryButtonClass} size="sm" variant="secondary">
              추천 순서 보기
            </Button>
          </div>
        </div>
      );
    }

    if (activeTab === "ranking") {
      return (
        <div className="grid gap-2">
          {rankingItems.map((item) => {
            const isRouteActive = highlightedRouteId === String(item.rank);
            const rankingRoute = getRankingRoute(item);

            return (
              <div
                className={cn(
                  "rounded-sm border border-border bg-surface/78 p-3 text-left transition hover:border-warning hover:bg-warning/10",
                  isRouteActive && "border-success bg-success/10 ring-1 ring-success/20",
                )}
                key={item.rank}
                onClick={() =>
                  setHighlightedRouteId((currentRouteId) =>
                    currentRouteId === String(item.rank) ? null : String(item.rank),
                  )
                }
                onKeyDown={(event) => {
                  if (event.key !== "Enter" && event.key !== " ") {
                    return;
                  }

                  event.preventDefault();
                  setHighlightedRouteId((currentRouteId) =>
                    currentRouteId === String(item.rank) ? null : String(item.rank),
                  );
                }}
                role="button"
                tabIndex={0}
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-bold">
                    {item.rank}. {item.title}
                  </p>
                  <span className="text-xs font-bold text-muted">{item.saved} 저장</span>
                </div>
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-muted">{item.tags}</p>
                  {isRouteActive && <span className="text-xs font-bold text-success">지도 표시 중</span>}
                </div>
                {isRouteActive && (
                  <span
                    className="mt-3 inline-flex h-9 w-full items-center justify-center rounded-sm border border-success/35 bg-success/12 text-xs font-bold text-success transition hover:bg-success/20"
                    onClick={(event) => {
                      event.stopPropagation();
                      setRouteImportRequest({ requestId: Date.now(), route: rankingRoute });
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") {
                        return;
                      }

                      event.preventDefault();
                      event.stopPropagation();
                      setRouteImportRequest({ requestId: Date.now(), route: rankingRoute });
                    }}
                    role="button"
                    tabIndex={0}
                  >
                    나의 체인으로 가져오기
                  </span>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="grid gap-3">
        <div className="rounded-sm border border-border bg-surface/78 p-3">
          <p className="text-sm font-bold">Luci 님의 Trip Chain</p>
          <p className="mt-1 text-xs leading-5 text-muted">성수/광진 탐색 레벨 4 · 이번 주 체인 작성 중</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {profileStats.map((item) => (
            <div className="rounded-sm border border-border bg-surface/78 p-3 text-center" key={item.label}>
              <p className="text-lg font-bold">{item.value}</p>
              <p className="mt-1 text-xs font-semibold text-muted">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    );
  }, [activeTab, highlightedRouteId]);

  function selectTab(tab: AppTab) {
    setActiveTab(tab);
    setIsPanelOpen(true);
  }

  function startPanelDrag(event: PointerEvent<HTMLDivElement>) {
    const area = contentAreaRef.current;

    if (!area) {
      return;
    }

    const areaRect = area.getBoundingClientRect();
    dragOffsetRef.current = {
      x: event.clientX - areaRect.left - panelPosition.x,
      y: event.clientY - areaRect.top - panelPosition.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePanel(event: PointerEvent<HTMLDivElement>) {
    const area = contentAreaRef.current;
    const dragOffset = dragOffsetRef.current;

    if (!area || !dragOffset) {
      return;
    }

    const areaRect = area.getBoundingClientRect();
    const nextX = event.clientX - areaRect.left - dragOffset.x;
    const nextY = event.clientY - areaRect.top - dragOffset.y;
    const panelWidth = 340;
    const estimatedPanelHeight = 280;
    const fixedNavReserveRight = 128;
    const fixedNavReserveBottom = 104;
    const maxX = Math.max(16, areaRect.width - panelWidth - fixedNavReserveRight);
    const maxY = Math.max(16, areaRect.height - estimatedPanelHeight - fixedNavReserveBottom);

    setPanelPosition({
      x: Math.min(Math.max(16, nextX), maxX),
      y: Math.min(Math.max(16, nextY), maxY),
    });
  }

  function stopPanelDrag(event: PointerEvent<HTMLDivElement>) {
    dragOffsetRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function submitGlobalSearch() {
    const query = globalSearchQuery.trim();

    if (!query) {
      selectTab("explore");
      return;
    }

    setSearchRecommendationRequest({ query, requestId: Date.now() });
  }

  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <IntroSplash />
      <div className="relative min-h-screen">
        <section className="absolute inset-0 bg-[linear-gradient(115deg,rgba(79,141,247,0.18)_0%,#f7fafc_38%,rgba(255,255,255,0.86)_62%,rgba(183,232,107,0.13)_100%)] dark:bg-[linear-gradient(115deg,rgba(79,141,247,0.2)_0%,#07111f_52%,rgba(183,232,107,0.08)_100%)]" />
        <section className="absolute inset-0 opacity-45 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative grid min-h-screen grid-rows-[auto_1fr_auto]">
          <header className="z-20 flex items-center gap-3 px-4 py-4 sm:px-6">
            <form
              className="glass-panel flex h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-4 text-left"
              onSubmit={(event) => {
                event.preventDefault();
                submitGlobalSearch();
              }}
            >
              <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1 [&>p:not(.search-helper)]:hidden">
                <input
                  aria-label="전시, 장소, 루트, 크리에이터 검색"
                  className="h-5 w-full bg-transparent text-sm font-semibold text-foreground outline-none placeholder:text-foreground"
                  onChange={(event) => setGlobalSearchQuery(event.target.value)}
                  placeholder="전시, 장소, 루트, 크리에이터 검색"
                  type="search"
                  value={globalSearchQuery}
                />
                <p className="search-helper hidden text-xs text-muted sm:block">
                  예: 비 오는 날 성수 실내 코스, 전시 보고 카페
                </p>
                <p className="truncate text-sm font-semibold">전시, 장소, 루트, 크리에이터 검색</p>
                <p className="hidden text-xs text-muted sm:block">예: 성수 팝업 데이트, 비 오는 날 실내 코스</p>
              </div>
              <Badge tone="blue" className="hidden sm:inline-flex">
                서울
              </Badge>
            </form>

            <nav className="hidden items-center gap-2 md:flex" aria-label="주요 메뉴">
              {bottomNav.map((item) => {
                const Icon = item.icon;
      const isActive = isPanelOpen && activeTab === item.id;

                return (
                  <IconButton
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      isActive &&
                        "border-warning/50 bg-warning/80 text-foreground hover:border-warning hover:bg-warning",
                    )}
                    icon={<Icon className="h-5 w-5" />}
                    key={item.id}
                    label={tabCopy[item.id].label}
                    onClick={() => selectTab(item.id)}
                  />
                );
              })}
            </nav>
          </header>

          <section
            className="relative z-10 grid min-h-0 grid-cols-1 gap-4 px-4 pb-24 sm:px-6 lg:pb-6"
            ref={contentAreaRef}
          >
            <InteractiveMap
              highlightedRoute={highlightedRoute}
              routeImportRequest={routeImportRequest}
              searchRecommendationRequest={searchRecommendationRequest}
            />

            {isPanelOpen && (
              <aside
                className="tab-floating-panel glass-panel absolute z-30 hidden max-h-[min(34vh,300px)] w-[340px] overflow-y-auto rounded-lg p-3 xl:block"
                style={{ left: panelPosition.x, top: panelPosition.y }}
              >
                <div
                  className="flex cursor-grab touch-none select-none items-start justify-between gap-3 active:cursor-grabbing"
                  onPointerCancel={stopPanelDrag}
                  onPointerDown={startPanelDrag}
                  onPointerMove={movePanel}
                  onPointerUp={stopPanelDrag}
                >
                  <div>
                    <p className="text-xs font-semibold text-success">{activeCopy.eyebrow}</p>
                    <h2 className="mt-1 text-lg font-bold leading-6">{activeCopy.title}</h2>
                  </div>
                  <button
                    aria-label={`${activeCopy.label} 패널 닫기`}
                    className="h-8 w-8 rounded-sm text-lg font-semibold text-muted transition hover:bg-surface-muted hover:text-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      setIsPanelOpen(false);
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    type="button"
                  >
                    ×
                  </button>
                </div>
                <div className="mt-4">{panelContent}</div>
              </aside>
            )}
          </section>
        </div>
      </div>
    </main>
  );
}
