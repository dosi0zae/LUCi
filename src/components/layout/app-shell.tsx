import { InteractiveMap } from "@/features/map/interactive-map";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import {
  BookmarkIcon,
  CompassIcon,
  FilterIcon,
  HomeIcon,
  LocateIcon,
  PlusIcon,
  SearchIcon,
  TrophyIcon,
  UserIcon,
} from "@/components/layout/app-icons";
import { cn } from "@/lib/utils";

const sideSections = [
  {
    label: "트렌딩 루트",
    title: "성수에서 시작하는 전시 데이트",
    meta: "4개 장소 · 5.2km · 3시간 40분",
    tone: "blue" as const,
  },
  {
    label: "내 주변",
    title: "가볍게 걷는 오후 산책",
    meta: "3개 장소 · 도보 42분",
    tone: "green" as const,
  },
  {
    label: "오늘의 이벤트",
    title: "성수 팝업 마지막 주",
    meta: "D-3 · 무료 입장",
    tone: "amber" as const,
  },
  {
    label: "북마크",
    title: "다음 주말 후보 코스",
    meta: "저장한 루트 12개",
    tone: "neutral" as const,
  },
];

const bottomNav = [
  { label: "홈", icon: HomeIcon, active: true },
  { label: "탐색", icon: CompassIcon },
  { label: "만들기", icon: PlusIcon },
  { label: "랭킹", icon: TrophyIcon },
  { label: "프로필", icon: UserIcon },
];

export function AppShell() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="relative min-h-screen">
        <section className="absolute inset-0 bg-[linear-gradient(115deg,#dbeafe_0%,#f8fafc_36%,#ffffff_58%,#ecfeff_100%)] dark:bg-[linear-gradient(115deg,#0f172a_0%,#060914_52%,#111827_100%)]" />
        <section className="absolute inset-0 opacity-60 [background-image:linear-gradient(var(--border)_1px,transparent_1px),linear-gradient(90deg,var(--border)_1px,transparent_1px)] [background-size:48px_48px]" />

        <div className="relative grid min-h-screen grid-rows-[auto_1fr_auto]">
          <header className="z-20 flex items-center gap-3 px-4 py-4 sm:px-6">
            <div className="glass-panel flex h-12 min-w-0 flex-1 items-center gap-3 rounded-lg px-4">
              <SearchIcon className="h-5 w-5 shrink-0 text-muted" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">
                  전시, 장소, 루트, 크리에이터 검색
                </p>
                <p className="hidden text-xs text-muted sm:block">
                  예: 성수 팝업 데이트, 비 오는 날 실내 코스
                </p>
              </div>
              <Badge tone="blue" className="hidden sm:inline-flex">
                서울
              </Badge>
            </div>

            <nav className="hidden items-center gap-2 md:flex" aria-label="빠른 실행">
              <IconButton icon={<LocateIcon className="h-5 w-5" />} label="현재 위치" />
              <IconButton icon={<FilterIcon className="h-5 w-5" />} label="필터" />
              <IconButton
                className="bg-primary text-white hover:bg-primary-strong"
                icon={<PlusIcon className="h-5 w-5" />}
                label="루트 만들기"
              />
            </nav>
          </header>

          <section className="z-10 grid min-h-0 grid-cols-1 gap-4 px-4 pb-24 sm:px-6 lg:grid-cols-[320px_1fr_88px] lg:pb-6">
            <aside className="glass-panel hidden min-h-0 rounded-lg p-3 lg:block">
              <div className="px-2 py-2">
                <p className="text-xs font-semibold text-primary">Trip Chain</p>
                <h1 className="mt-1 text-2xl font-bold leading-tight">
                  오늘 하루를 하나의 코스로 발견하세요
                </h1>
              </div>
              <div className="mt-3 grid gap-2">
                {sideSections.map((item) => (
                  <button
                    className="rounded-sm border border-transparent bg-surface/76 p-4 text-left transition hover:border-border-strong hover:bg-surface"
                    key={item.label}
                    type="button"
                  >
                    <Badge tone={item.tone}>{item.label}</Badge>
                    <p className="mt-3 text-sm font-bold">{item.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{item.meta}</p>
                  </button>
                ))}
              </div>
            </aside>

            <InteractiveMap />

            <aside className="hidden flex-col items-center gap-2 lg:flex">
              <IconButton icon={<LocateIcon className="h-5 w-5" />} label="현재 위치" />
              <IconButton icon={<FilterIcon className="h-5 w-5" />} label="필터" />
              <IconButton
                className="bg-primary text-white hover:bg-primary-strong"
                icon={<PlusIcon className="h-5 w-5" />}
                label="루트 만들기"
              />
              <IconButton icon={<BookmarkIcon className="h-5 w-5" />} label="북마크" />
            </aside>
          </section>

          <nav
            aria-label="주요 메뉴"
            className="glass-panel fixed inset-x-3 bottom-3 z-30 grid grid-cols-5 rounded-lg p-1 lg:inset-x-auto lg:right-4 lg:bottom-4 lg:flex lg:w-auto lg:flex-col lg:gap-1"
          >
            {bottomNav.map((item) => {
              const Icon = item.icon;

              return (
                <button
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-sm text-xs font-semibold text-muted transition hover:bg-surface-muted lg:w-16",
                     item.active && "bg-primary text-white shadow-soft hover:bg-primary",
                  )}
                  key={item.label}
                  type="button"
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>
      </div>
    </main>
  );
}
