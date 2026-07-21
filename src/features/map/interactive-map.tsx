"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CompassIcon } from "@/components/layout/app-icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CommunityHub } from "./community-hub";
import { MapPlace, PlaceCategory, PlaceDetailCard } from "./place-detail-card";
import { TripDetailPreview } from "./trip-detail-preview";
import { TripDraft } from "./trip-draft";
import { TripChainBuilder } from "./trip-chain-builder";
import { TripPublishPanel } from "./trip-publish-panel";

type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

type KakaoMap = {
  getLevel(): number;
  relayout(): void;
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
};

type KakaoCustomOverlay = {
  setMap(map: KakaoMap | null): void;
};

type KakaoPolyline = {
  setMap(map: KakaoMap | null): void;
};

type KakaoMapsApi = {
  event: {
    addListener(target: KakaoMap, type: string, handler: () => void): void;
  };
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: {
      center: KakaoLatLng;
      draggable?: boolean;
      level: number;
      scrollwheel?: boolean;
    },
  ) => KakaoMap;
  CustomOverlay: new (options: {
    clickable?: boolean;
    content: HTMLElement | string;
    position: KakaoLatLng;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlay;
  Polyline: new (options: {
    endArrow?: boolean;
    path: KakaoLatLng[];
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    strokeWeight?: number;
  }) => KakaoPolyline;
  load(callback: () => void): void;
};

export type HighlightedRoute = {
  id: string;
  label: string;
  placeIds: string[];
};

export type RouteImportRequest = {
  requestId: number;
  route: HighlightedRoute;
};

export type SearchRecommendationRequest = {
  query: string;
  requestId: number;
};

type ToastState = {
  id: number;
  kind?: "optimize";
  message: string;
};

type InteractiveMapProps = {
  highlightedRoute?: HighlightedRoute | null;
  routeImportRequest?: RouteImportRequest | null;
  searchRecommendationRequest?: SearchRecommendationRequest | null;
};

declare global {
  interface Window {
    kakao?: {
      maps: KakaoMapsApi;
    };
  }
}

const DEFAULT_CENTER = {
  lat: 37.5446,
  lng: 127.0557,
};
const DEFAULT_LEVEL = 4;
const LABEL_VISIBLE_LEVEL = DEFAULT_LEVEL - 1;
const categories: Array<PlaceCategory | "전체"> = ["전체", "전시", "카페", "팝업", "산책"];
const sortOptions = [
  { id: "recommended", label: "추천순" },
  { id: "saved", label: "저장 많은 순" },
  { id: "near", label: "가까운 순" },
  { id: "price", label: "가격 낮은 순" },
  { id: "short", label: "짧은 체류" },
] as const;

function getCategoryIconSvg(category: PlaceCategory | "전체", className = "h-5 w-5") {
  const iconProps = `aria-hidden="true" class="${className}" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" viewBox="0 0 24 24"`;

  if (category === "전시") {
    return `<svg ${iconProps}><rect height="13" rx="1.8" width="16" x="4" y="5"></rect><circle cx="9" cy="10" r="1.3"></circle><path d="m6.5 16 3.4-3.7 2.4 2.5 2.1-2 3.1 3.2"></path><path d="M9 21h6"></path><path d="M12 18v3"></path></svg>`;
  }

  if (category === "카페") {
    return `<svg ${iconProps}><path d="M6 9h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4z"></path><path d="M16 10h1.4a2.1 2.1 0 0 1 0 4.2H16"></path><path d="M8 5c.8.7.8 1.3 0 2"></path><path d="M12 5c.8.7.8 1.3 0 2"></path><path d="M5 20h13"></path></svg>`;
  }

  if (category === "팝업") {
    return `<svg ${iconProps}><path d="M6.5 9h11l-.8 10H7.3z"></path><path d="M9 9a3 3 0 0 1 6 0"></path><path d="m18.5 4 .5 1.6 1.5.5-1.5.5-.5 1.6-.5-1.6-1.5-.5 1.5-.5z"></path><path d="M10 14h4"></path></svg>`;
  }

  if (category === "산책") {
    return `<svg ${iconProps}><path d="M12 20v-6"></path><path d="M8.2 14.5a4.2 4.2 0 1 1 7.6 0"></path><path d="M6.8 12a4.1 4.1 0 0 1 3.5-6.2"></path><path d="M13.7 5.8A4.1 4.1 0 0 1 17.2 12"></path><path d="M9 20h6"></path><path d="M10 16.5 12 14l2 2.5"></path></svg>`;
  }

  return `<svg ${iconProps}><rect height="5" rx="1" width="5" x="5" y="5"></rect><rect height="5" rx="1" width="5" x="14" y="5"></rect><rect height="5" rx="1" width="5" x="5" y="14"></rect><rect height="5" rx="1" width="5" x="14" y="14"></rect></svg>`;
}

function CategoryFilterIcon({ category }: { category: PlaceCategory | "전체" }) {
  return (
    <span
      className="grid h-5 w-5 place-items-center"
      dangerouslySetInnerHTML={{ __html: getCategoryIconSvg(category) }}
    />
  );
}

const places: MapPlace[] = [
  {
    id: "seongsu-gallery",
    name: "성수 전시관",
    category: "전시",
    lat: 37.5449,
    lng: 127.0548,
    address: "서울 성동구 연무장길 24",
    description: "성수 골목 안쪽에 있는 소규모 전시 공간입니다. 짧게 들러도 감상이 밀도 있게 이어집니다.",
    distance: "320m",
    duration: "45분",
    price: "무료",
    tags: ["전시", "실내", "사진"],
    hours: "오늘 11:00 - 20:00",
    savedBy: 1284,
  },
  {
    id: "forest-cafe",
    name: "서울숲 카페",
    category: "카페",
    lat: 37.5436,
    lng: 127.0419,
    address: "서울 성동구 서울숲2길 18",
    description: "서울숲 산책 전후에 쉬기 좋은 카페입니다. 오후 햇빛이 들어오는 창가 좌석이 인기입니다.",
    distance: "1.1km",
    duration: "35분",
    price: "8천원대",
    tags: ["카페", "디저트", "휴식"],
    hours: "오늘 10:00 - 22:00",
    savedBy: 934,
  },
  {
    id: "popup-street",
    name: "연무장 팝업",
    category: "팝업",
    lat: 37.5439,
    lng: 127.0584,
    address: "서울 성동구 연무장길 39",
    description: "이번 주까지만 운영되는 브랜드 팝업입니다. 굿즈와 포토존 중심으로 빠르게 둘러보기 좋습니다.",
    distance: "480m",
    duration: "30분",
    price: "무료",
    tags: ["팝업", "굿즈", "포토존"],
    hours: "오늘 12:00 - 21:00",
    savedBy: 2107,
  },
  {
    id: "river-walk",
    name: "뚝섬 산책길",
    category: "산책",
    lat: 37.5318,
    lng: 127.0662,
    address: "서울 광진구 자양동 427-1",
    description: "코스의 끝을 가볍게 마무리하기 좋은 강변 산책 구간입니다. 노을 시간대 만족도가 높습니다.",
    distance: "2.0km",
    duration: "50분",
    price: "무료",
    tags: ["산책", "강변", "노을"],
    hours: "상시 이용",
    savedBy: 1573,
  },
  {
    id: "seongsu-media-hall",
    name: "성수 미디어홀",
    category: "전시",
    lat: 37.5457,
    lng: 127.0559,
    address: "서울 성동구 연무장길 31",
    description: "성수동 골목 안쪽의 몰입형 미디어 전시 공간입니다. 짧은 동선에 넣기 좋은 실내 포인트입니다.",
    distance: "410m",
    duration: "50분",
    price: "1만2천원",
    tags: ["전시", "미디어", "실내"],
    hours: "오늘 11:00 - 20:00",
    savedBy: 1462,
  },
  {
    id: "seongsu-print-room",
    name: "성수 프린트룸",
    category: "전시",
    lat: 37.5441,
    lng: 127.0571,
    address: "서울 성동구 연무장7길 8",
    description: "그래픽 포스터와 독립 출판물을 함께 보는 작은 전시 겸 숍입니다.",
    distance: "520m",
    duration: "35분",
    price: "무료",
    tags: ["전시", "그래픽", "굿즈"],
    hours: "오늘 12:00 - 19:00",
    savedBy: 812,
  },
  {
    id: "seongsu-archive-lab",
    name: "성수 아카이브랩",
    category: "전시",
    lat: 37.5468,
    lng: 127.0528,
    address: "서울 성동구 성수이로 78",
    description: "로컬 브랜드의 기록과 제품 프로토타입을 소개하는 아카이브형 전시입니다.",
    distance: "640m",
    duration: "45분",
    price: "무료",
    tags: ["전시", "브랜드", "아카이브"],
    hours: "오늘 10:30 - 19:30",
    savedBy: 1034,
  },
  {
    id: "ttukseom-art-window",
    name: "뚝섬 아트윈도우",
    category: "전시",
    lat: 37.5474,
    lng: 127.0473,
    address: "서울 성동구 아차산로 6",
    description: "퇴근 후 가볍게 들르기 좋은 쇼윈도 기반 미니 전시 공간입니다.",
    distance: "930m",
    duration: "25분",
    price: "무료",
    tags: ["전시", "짧은관람", "야간"],
    hours: "오늘 13:00 - 21:00",
    savedBy: 678,
  },
  {
    id: "forest-design-gallery",
    name: "서울숲 디자인 갤러리",
    category: "전시",
    lat: 37.5444,
    lng: 127.0397,
    address: "서울 성동구 서울숲4길 21",
    description: "가구와 오브제를 중심으로 한 디자인 전시가 열리는 조용한 갤러리입니다.",
    distance: "1.4km",
    duration: "40분",
    price: "무료",
    tags: ["전시", "디자인", "오브제"],
    hours: "오늘 11:00 - 18:30",
    savedBy: 921,
  },
  {
    id: "wangsimni-culture-room",
    name: "왕십리 컬처룸",
    category: "전시",
    lat: 37.5612,
    lng: 127.0376,
    address: "서울 성동구 왕십리로 305",
    description: "사진과 일러스트를 번갈아 소개하는 지역 문화 전시 공간입니다.",
    distance: "2.7km",
    duration: "35분",
    price: "무료",
    tags: ["전시", "사진", "일러스트"],
    hours: "오늘 10:00 - 18:00",
    savedBy: 544,
  },
  {
    id: "hanyang-art-corner",
    name: "한양대 아트코너",
    category: "전시",
    lat: 37.5573,
    lng: 127.0435,
    address: "서울 성동구 마조로 22",
    description: "학생 작가와 신진 작가의 실험적인 작업을 볼 수 있는 소규모 전시입니다.",
    distance: "2.1km",
    duration: "30분",
    price: "무료",
    tags: ["전시", "신진작가", "실험"],
    hours: "오늘 12:00 - 18:00",
    savedBy: 389,
  },
  {
    id: "konkuk-project-space",
    name: "건대 프로젝트 스페이스",
    category: "전시",
    lat: 37.5426,
    lng: 127.0701,
    address: "서울 광진구 아차산로 272",
    description: "건대입구 근처에서 짧게 보기 좋은 팝 아트 중심 프로젝트 전시입니다.",
    distance: "1.5km",
    duration: "35분",
    price: "8천원",
    tags: ["전시", "팝아트", "건대"],
    hours: "오늘 11:30 - 20:30",
    savedBy: 1137,
  },
  {
    id: "children-park-gallery",
    name: "어린이대공원 갤러리",
    category: "전시",
    lat: 37.5487,
    lng: 127.0803,
    address: "서울 광진구 능동로 216",
    description: "공원 산책 전후로 들르기 좋은 밝은 분위기의 공공 전시 공간입니다.",
    distance: "2.4km",
    duration: "30분",
    price: "무료",
    tags: ["전시", "공공", "공원"],
    hours: "오늘 10:00 - 17:30",
    savedBy: 722,
  },
  {
    id: "guui-photo-room",
    name: "구의 포토룸",
    category: "전시",
    lat: 37.5387,
    lng: 127.0859,
    address: "서울 광진구 자양로 116",
    description: "동네 풍경과 여행 사진을 중심으로 큐레이션하는 작은 사진 전시실입니다.",
    distance: "3.0km",
    duration: "25분",
    price: "무료",
    tags: ["전시", "사진", "동네"],
    hours: "오늘 13:00 - 19:00",
    savedBy: 433,
  },
  {
    id: "gwangjang-object-hall",
    name: "광장 오브제홀",
    category: "전시",
    lat: 37.5479,
    lng: 127.1032,
    address: "서울 광진구 광장로 56",
    description: "한강 동쪽 동선에 붙이기 좋은 공예와 오브제 중심 전시입니다.",
    distance: "4.4km",
    duration: "40분",
    price: "1만원",
    tags: ["전시", "공예", "오브제"],
    hours: "오늘 11:00 - 19:00",
    savedBy: 602,
  },
  {
    id: "seongsu-roastery",
    name: "성수 로스터리",
    category: "카페",
    lat: 37.5462,
    lng: 127.0568,
    address: "서울 성동구 연무장5길 9",
    description: "원두 선택지가 넓고 바 좌석이 좋아 혼자 코스 중간에 쉬기 좋습니다.",
    distance: "470m",
    duration: "40분",
    price: "6천원대",
    tags: ["카페", "로스터리", "혼자"],
    hours: "오늘 09:00 - 21:00",
    savedBy: 1750,
  },
  {
    id: "seongsu-dessert-bar",
    name: "성수 디저트바",
    category: "카페",
    lat: 37.5438,
    lng: 127.0552,
    address: "서울 성동구 성수이로14길 12",
    description: "작은 케이크와 시즌 디저트가 강점인 카페입니다. 팝업 대기 전후로 넣기 좋습니다.",
    distance: "390m",
    duration: "45분",
    price: "9천원대",
    tags: ["카페", "디저트", "시즌"],
    hours: "오늘 11:00 - 22:00",
    savedBy: 1322,
  },
  {
    id: "seongsu-yard-cafe",
    name: "성수 야드카페",
    category: "카페",
    lat: 37.5429,
    lng: 127.0601,
    address: "서울 성동구 연무장길 62",
    description: "마당 좌석이 있는 카페로 날씨 좋은 날 체인 중간 휴식지로 적합합니다.",
    distance: "690m",
    duration: "50분",
    price: "7천원대",
    tags: ["카페", "마당", "휴식"],
    hours: "오늘 10:00 - 21:30",
    savedBy: 1198,
  },
  {
    id: "seoulforest-tea-house",
    name: "서울숲 티하우스",
    category: "카페",
    lat: 37.5449,
    lng: 127.0412,
    address: "서울 성동구 서울숲2길 32",
    description: "차와 가벼운 다과를 파는 조용한 공간입니다. 산책 코스와 잘 붙습니다.",
    distance: "1.2km",
    duration: "45분",
    price: "8천원대",
    tags: ["카페", "차", "조용"],
    hours: "오늘 10:30 - 20:00",
    savedBy: 1049,
  },
  {
    id: "ttukseom-bakery-cafe",
    name: "뚝섬 베이커리카페",
    category: "카페",
    lat: 37.5476,
    lng: 127.0491,
    address: "서울 성동구 왕십리로 90",
    description: "빵 종류가 많아 오전 코스의 첫 지점으로 쓰기 좋은 베이커리 카페입니다.",
    distance: "820m",
    duration: "35분",
    price: "7천원대",
    tags: ["카페", "베이커리", "오전"],
    hours: "오늘 08:30 - 21:00",
    savedBy: 886,
  },
  {
    id: "sageundong-coffee",
    name: "사근동 커피",
    category: "카페",
    lat: 37.5588,
    lng: 127.0452,
    address: "서울 성동구 사근동길 18",
    description: "한양대 인근의 조용한 작업형 카페입니다. 긴 체인 중 쉬어가기 좋습니다.",
    distance: "2.3km",
    duration: "55분",
    price: "5천원대",
    tags: ["카페", "작업", "한양대"],
    hours: "오늘 09:30 - 22:00",
    savedBy: 611,
  },
  {
    id: "konkuk-latte-house",
    name: "건대 라떼하우스",
    category: "카페",
    lat: 37.5409,
    lng: 127.0694,
    address: "서울 광진구 동일로22길 42",
    description: "라떼와 쿠키가 유명한 건대 골목 카페입니다. 전시와 식사 사이에 넣기 좋습니다.",
    distance: "1.4km",
    duration: "40분",
    price: "6천원대",
    tags: ["카페", "라떼", "건대"],
    hours: "오늘 10:00 - 23:00",
    savedBy: 1477,
  },
  {
    id: "jayang-river-cafe",
    name: "자양 리버카페",
    category: "카페",
    lat: 37.5326,
    lng: 127.0678,
    address: "서울 광진구 능동로 10",
    description: "강변 산책 뒤 들르기 좋은 창가 좌석 중심 카페입니다.",
    distance: "2.1km",
    duration: "45분",
    price: "7천원대",
    tags: ["카페", "강변", "창가"],
    hours: "오늘 10:00 - 22:30",
    savedBy: 930,
  },
  {
    id: "guui-slow-cafe",
    name: "구의 슬로우카페",
    category: "카페",
    lat: 37.5382,
    lng: 127.0831,
    address: "서울 광진구 자양로18길 17",
    description: "좌석 간격이 넓고 분위기가 차분해 대화 중심 코스에 잘 맞습니다.",
    distance: "2.8km",
    duration: "50분",
    price: "6천원대",
    tags: ["카페", "대화", "차분"],
    hours: "오늘 09:00 - 21:00",
    savedBy: 742,
  },
  {
    id: "gunja-cookie-room",
    name: "군자 쿠키룸",
    category: "카페",
    lat: 37.5571,
    lng: 127.0797,
    address: "서울 광진구 능동로 289",
    description: "쿠키와 필터커피를 함께 파는 군자역 근처 작은 카페입니다.",
    distance: "3.2km",
    duration: "35분",
    price: "6천원대",
    tags: ["카페", "쿠키", "군자"],
    hours: "오늘 11:00 - 20:00",
    savedBy: 518,
  },
  {
    id: "seongsu-sneaker-popup",
    name: "성수 스니커즈 팝업",
    category: "팝업",
    lat: 37.5452,
    lng: 127.0581,
    address: "서울 성동구 연무장길 45",
    description: "한정 컬러와 커스텀 체험존이 있는 스니커즈 브랜드 팝업입니다.",
    distance: "530m",
    duration: "35분",
    price: "무료",
    tags: ["팝업", "스니커즈", "체험"],
    hours: "오늘 12:00 - 21:00",
    savedBy: 2521,
  },
  {
    id: "seongsu-beauty-popup",
    name: "성수 뷰티 팝업",
    category: "팝업",
    lat: 37.5465,
    lng: 127.0539,
    address: "서울 성동구 성수이로 82",
    description: "샘플링과 퍼스널 컬러 체험이 있는 뷰티 브랜드 팝업입니다.",
    distance: "560m",
    duration: "40분",
    price: "무료",
    tags: ["팝업", "뷰티", "샘플"],
    hours: "오늘 11:00 - 20:30",
    savedBy: 2214,
  },
  {
    id: "seongsu-dessert-popup",
    name: "성수 디저트 팝업",
    category: "팝업",
    lat: 37.5434,
    lng: 127.0566,
    address: "서울 성동구 연무장3길 14",
    description: "주말 한정 메뉴가 나오는 디저트 브랜드 팝업입니다. 대기열 확인용으로 좋습니다.",
    distance: "450m",
    duration: "30분",
    price: "1만원대",
    tags: ["팝업", "디저트", "한정"],
    hours: "오늘 12:00 - 19:00",
    savedBy: 1805,
  },
  {
    id: "seongsu-fragrance-popup",
    name: "성수 프래그런스 팝업",
    category: "팝업",
    lat: 37.5425,
    lng: 127.0589,
    address: "서울 성동구 연무장길 57",
    description: "시향 동선과 포토 부스가 잘 구성된 향수 브랜드 팝업입니다.",
    distance: "630m",
    duration: "45분",
    price: "무료",
    tags: ["팝업", "향수", "포토"],
    hours: "오늘 11:30 - 21:00",
    savedBy: 1992,
  },
  {
    id: "seoulforest-pet-popup",
    name: "서울숲 펫 팝업",
    category: "팝업",
    lat: 37.5458,
    lng: 127.0427,
    address: "서울 성동구 서울숲길 48",
    description: "반려동물 용품과 간식을 소개하는 서울숲 인근 팝업입니다.",
    distance: "1.2km",
    duration: "35분",
    price: "무료",
    tags: ["팝업", "펫", "서울숲"],
    hours: "오늘 11:00 - 18:00",
    savedBy: 764,
  },
  {
    id: "konkuk-fashion-popup",
    name: "건대 패션 팝업",
    category: "팝업",
    lat: 37.5418,
    lng: 127.0682,
    address: "서울 광진구 아차산로30길 8",
    description: "스트리트 브랜드 신상품과 한정 굿즈를 볼 수 있는 패션 팝업입니다.",
    distance: "1.3km",
    duration: "35분",
    price: "무료",
    tags: ["팝업", "패션", "굿즈"],
    hours: "오늘 12:00 - 22:00",
    savedBy: 1698,
  },
  {
    id: "konkuk-character-popup",
    name: "건대 캐릭터 팝업",
    category: "팝업",
    lat: 37.5401,
    lng: 127.0718,
    address: "서울 광진구 동일로20길 96",
    description: "캐릭터 포토존과 랜덤 굿즈가 있는 팝업입니다. 친구 코스에 넣기 좋습니다.",
    distance: "1.7km",
    duration: "45분",
    price: "무료",
    tags: ["팝업", "캐릭터", "포토존"],
    hours: "오늘 11:00 - 21:30",
    savedBy: 2342,
  },
  {
    id: "children-park-market",
    name: "능동 플리마켓",
    category: "팝업",
    lat: 37.5501,
    lng: 127.0792,
    address: "서울 광진구 능동로 238",
    description: "주말마다 바뀌는 핸드메이드 셀러 중심의 작은 마켓입니다.",
    distance: "2.5km",
    duration: "50분",
    price: "무료",
    tags: ["팝업", "마켓", "핸드메이드"],
    hours: "오늘 13:00 - 18:00",
    savedBy: 888,
  },
  {
    id: "guui-book-popup",
    name: "구의 북 팝업",
    category: "팝업",
    lat: 37.5377,
    lng: 127.0845,
    address: "서울 광진구 자양로 130",
    description: "독립출판 신간과 작가 토크가 열리는 북 팝업입니다.",
    distance: "2.9km",
    duration: "40분",
    price: "무료",
    tags: ["팝업", "책", "토크"],
    hours: "오늘 12:00 - 20:00",
    savedBy: 566,
  },
  {
    id: "gwangjang-outdoor-popup",
    name: "광장 리버 팝업",
    category: "팝업",
    lat: 37.5461,
    lng: 127.1021,
    address: "서울 광진구 아차산로78길 90",
    description: "강변 산책 동선에 붙는 아웃도어 브랜드 체험 팝업입니다.",
    distance: "4.2km",
    duration: "45분",
    price: "무료",
    tags: ["팝업", "아웃도어", "강변"],
    hours: "오늘 11:00 - 19:00",
    savedBy: 697,
  },
  {
    id: "seongsu-cafe-street-walk",
    name: "성수 카페거리 산책",
    category: "산책",
    lat: 37.5447,
    lng: 127.0563,
    address: "서울 성동구 연무장길 일대",
    description: "팝업과 카페를 촘촘히 연결하기 좋은 성수 핵심 골목 산책 루트입니다.",
    distance: "0m",
    duration: "35분",
    price: "무료",
    tags: ["산책", "성수", "골목"],
    hours: "상시 이용",
    savedBy: 2011,
  },
  {
    id: "seongsu-industrial-walk",
    name: "성수 공장골목 산책",
    category: "산책",
    lat: 37.5419,
    lng: 127.0569,
    address: "서울 성동구 성수이로 일대",
    description: "낡은 공장과 새 브랜드 공간이 섞인 성수 특유의 분위기를 느끼는 코스입니다.",
    distance: "620m",
    duration: "40분",
    price: "무료",
    tags: ["산책", "골목", "브랜드"],
    hours: "상시 이용",
    savedBy: 1544,
  },
  {
    id: "seoulforest-north-walk",
    name: "서울숲 북쪽 산책",
    category: "산책",
    lat: 37.5456,
    lng: 127.0387,
    address: "서울 성동구 서울숲길 24",
    description: "서울숲 카페권과 자연스럽게 이어지는 가벼운 녹지 산책 루트입니다.",
    distance: "1.5km",
    duration: "45분",
    price: "무료",
    tags: ["산책", "서울숲", "녹지"],
    hours: "상시 이용",
    savedBy: 1876,
  },
  {
    id: "ttukseom-station-walk",
    name: "뚝섬역 골목 산책",
    category: "산책",
    lat: 37.5472,
    lng: 127.0479,
    address: "서울 성동구 왕십리로 일대",
    description: "성수와 서울숲 사이를 잇는 짧고 실용적인 도보 연결 코스입니다.",
    distance: "910m",
    duration: "25분",
    price: "무료",
    tags: ["산책", "뚝섬", "연결"],
    hours: "상시 이용",
    savedBy: 830,
  },
  {
    id: "han-river-jayang-walk",
    name: "자양 한강 산책",
    category: "산책",
    lat: 37.5299,
    lng: 127.0697,
    address: "서울 광진구 자양동 한강공원",
    description: "해 질 무렵 체인의 마지막 지점으로 쓰기 좋은 한강변 산책 루트입니다.",
    distance: "2.4km",
    duration: "60분",
    price: "무료",
    tags: ["산책", "한강", "노을"],
    hours: "상시 이용",
    savedBy: 2140,
  },
  {
    id: "konkuk-food-street-walk",
    name: "건대 맛의거리 산책",
    category: "산책",
    lat: 37.5407,
    lng: 127.0709,
    address: "서울 광진구 동일로22길 일대",
    description: "카페와 팝업 사이에 식사 후보를 탐색하기 좋은 번화가 산책 구간입니다.",
    distance: "1.6km",
    duration: "35분",
    price: "무료",
    tags: ["산책", "건대", "식사"],
    hours: "상시 이용",
    savedBy: 1655,
  },
  {
    id: "children-park-loop",
    name: "어린이대공원 루프",
    category: "산책",
    lat: 37.5508,
    lng: 127.0816,
    address: "서울 광진구 능동로 216",
    description: "전시와 공원 휴식을 함께 묶기 좋은 넓은 산책 루프입니다.",
    distance: "2.7km",
    duration: "70분",
    price: "무료",
    tags: ["산책", "공원", "루프"],
    hours: "오늘 05:00 - 22:00",
    savedBy: 1240,
  },
  {
    id: "achasan-base-walk",
    name: "아차산 입구 산책",
    category: "산책",
    lat: 37.5523,
    lng: 127.0898,
    address: "서울 광진구 영화사로 135",
    description: "긴 코스가 부담스러울 때 입구 주변만 걷는 가벼운 산책 포인트입니다.",
    distance: "3.5km",
    duration: "50분",
    price: "무료",
    tags: ["산책", "아차산", "가벼움"],
    hours: "상시 이용",
    savedBy: 997,
  },
  {
    id: "guui-market-walk",
    name: "구의시장 산책",
    category: "산책",
    lat: 37.5385,
    lng: 127.0868,
    address: "서울 광진구 구의동 일대",
    description: "동네 시장 분위기와 간식을 함께 탐색하는 로컬 산책 코스입니다.",
    distance: "3.1km",
    duration: "40분",
    price: "무료",
    tags: ["산책", "시장", "로컬"],
    hours: "상시 이용",
    savedBy: 705,
  },
  {
    id: "gwangnaru-river-walk",
    name: "광나루 한강 산책",
    category: "산책",
    lat: 37.5452,
    lng: 127.1056,
    address: "서울 광진구 광장동 한강공원",
    description: "성동에서 광진까지 확장하는 긴 체인의 끝점으로 쓰기 좋은 강변 루트입니다.",
    distance: "4.6km",
    duration: "75분",
    price: "무료",
    tags: ["산책", "광나루", "강변"],
    hours: "상시 이용",
    savedBy: 1189,
  },
  {
    id: "majang-cafe-gallery",
    name: "마장 카페갤러리",
    category: "카페",
    lat: 37.5661,
    lng: 127.0424,
    address: "서울 성동구 마장로 240",
    description: "작은 전시 벽을 함께 운영하는 카페입니다. 왕십리 북쪽 테스트 포인트로 좋습니다.",
    distance: "3.2km",
    duration: "45분",
    price: "6천원대",
    tags: ["카페", "전시", "마장"],
    hours: "오늘 10:00 - 20:00",
    savedBy: 482,
  },
  {
    id: "songjeong-roastery",
    name: "송정 로스터리",
    category: "카페",
    lat: 37.5529,
    lng: 127.0685,
    address: "서울 성동구 송정길 22",
    description: "성수와 군자 사이를 잇는 중간 휴식지 성격의 로스터리 카페입니다.",
    distance: "1.8km",
    duration: "45분",
    price: "6천원대",
    tags: ["카페", "로스터리", "연결"],
    hours: "오늘 09:00 - 20:30",
    savedBy: 573,
  },
  {
    id: "neungdong-illustration-show",
    name: "능동 일러스트 쇼",
    category: "전시",
    lat: 37.5538,
    lng: 127.0765,
    address: "서울 광진구 능동로32길 19",
    description: "일러스트 굿즈와 원화를 함께 볼 수 있는 능동권 전시입니다.",
    distance: "2.8km",
    duration: "35분",
    price: "5천원",
    tags: ["전시", "일러스트", "굿즈"],
    hours: "오늘 12:00 - 19:00",
    savedBy: 646,
  },
  {
    id: "jayang-food-popup",
    name: "자양 푸드 팝업",
    category: "팝업",
    lat: 37.5344,
    lng: 127.0732,
    address: "서울 광진구 뚝섬로 552",
    description: "한강 산책 전후로 들르기 좋은 간식 중심 푸드 팝업입니다.",
    distance: "2.2km",
    duration: "30분",
    price: "1만원대",
    tags: ["팝업", "푸드", "한강"],
    hours: "오늘 13:00 - 21:00",
    savedBy: 917,
  },
  {
    id: "hwayang-vintage-popup",
    name: "화양 빈티지 팝업",
    category: "팝업",
    lat: 37.5448,
    lng: 127.0719,
    address: "서울 광진구 동일로 178",
    description: "빈티지 의류와 소품을 주말 단위로 큐레이션하는 화양동 팝업입니다.",
    distance: "1.6km",
    duration: "40분",
    price: "무료",
    tags: ["팝업", "빈티지", "소품"],
    hours: "오늘 12:00 - 20:00",
    savedBy: 774,
  },
  {
    id: "majanggul-community-walk",
    name: "마장굴다리 산책",
    category: "산책",
    lat: 37.5639,
    lng: 127.0471,
    address: "서울 성동구 마장동 일대",
    description: "왕십리와 마장 사이의 로컬 분위기를 확인하기 좋은 짧은 연결 산책입니다.",
    distance: "2.8km",
    duration: "35분",
    price: "무료",
    tags: ["산책", "마장", "로컬"],
    hours: "상시 이용",
    savedBy: 421,
  },
  {
    id: "seongsu-night-gallery",
    name: "성수 나이트 갤러리",
    category: "전시",
    lat: 37.5417,
    lng: 127.0608,
    address: "서울 성동구 성수일로 89",
    description: "저녁 시간대 조명 연출이 좋은 야간 관람형 전시 공간입니다.",
    distance: "780m",
    duration: "45분",
    price: "1만5천원",
    tags: ["전시", "야간", "조명"],
    hours: "오늘 14:00 - 22:00",
    savedBy: 1356,
  },
  {
    id: "seongsu-object-shop",
    name: "성수 오브젝트숍",
    category: "팝업",
    lat: 37.5459,
    lng: 127.0604,
    address: "서울 성동구 연무장13길 11",
    description: "라이프스타일 브랜드가 시즌별로 바뀌는 오브젝트 기반 팝업 숍입니다.",
    distance: "760m",
    duration: "35분",
    price: "무료",
    tags: ["팝업", "오브젝트", "라이프스타일"],
    hours: "오늘 11:00 - 20:00",
    savedBy: 1588,
  },
  {
    id: "tuktuk-river-terrace",
    name: "뚝섬 리버테라스",
    category: "카페",
    lat: 37.5307,
    lng: 127.0668,
    address: "서울 광진구 강변북로 2202",
    description: "한강을 바라보며 쉬어갈 수 있는 테라스형 카페 포인트입니다.",
    distance: "2.3km",
    duration: "50분",
    price: "8천원대",
    tags: ["카페", "테라스", "한강"],
    hours: "오늘 10:00 - 23:00",
    savedBy: 1216,
  },
  {
    id: "wangsimni-record-cafe",
    name: "왕십리 레코드카페",
    category: "카페",
    lat: 37.5605,
    lng: 127.0352,
    address: "서울 성동구 왕십리광장로 17",
    description: "음악을 들으며 쉬어가기 좋은 레코드 콘셉트 카페입니다.",
    distance: "2.9km",
    duration: "50분",
    price: "7천원대",
    tags: ["카페", "음악", "왕십리"],
    hours: "오늘 11:00 - 22:00",
    savedBy: 639,
  },
  {
    id: "achasan-view-cafe",
    name: "아차산 뷰카페",
    category: "카페",
    lat: 37.5537,
    lng: 127.0912,
    address: "서울 광진구 영화사로 145",
    description: "아차산 입구 산책 뒤 쉬어가기 좋은 전망형 카페입니다.",
    distance: "3.7km",
    duration: "55분",
    price: "7천원대",
    tags: ["카페", "아차산", "전망"],
    hours: "오늘 10:00 - 21:00",
    savedBy: 811,
  },
];

const categoryTone: Record<PlaceCategory, string> = {
  전시: "#7c6cf2",
  카페: "#a36a3d",
  팝업: "#e87957",
  산책: "#2f9f8f",
};

function getCategoryFilterColor(category: PlaceCategory | "전체") {
  return category === "전체" ? "#64748b" : categoryTone[category];
}

type SortOption = (typeof sortOptions)[number]["id"];

let kakaoSdkPromise: Promise<KakaoMapsApi> | null = null;

function parseMeters(value: string) {
  const numericValue = Number.parseFloat(value.replace(/[^0-9.]/g, ""));

  if (Number.isNaN(numericValue)) {
    return Number.POSITIVE_INFINITY;
  }

  return value.includes("km") ? numericValue * 1000 : numericValue;
}

function parseMinutes(value: string) {
  const numericValue = Number.parseFloat(value.replace(/[^0-9.]/g, ""));

  return Number.isNaN(numericValue) ? Number.POSITIVE_INFINITY : numericValue;
}

function parsePrice(value: string) {
  if (value.includes("무료")) {
    return 0;
  }

  const numericValue = Number.parseFloat(value.replace(/[^0-9.]/g, ""));

  if (Number.isNaN(numericValue)) {
    return Number.POSITIVE_INFINITY;
  }

  return value.includes("만") ? numericValue * 10000 : numericValue * 1000;
}

function getPlaceDistance(a: MapPlace, b: MapPlace) {
  const earthRadius = 6371000;
  const latA = (a.lat * Math.PI) / 180;
  const latB = (b.lat * Math.PI) / 180;
  const deltaLat = ((b.lat - a.lat) * Math.PI) / 180;
  const deltaLng = ((b.lng - a.lng) * Math.PI) / 180;
  const haversine =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA) * Math.cos(latB) * Math.sin(deltaLng / 2) ** 2;

  return 2 * earthRadius * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function loadKakaoMaps(appKey: string) {
  if (window.kakao?.maps) {
    return new Promise<KakaoMapsApi>((resolve) => {
      window.kakao?.maps.load(() => resolve(window.kakao!.maps));
    });
  }

  if (kakaoSdkPromise) {
    return kakaoSdkPromise;
  }

  kakaoSdkPromise = new Promise<KakaoMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById("kakao-map-sdk");

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        window.kakao?.maps.load(() => resolve(window.kakao!.maps));
      });
      existingScript.addEventListener("error", () => reject(new Error("Kakao Map SDK load failed")));
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = "kakao-map-sdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.onload = () => {
      window.kakao?.maps.load(() => resolve(window.kakao!.maps));
    };
    script.onerror = () => reject(new Error("Kakao Map SDK load failed"));
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}

function createMarkerElement(
  place: MapPlace,
  isActive: boolean,
  isRouteHighlighted = false,
  isCompact = false,
) {
  const marker = document.createElement("button");
  const markerBorder = isRouteHighlighted ? "#8fbf45" : categoryTone[place.category];
  const markerIconColor = isActive ? "#ffffff" : markerBorder;
  const markerIcon = getCategoryIconSvg(place.category, isCompact ? "h-4 w-4" : "h-[18px] w-[18px]");
  const markerIconMarkup = `<span style="align-items:center;color:${markerIconColor};display:inline-flex;justify-content:center">${markerIcon}</span>`;

  marker.type = "button";
  marker.className = "trip-map-marker";
  marker.setAttribute("aria-label", `${place.name} 마커`);
  marker.style.alignItems = "center";
  marker.style.background = isActive ? "#111827" : isRouteHighlighted ? "#f7ffe8" : "#ffffff";
  marker.style.border = `2px solid ${markerBorder}`;
  marker.style.borderRadius = "999px";
  marker.style.boxShadow = isRouteHighlighted
    ? "0 16px 38px rgba(143, 191, 69, 0.36)"
    : isCompact
      ? "0 8px 18px rgba(15, 23, 42, 0.18)"
      : "0 14px 34px rgba(15, 23, 42, 0.22)";
  marker.style.color = isActive ? "#ffffff" : "#111827";
  marker.style.cursor = "pointer";
  marker.style.display = "inline-flex";
  marker.style.font = "700 12px system-ui, sans-serif";
  marker.style.gap = "6px";
  marker.style.height = isCompact ? "28px" : "34px";
  marker.style.justifyContent = "center";
  marker.style.padding = isCompact ? "0" : "0 12px 0 8px";
  marker.style.width = isCompact ? "28px" : "auto";
  marker.style.whiteSpace = "nowrap";
  marker.innerHTML = isCompact ? markerIconMarkup : `${markerIconMarkup}<span>${place.name}</span>`;

  return marker;
}

function getTemporaryWalkingRoutePath(chainPlaces: MapPlace[]) {
  return chainPlaces.slice(1).reduce<Array<{ lat: number; lng: number }>>(
    (path, place, index) => {
      const previousPlace = chainPlaces[index];
      const latDelta = Math.abs(place.lat - previousPlace.lat);
      const lngDelta = Math.abs(place.lng - previousPlace.lng);

      if (path.length === 0) {
        path.push({ lat: previousPlace.lat, lng: previousPlace.lng });
      }

      path.push(
        latDelta > lngDelta
          ? { lat: place.lat, lng: previousPlace.lng }
          : { lat: previousPlace.lat, lng: place.lng },
      );
      path.push({ lat: place.lat, lng: place.lng });

      return path;
    },
    [],
  );
}

type SearchIntent = {
  areaKeywords: string[];
  categories: PlaceCategory[];
  labels: string[];
  maxMinutes?: number;
  preferFree: boolean;
  preferIndoor: boolean;
  query: string;
};

type SearchChainSuggestion = {
  id: string;
  places: MapPlace[];
  reason: string;
  title: string;
  totalMinutes: number;
};

type SearchRecommendationState = {
  chains: SearchChainSuggestion[];
  intentLabels: string[];
  query: string;
};

function hasAnyKeyword(query: string, keywords: string[]) {
  return keywords.some((keyword) => query.includes(keyword));
}

function uniqueCategories(categoriesToUnique: PlaceCategory[]) {
  return categoriesToUnique.filter((categoryToUnique, index) => categoriesToUnique.indexOf(categoryToUnique) === index);
}

function parseSearchIntent(query: string): SearchIntent {
  const normalizedQuery = query.trim().toLowerCase();
  const categoriesFromQuery: PlaceCategory[] = [];
  const labels: string[] = [];
  const areaKeywords: string[] = [];

  if (hasAnyKeyword(normalizedQuery, ["전시", "갤러리", "미디어", "아트"])) {
    categoriesFromQuery.push("전시");
    labels.push("전시");
  }

  if (hasAnyKeyword(normalizedQuery, ["카페", "커피", "디저트", "차"])) {
    categoriesFromQuery.push("카페");
    labels.push("카페");
  }

  if (hasAnyKeyword(normalizedQuery, ["팝업", "브랜드", "굿즈"])) {
    categoriesFromQuery.push("팝업");
    labels.push("팝업");
  }

  if (hasAnyKeyword(normalizedQuery, ["산책", "걷", "한강", "서울숲", "숲"])) {
    categoriesFromQuery.push("산책");
    labels.push("산책");
  }

  if (hasAnyKeyword(normalizedQuery, ["비 오는", "비오는", "비올", "우천", "실내"])) {
    labels.push("실내 위주");
  }

  if (hasAnyKeyword(normalizedQuery, ["성수", "연무장", "서울숲", "건대", "자양", "광진", "성동"])) {
    ["성수", "연무장", "서울숲", "건대", "자양", "광진", "성동"].forEach((areaKeyword) => {
      if (normalizedQuery.includes(areaKeyword.toLowerCase())) {
        areaKeywords.push(areaKeyword);
      }
    });
  }

  const hourMatch = normalizedQuery.match(/(\d+(?:\.\d+)?)\s*시간/);
  const minuteMatch = normalizedQuery.match(/(\d+)\s*분/);
  const maxMinutes = hourMatch
    ? Math.round(Number.parseFloat(hourMatch[1]) * 60)
    : minuteMatch
      ? Number.parseInt(minuteMatch[1], 10)
      : undefined;

  if (maxMinutes) {
    labels.push(`${maxMinutes}분 안팎`);
  }

  if (hasAnyKeyword(normalizedQuery, ["무료", "저렴", "가성비", "비싸지 않은"])) {
    labels.push("예산 낮게");
  }

  return {
    areaKeywords,
    categories: uniqueCategories(categoriesFromQuery),
    labels: labels.length > 0 ? labels : ["추천"],
    maxMinutes,
    preferFree: hasAnyKeyword(normalizedQuery, ["무료", "저렴", "가성비", "비싸지 않은"]),
    preferIndoor: hasAnyKeyword(normalizedQuery, ["비 오는", "비오는", "비올", "우천", "실내"]),
    query,
  };
}

function getPlaceSearchText(place: MapPlace) {
  return [place.name, place.category, place.address, place.description, place.price, place.hours, ...place.tags]
    .join(" ")
    .toLowerCase();
}

function scorePlaceForSearch(place: MapPlace, intent: SearchIntent, index: number) {
  const text = getPlaceSearchText(place);
  const normalizedQuery = intent.query.toLowerCase();
  let score = Math.max(0, 80 - index);

  if (intent.categories.includes(place.category)) {
    score += 80;
  }

  intent.areaKeywords.forEach((keyword) => {
    if (text.includes(keyword.toLowerCase())) {
      score += 45;
    }
  });

  normalizedQuery
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .forEach((word) => {
      if (text.includes(word)) {
        score += 12;
      }
    });

  if (intent.preferIndoor && place.category !== "산책") {
    score += 24;
  }

  if (intent.preferFree && place.price.includes("무료")) {
    score += 24;
  }

  score += Math.min(30, place.savedBy / 120);
  score -= parseMeters(place.distance) / 250;

  return score;
}

function getSearchCategorySequences(intent: SearchIntent): PlaceCategory[][] {
  const requested = intent.categories;

  if (requested.length >= 2) {
    return [
      requested,
      uniqueCategories([...requested, "카페", "산책"]).slice(0, 4),
      uniqueCategories(["팝업", ...requested, "카페"]).slice(0, 4),
    ];
  }

  if (requested[0] === "전시") {
    return [
      ["전시", "카페", "팝업"],
      ["전시", "산책", "카페"],
      ["카페", "전시", "팝업"],
    ];
  }

  if (requested[0] === "카페") {
    return [
      ["카페", "전시", "팝업"],
      ["카페", "산책", "전시"],
      ["팝업", "카페", "산책"],
    ];
  }

  if (requested[0] === "팝업") {
    return [
      ["팝업", "카페", "전시"],
      ["팝업", "팝업", "카페"],
      ["카페", "팝업", "산책"],
    ];
  }

  if (requested[0] === "산책") {
    return [
      ["산책", "카페", "전시"],
      ["전시", "카페", "산책"],
      ["카페", "산책", "팝업"],
    ];
  }

  if (intent.preferIndoor) {
    return [
      ["전시", "카페", "팝업"],
      ["팝업", "카페", "전시"],
      ["카페", "전시", "카페"],
    ];
  }

  return [
    ["전시", "카페", "팝업"],
    ["팝업", "카페", "산책"],
    ["카페", "전시", "산책"],
  ];
}

function buildSearchRecommendations(query: string): SearchRecommendationState {
  const intent = parseSearchIntent(query);
  const scoredPlaces = places
    .map((place, index) => ({ place, score: scorePlaceForSearch(place, intent, index) }))
    .sort((a, b) => b.score - a.score);
  const chains = getSearchCategorySequences(intent)
    .map((sequence, sequenceIndex) => {
      const usedPlaceIds = new Set<string>();
      const selectedPlaces = sequence
        .map((category) => {
          const matchedPlace =
            scoredPlaces.find(({ place }) => place.category === category && !usedPlaceIds.has(place.id)) ??
            scoredPlaces.find(({ place }) => !usedPlaceIds.has(place.id));

          if (!matchedPlace) {
            return null;
          }

          usedPlaceIds.add(matchedPlace.place.id);

          return matchedPlace.place;
        })
        .filter((place): place is MapPlace => Boolean(place));
      const totalMinutes = selectedPlaces.reduce((total, place) => total + parseMinutes(place.duration), 0);

      return {
        id: `search-${Date.now()}-${sequenceIndex}`,
        places: selectedPlaces,
        reason:
          sequenceIndex === 0
            ? "검색어와 가장 직접적으로 맞는 조합"
            : sequenceIndex === 1
              ? "동선과 체류 균형을 맞춘 조합"
              : "조금 더 다양한 카테고리를 섞은 조합",
        title:
          sequenceIndex === 0
            ? `${intent.labels[0]} 추천 체인`
            : sequenceIndex === 1
              ? "균형형 대안 체인"
              : "확장형 대안 체인",
        totalMinutes,
      };
    })
    .filter((chain) => chain.places.length >= 2)
    .filter((chain, index, allChains) => {
      const signature = chain.places.map((place) => place.id).join("|");

      return allChains.findIndex((candidate) => candidate.places.map((place) => place.id).join("|") === signature) === index;
    })
    .slice(0, 3);

  return {
    chains,
    intentLabels: intent.labels,
    query,
  };
}

export function InteractiveMap({
  highlightedRoute = null,
  routeImportRequest = null,
  searchRecommendationRequest = null,
}: InteractiveMapProps) {
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_APP_KEY;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | null>(null);
  const mapsRef = useRef<KakaoMapsApi | null>(null);
  const overlaysRef = useRef<KakaoCustomOverlay[]>([]);
  const chainLineRef = useRef<KakaoPolyline | null>(null);
  const highlightedRouteLineRef = useRef<KakaoPolyline | null>(null);
  const [category, setCategory] = useState<PlaceCategory | "전체">("전체");
  const [chainPlaces, setChainPlaces] = useState<MapPlace[]>([]);
  const [isCommunityOpen, setIsCommunityOpen] = useState(false);
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const [isWalkingRouteActive, setIsWalkingRouteActive] = useState(false);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const [isSearchPanelCollapsed, setIsSearchPanelCollapsed] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [publishedDraft, setPublishedDraft] = useState<TripDraft | null>(null);
  const [lastOptimizedChain, setLastOptimizedChain] = useState<MapPlace[] | null>(null);
  const [searchRecommendations, setSearchRecommendations] = useState<SearchRecommendationState | null>(null);
  const [selectedPlaceId, setSelectedPlaceId] = useState(places[0].id);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [level, setLevel] = useState(DEFAULT_LEVEL);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOption, setSortOption] = useState<SortOption>("recommended");
  const [draggedPlaceId, setDraggedPlaceId] = useState<string | null>(null);
  const [isChainDropActive, setIsChainDropActive] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error" | "missing-key">(
    appKey ? "idle" : "missing-key",
  );

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const categoryCounts = useMemo(
    () =>
      categories.map((item) => ({
        count: item === "전체" ? places.length : places.filter((place) => place.category === item).length,
        label: item,
      })),
    [],
  );
  const visiblePlaces = useMemo(
    () => {
      const filteredPlaces = places.filter((place) => {
        const matchesCategory = category === "전체" || place.category === category;
        const searchableText = [
          place.name,
          place.category,
          place.address,
          place.description,
          place.price,
          place.hours,
          ...place.tags,
        ]
          .join(" ")
          .toLowerCase();

        return (
          matchesCategory &&
          (!normalizedQuery || searchableText.includes(normalizedQuery))
        );
      });

      return [...filteredPlaces].sort((a, b) => {
        if (sortOption === "saved") {
          return b.savedBy - a.savedBy;
        }

        if (sortOption === "near") {
          return parseMeters(a.distance) - parseMeters(b.distance);
        }

        if (sortOption === "price") {
          return parsePrice(a.price) - parsePrice(b.price);
        }

        if (sortOption === "short") {
          return parseMinutes(a.duration) - parseMinutes(b.duration);
        }

        return b.savedBy - a.savedBy;
      });
    },
    [category, normalizedQuery, sortOption],
  );
  const selectedPlace = places.find((place) => place.id === selectedPlaceId) ?? places[0];
  const selectedPlaceIsInChain = chainPlaces.some((place) => place.id === selectedPlace.id);
  const activePreviewPlaceIds = useMemo(
    () => new Set(isPreviewActive && chainPlaces.length >= 2 ? chainPlaces.map((place) => place.id) : []),
    [chainPlaces, isPreviewActive],
  );
  const highlightedRoutePlaceIds = useMemo(
    () => new Set(highlightedRoute?.placeIds ?? []),
    [highlightedRoute],
  );
  const highlightedRoutePlaces = useMemo(
    () =>
      (highlightedRoute?.placeIds ?? [])
        .map((placeId) => places.find((place) => place.id === placeId))
        .filter((place): place is MapPlace => Boolean(place)),
    [highlightedRoute],
  );
  const isMapFocusMode = (isPreviewActive && chainPlaces.length >= 2) || highlightedRoutePlaces.length >= 2;

  function showToast(message: string, kind?: ToastState["kind"]) {
    setToast({ id: Date.now(), kind, message });
  }

  useEffect(() => {
    if (!appKey || !containerRef.current || mapRef.current) {
      return;
    }

    let isMounted = true;
    setStatus("loading");

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (!isMounted || !containerRef.current) {
          return;
        }

        const center = new maps.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng);
        const map = new maps.Map(containerRef.current, {
          center,
          draggable: true,
          level: DEFAULT_LEVEL,
          scrollwheel: true,
        });

        mapsRef.current = maps;
        mapRef.current = map;
        setLevel(map.getLevel());
        setStatus("ready");
        maps.event.addListener(map, "zoom_changed", () => {
          setLevel(map.getLevel());
        });
        maps.event.addListener(map, "idle", () => {
          setLevel(map.getLevel());
        });

        window.requestAnimationFrame(() => map.relayout());
      })
      .catch(() => {
        if (isMounted) {
          setStatus("error");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [appKey]);

  useEffect(() => {
    const container = containerRef.current;

    if (!container) {
      return;
    }

    const observer = new ResizeObserver(() => {
      const map = mapRef.current;

      if (!map) {
        return;
      }

      window.requestAnimationFrame(() => map.relayout());
    });

    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timeoutId = window.setTimeout(() => setToast(null), toast.kind === "optimize" ? 6500 : 3400);

    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!routeImportRequest) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const routePlaces = routeImportRequest.route.placeIds
        .map((placeId) => places.find((place) => place.id === placeId))
        .filter((place): place is MapPlace => Boolean(place));

      if (routePlaces.length < 2) {
        showToast("가져올 수 있는 랭킹 코스 장소가 부족해요.");
        return;
      }

      setChainPlaces(routePlaces);
      setLastOptimizedChain(null);
      setIsPreviewActive(true);
      setIsWalkingRouteActive(false);
      setIsPublishOpen(false);
      showToast(`${routeImportRequest.route.label} 코스를 나의 체인으로 가져왔어요.`);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [routeImportRequest]);

  useEffect(() => {
    if (!searchRecommendationRequest) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const recommendationState = buildSearchRecommendations(searchRecommendationRequest.query);

      setSearchRecommendations(recommendationState);
      setIsExplorerCollapsed(true);
      setIsSearchPanelCollapsed(false);

      if (recommendationState.chains.length === 0) {
        showToast("검색어에 맞는 체인 후보를 찾지 못했어요. 장소나 카테고리를 조금 더 직접적으로 입력해 주세요.");
        return;
      }

      showToast(`'${searchRecommendationRequest.query}' 기준으로 ${recommendationState.chains.length}개 체인을 계산했어요.`);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [searchRecommendationRequest]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    if (!map || !maps || status !== "ready") {
      return;
    }

    overlaysRef.current.forEach((overlay) => overlay.setMap(null));
    overlaysRef.current = visiblePlaces.map((place) => {
      const isActiveMarker = place.id === selectedPlaceId;
      const isHighlightedRouteMarker = highlightedRoutePlaceIds.has(place.id);
      const isPreviewMarker = activePreviewPlaceIds.has(place.id);
      const hasRouteFocus = activePreviewPlaceIds.size > 0 || highlightedRoutePlaceIds.size > 0;
      const isRouteMarker = isPreviewMarker || isHighlightedRouteMarker;
      const isCompactMarker = hasRouteFocus ? !isRouteMarker : level > LABEL_VISIBLE_LEVEL;
      const marker = createMarkerElement(
        place,
        isActiveMarker,
        isHighlightedRouteMarker,
        isCompactMarker,
      );
      marker.addEventListener("click", () => {
        setSelectedPlaceId(place.id);
        setIsDetailOpen(true);
      });

      const overlay = new maps.CustomOverlay({
        clickable: true,
        content: marker,
        position: new maps.LatLng(place.lat, place.lng),
        xAnchor: 0.5,
        yAnchor: 1,
        zIndex: isActiveMarker || isRouteMarker ? 30 : isCompactMarker ? 1 : 10,
      });

      overlay.setMap(map);

      return overlay;
    });

    return () => {
      overlaysRef.current.forEach((overlay) => overlay.setMap(null));
      overlaysRef.current = [];
    };
  }, [activePreviewPlaceIds, highlightedRoutePlaceIds, level, selectedPlaceId, status, visiblePlaces]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    chainLineRef.current?.setMap(null);
    chainLineRef.current = null;

    if (!map || !maps || !isPreviewActive || chainPlaces.length < 2) {
      return;
    }

    const routePath = isWalkingRouteActive ? getTemporaryWalkingRoutePath(chainPlaces) : chainPlaces;
    const linePath = routePath.map((place) => new maps.LatLng(place.lat, place.lng));
    const chainLine = new maps.Polyline({
      endArrow: true,
      path: linePath,
      strokeColor: isWalkingRouteActive ? "#8fbf45" : "#2f6df6",
      strokeOpacity: 1,
      strokeStyle: "solid",
      strokeWeight: isWalkingRouteActive ? 7 : 6,
    });

    chainLine.setMap(map);
    chainLineRef.current = chainLine;

    return () => {
      chainLine.setMap(null);
      chainLineRef.current = null;
    };
  }, [chainPlaces, isPreviewActive, isWalkingRouteActive]);

  useEffect(() => {
    const map = mapRef.current;
    const maps = mapsRef.current;

    highlightedRouteLineRef.current?.setMap(null);
    highlightedRouteLineRef.current = null;

    if (!map || !maps || status !== "ready" || highlightedRoutePlaces.length < 2) {
      return;
    }

    const linePath = highlightedRoutePlaces.map((place) => new maps.LatLng(place.lat, place.lng));
    const centerLat =
      highlightedRoutePlaces.reduce((total, place) => total + place.lat, 0) / highlightedRoutePlaces.length;
    const centerLng =
      highlightedRoutePlaces.reduce((total, place) => total + place.lng, 0) / highlightedRoutePlaces.length;
    const highlightedLine = new maps.Polyline({
      endArrow: true,
      path: linePath,
      strokeColor: "#8fbf45",
      strokeOpacity: 1,
      strokeStyle: "solid",
      strokeWeight: 8,
    });

    highlightedLine.setMap(map);
    highlightedRouteLineRef.current = highlightedLine;
    map.setCenter(new maps.LatLng(centerLat, centerLng));

    return () => {
      highlightedLine.setMap(null);
      highlightedRouteLineRef.current = null;
    };
  }, [highlightedRoutePlaces, status]);

  function changeLevel(nextLevel: number) {
    const clampedLevel = Math.min(10, Math.max(1, nextLevel));
    mapRef.current?.setLevel(clampedLevel);
    setLevel(clampedLevel);
  }

  function resetView() {
    if (!mapsRef.current || !mapRef.current) {
      return;
    }

    mapRef.current.setCenter(new mapsRef.current.LatLng(DEFAULT_CENTER.lat, DEFAULT_CENTER.lng));
    mapRef.current.setLevel(DEFAULT_LEVEL);
    setLevel(DEFAULT_LEVEL);
  }

  function focusPlace(place: MapPlace) {
    setSelectedPlaceId(place.id);
    setIsDetailOpen(true);

    if (!mapsRef.current || !mapRef.current) {
      return;
    }

    mapRef.current.setCenter(new mapsRef.current.LatLng(place.lat, place.lng));
  }

  function addPlaceToChain(place: MapPlace) {
    if (chainPlaces.some((currentPlace) => currentPlace.id === place.id)) {
      showToast(`${place.name}은 이미 나의 체인에 있어요.`);
      return;
    }

    setChainPlaces((currentPlaces) =>
      currentPlaces.some((currentPlace) => currentPlace.id === place.id)
        ? currentPlaces
        : [...currentPlaces, place],
    );
    showToast(`${place.name}을 나의 체인에 추가했어요.`);
  }

  function startPlaceDrag(place: MapPlace) {
    setDraggedPlaceId(place.id);
  }

  function endPlaceDrag() {
    setDraggedPlaceId(null);
    setIsChainDropActive(false);
  }

  function dropDraggedPlaceToChain() {
    if (!draggedPlaceId) {
      return;
    }

    const draggedPlace = places.find((place) => place.id === draggedPlaceId);

    if (draggedPlace) {
      addPlaceToChain(draggedPlace);
      focusPlace(draggedPlace);
    }

    endPlaceDrag();
  }

  function removePlaceFromChain(placeId: string) {
    setChainPlaces((currentPlaces) => {
      const nextPlaces = currentPlaces.filter((place) => place.id !== placeId);

      if (nextPlaces.length < 2) {
        setIsPreviewActive(false);
        setIsWalkingRouteActive(false);
      }

      return nextPlaces;
    });
  }

  function movePlaceInChain(placeId: string, direction: "up" | "down") {
    setChainPlaces((currentPlaces) => {
      const currentIndex = currentPlaces.findIndex((place) => place.id === placeId);

      if (currentIndex < 0) {
        return currentPlaces;
      }

      const nextIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

      if (nextIndex < 0 || nextIndex >= currentPlaces.length) {
        return currentPlaces;
      }

      const nextPlaces = [...currentPlaces];
      const currentPlace = nextPlaces[currentIndex];
      nextPlaces[currentIndex] = nextPlaces[nextIndex];
      nextPlaces[nextIndex] = currentPlace;

      return nextPlaces;
    });
  }

  function reorderChainPlaces(activePlaceId: string, targetPlaceId: string) {
    if (activePlaceId === targetPlaceId) {
      return;
    }

    setChainPlaces((currentPlaces) => {
      const activeIndex = currentPlaces.findIndex((place) => place.id === activePlaceId);
      const targetIndex = currentPlaces.findIndex((place) => place.id === targetPlaceId);

      if (activeIndex < 0 || targetIndex < 0) {
        return currentPlaces;
      }

      const nextPlaces = [...currentPlaces];
      const [activePlace] = nextPlaces.splice(activeIndex, 1);
      nextPlaces.splice(targetIndex, 0, activePlace);

      return nextPlaces;
    });
  }

  function optimizeChainOrder() {
    if (chainPlaces.length < 3) {
      showToast("추천 순서는 장소 3곳 이상에서 사용할 수 있어요.");
      return;
    }

    const remainingPlaces = chainPlaces.slice(1);
    const orderedPlaces = [chainPlaces[0]];

    while (remainingPlaces.length > 0) {
      const currentPlace = orderedPlaces[orderedPlaces.length - 1];
      const nextIndex = remainingPlaces.reduce((bestIndex, place, index) => {
        const bestPlace = remainingPlaces[bestIndex];

        return getPlaceDistance(currentPlace, place) < getPlaceDistance(currentPlace, bestPlace)
          ? index
          : bestIndex;
      }, 0);

      const [nextPlace] = remainingPlaces.splice(nextIndex, 1);
      orderedPlaces.push(nextPlace);
    }

    setLastOptimizedChain(chainPlaces);
    setChainPlaces(orderedPlaces);
    showToast("가까운 장소끼리 이어지도록 추천 순서를 적용했어요.", "optimize");
  }

  function undoOptimizedOrder() {
    if (!lastOptimizedChain) {
      return;
    }

    setChainPlaces(lastOptimizedChain);
    setLastOptimizedChain(null);
    showToast("추천 순서 적용을 되돌렸어요.");
  }

  function clearChain() {
    setChainPlaces([]);
    setIsPreviewActive(false);
    setIsWalkingRouteActive(false);
  }

  function toggleChainPreview() {
    if (chainPlaces.length < 2) {
      setIsPreviewActive(false);
      setIsWalkingRouteActive(false);
      return;
    }

    setIsPreviewActive((isActive) => {
      const nextIsActive = !isActive;

      if (!nextIsActive) {
        setIsWalkingRouteActive(false);
      }

      return nextIsActive;
    });
  }

  function toggleWalkingRoutePreview() {
    if (chainPlaces.length < 2) {
      setIsPreviewActive(false);
      setIsWalkingRouteActive(false);
      return;
    }

    const nextIsActive = !isWalkingRouteActive;

    setIsPreviewActive(true);
    setIsWalkingRouteActive(nextIsActive);
    showToast(
      nextIsActive
        ? "임시 보행 경로를 표시했어요. 실제 보행망 데이터가 들어오면 이 라인을 교체하면 됩니다."
        : "일반 체인 미리보기로 돌아왔어요.",
    );
  }

  function previewSearchChain(chain: SearchChainSuggestion) {
    setChainPlaces(chain.places);
    setLastOptimizedChain(null);
    setIsPreviewActive(true);
    setIsWalkingRouteActive(false);
    showToast(`${chain.title}을 지도에 미리 표시했어요.`);
  }

  function applySearchChain(chain: SearchChainSuggestion) {
    setChainPlaces(chain.places);
    setLastOptimizedChain(null);
    setIsPreviewActive(true);
    setIsWalkingRouteActive(false);
    setSearchRecommendations(null);
    showToast(`${chain.title}을 나의 체인에 적용했어요.`);
  }

  function publishDraft(draft: TripDraft) {
    setPublishedDraft(draft);
    setIsPublishOpen(false);
  }

  return (
    <section
      aria-label="카카오맵 인터랙티브 지도"
      className="relative min-h-[640px] overflow-hidden rounded-lg border border-border bg-slate-200 shadow-panel dark:bg-slate-900"
    >
      <div
        ref={containerRef}
        className={cn("trip-map-base absolute inset-0", isMapFocusMode && "trip-map-base--focus")}
      />

      {status !== "ready" && (
        <div className="absolute inset-0 z-20 grid place-items-center bg-surface-muted/92 p-6 text-center backdrop-blur-sm">
          <div className="max-w-md rounded-lg border border-border bg-surface p-6 shadow-panel">
            <Badge tone={status === "error" ? "amber" : "blue"}>Kakao Map</Badge>
            <h2 className="mt-4 text-xl font-bold">
              {status === "missing-key" ? "카카오맵 앱 키가 필요합니다" : "카카오맵을 불러오는 중입니다"}
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted">
              {status === "missing-key"
                ? ".env.local에 NEXT_PUBLIC_KAKAO_MAP_APP_KEY 값을 넣으면 SDK가 자동 요청되어 지도가 표시됩니다."
                : "카카오 지도 SDK 스크립트를 요청하고 지도 인스턴스를 준비하고 있습니다."}
            </p>
            {status === "error" && (
              <p className="mt-3 text-sm leading-6 text-danger">
                SDK 로드에 실패했습니다. 앱 키, 플랫폼 도메인, 네트워크 상태를 확인해 주세요.
              </p>
            )}
          </div>
        </div>
      )}

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,transparent_0%,transparent_58%,rgba(15,23,42,0.14)_100%)]" />

      <aside
        className={cn(
          "glass-panel absolute left-4 z-20 hidden w-[360px] min-w-0 flex-col overflow-hidden rounded-lg p-3 xl:flex",
          isExplorerCollapsed ? "bottom-10 h-auto" : searchRecommendations ? "bottom-10 top-[136px]" : "bottom-10 top-4",
        )}
      >
        <div className="flex items-start justify-between gap-3 px-1">
          <div>
            <p className="text-xs font-semibold text-primary">Place Explorer</p>
            <h2 className="mt-1 text-lg font-bold">장소 탐색</h2>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="blue">{visiblePlaces.length}곳</Badge>
            <button
              aria-label={isExplorerCollapsed ? "장소 탐색 펼치기" : "장소 탐색 접기"}
              className="grid h-8 w-8 place-items-center rounded-sm text-sm font-bold text-muted transition hover:bg-surface-muted hover:text-foreground"
              onClick={() => {
                const nextIsCollapsed = !isExplorerCollapsed;

                setIsExplorerCollapsed(nextIsCollapsed);

                if (!nextIsCollapsed) {
                  setIsSearchPanelCollapsed(true);
                }
              }}
              type="button"
            >
              {isExplorerCollapsed ? "▴" : "▾"}
            </button>
          </div>
        </div>

        {!isExplorerCollapsed && (
          <>
        <label className="mt-3 block">
          <span className="sr-only">장소 검색</span>
          <input
            className="h-11 w-full rounded-sm border border-border bg-surface px-3 text-sm font-semibold outline-none transition placeholder:text-muted focus:border-primary"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="장소, 태그, 주소 검색"
            type="search"
            value={searchQuery}
          />
        </label>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {categoryCounts.map((item) => {
            const filterColor = getCategoryFilterColor(item.label);
            const isSelectedCategory = category === item.label;

            return (
              <button
                aria-label={`${item.label} ${item.count}곳`}
                className={cn(
                  "grid h-9 w-9 place-items-center rounded-sm border border-border bg-surface transition hover:bg-surface-muted",
                  isSelectedCategory && "shadow-soft",
                )}
                key={item.label}
                onClick={() => setCategory(item.label)}
                style={{
                  background: isSelectedCategory
                    ? `color-mix(in srgb, ${filterColor} 15%, rgba(255,255,255,0.86))`
                    : undefined,
                  borderColor: isSelectedCategory ? filterColor : undefined,
                  color: filterColor,
                }}
                title={`${item.label} ${item.count}곳`}
                type="button"
              >
                <CategoryFilterIcon category={item.label} />
                <span className="sr-only">
                  {item.label} {item.count}곳
                </span>
              </button>
            );
          })}
        </div>

        <label className="mt-3 grid gap-1">
          <span className="text-xs font-bold text-muted">정렬</span>
          <select
            className="h-10 w-full rounded-sm border border-border bg-surface px-3 text-sm font-bold text-muted-strong outline-none transition focus:border-primary"
            onChange={(event) => setSortOption(event.target.value as SortOption)}
            value={sortOption}
          >
            {sortOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <div className="place-list-scroll mt-3 min-h-0 flex-1 overflow-y-auto">
          {visiblePlaces.length > 0 ? (
            <div className="grid gap-2">
              {visiblePlaces.map((place) => {
                const isSelected = place.id === selectedPlace.id;
                const isInChain = chainPlaces.some((chainPlace) => chainPlace.id === place.id);

                return (
                  <article
                    className={cn(
                      "glass-card cursor-grab rounded-sm p-3 transition active:cursor-grabbing hover:bg-surface/88",
                      isSelected && "border-primary ring-1 ring-primary/20",
                    )}
                    draggable
                    onDragEnd={endPlaceDrag}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "copy";
                      event.dataTransfer.setData("text/plain", place.id);
                      startPlaceDrag(place);
                    }}
                    key={place.id}
                  >
                    <button className="w-full text-left" onClick={() => focusPlace(place)} type="button">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-bold">{place.name}</p>
                          <p className="mt-1 truncate text-xs text-muted">{place.address}</p>
                        </div>
                        <span
                          className="inline-flex h-7 items-center rounded-xs border px-2.5 text-xs font-semibold"
                          style={{
                            background: `color-mix(in srgb, ${categoryTone[place.category]} 13%, rgba(255,255,255,0.84))`,
                            borderColor: `color-mix(in srgb, ${categoryTone[place.category]} 26%, transparent)`,
                            color: categoryTone[place.category],
                          }}
                        >
                          {place.category}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs font-semibold text-muted">
                        <span>{place.duration}</span>
                        <span>{place.price}</span>
                        <span>{place.savedBy.toLocaleString()} 저장</span>
                      </div>
                    </button>
                    <div className="mt-2 flex items-center gap-2">
                      <Button className="flex-1" onClick={() => focusPlace(place)} size="sm" variant="secondary">
                        지도 이동
                      </Button>
                      <Button
                        className="flex-1"
                        disabled={isInChain}
                        onClick={() => addPlaceToChain(place)}
                        size="sm"
                      >
                        {isInChain ? "추가됨" : "후보 추가"}
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-sm border border-dashed border-border-strong bg-surface/78 p-4 text-sm leading-6 text-muted">
              조건에 맞는 장소가 없습니다. 검색어를 줄이거나 카테고리를 전체로 바꿔보세요.
            </div>
          )}
        </div>
          </>
        )}
      </aside>

      {searchRecommendations && (
        <aside className="glass-panel absolute left-4 top-4 z-30 hidden w-[360px] rounded-lg p-4 shadow-panel xl:block">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-success">Smart Search</p>
              <h2 className="mt-1 truncate text-lg font-bold">검색 기반 체인 후보</h2>
              <p className="mt-1 truncate text-xs font-semibold text-muted">
                &quot;{searchRecommendations.query}&quot;
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                aria-label={isSearchPanelCollapsed ? "검색 후보 펼치기" : "검색 후보 접기"}
                className="grid h-8 w-8 place-items-center rounded-sm text-sm font-bold text-muted transition hover:bg-surface-muted hover:text-foreground"
                onClick={() => {
                  const nextIsCollapsed = !isSearchPanelCollapsed;

                  setIsSearchPanelCollapsed(nextIsCollapsed);

                  if (!nextIsCollapsed) {
                    setIsExplorerCollapsed(true);
                  }
                }}
                type="button"
              >
                {isSearchPanelCollapsed ? "▾" : "▴"}
              </button>
              <button
                aria-label="검색 추천 닫기"
                className="grid h-8 w-8 place-items-center rounded-sm text-sm font-bold text-muted transition hover:bg-surface-muted hover:text-foreground"
                onClick={() => setSearchRecommendations(null)}
                type="button"
              >
                ×
              </button>
            </div>
          </div>

          {!isSearchPanelCollapsed && (
            <>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {searchRecommendations.intentLabels.map((label) => (
              <span
                className="rounded-xs border border-success/20 bg-success/10 px-2 py-1 text-xs font-bold text-success"
                key={label}
              >
                {label}
              </span>
            ))}
          </div>

          <div className="mt-3 grid gap-2">
            {searchRecommendations.chains.map((chain) => (
              <article className="rounded-sm border border-border bg-surface/78 p-3" key={chain.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold">{chain.title}</p>
                    <p className="mt-1 text-xs leading-5 text-muted">{chain.reason}</p>
                  </div>
                  <span className="shrink-0 rounded-xs bg-surface-muted px-2 py-1 text-xs font-bold text-muted-strong">
                    {chain.places.length}곳
                  </span>
                </div>
                <p className="mt-2 truncate text-xs font-semibold text-muted">
                  {chain.places.map((place) => place.name).join(" → ")}
                </p>
                <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <Button onClick={() => previewSearchChain(chain)} size="sm" variant="secondary">
                    미리보기
                  </Button>
                  <Button onClick={() => applySearchChain(chain)} size="sm">
                    체인 적용
                  </Button>
                  <span className="grid h-9 place-items-center rounded-sm border border-border bg-surface px-3 text-xs font-bold text-muted-strong">
                    {chain.totalMinutes}분
                  </span>
                </div>
              </article>
            ))}
          </div>
            </>
          )}
        </aside>
      )}

      <div className="glass-panel absolute right-4 top-4 z-20 grid gap-2 rounded-lg p-2">
        <Button
          aria-label="지도 확대"
          className="h-10 w-10 px-0 text-lg"
          disabled={status !== "ready"}
          onClick={() => changeLevel(level - 1)}
          size="sm"
        >
          +
        </Button>
        <Button
          aria-label="지도 축소"
          className="h-10 w-10 px-0 text-lg"
          disabled={status !== "ready"}
          onClick={() => changeLevel(level + 1)}
          size="sm"
          variant="secondary"
        >
          -
        </Button>
        <Button
          aria-label="지도 위치 초기화"
          className="h-10 w-10 px-0"
          disabled={status !== "ready"}
          onClick={resetView}
          size="sm"
          variant="secondary"
        >
          ↺
        </Button>
        <Button
          aria-label="탐색 피드 열기"
          className="h-10 w-10 px-0"
          onClick={() => setIsCommunityOpen(true)}
          size="sm"
          title="탐색 피드"
          variant="secondary"
        >
          <CompassIcon className="h-5 w-5" />
        </Button>
      </div>

      {isDetailOpen && (
        <PlaceDetailCard
          isInChain={selectedPlaceIsInChain}
          onAddToChain={addPlaceToChain}
          onClose={() => setIsDetailOpen(false)}
          onFocus={focusPlace}
          place={selectedPlace}
        />
      )}

      <button
        aria-label={isDetailOpen ? "장소 상세 숨기기" : `${selectedPlace.name} 다시 보기`}
        className="glass-panel absolute bottom-6 right-4 z-20 grid h-10 w-10 place-items-center rounded-lg text-muted-strong transition hover:bg-surface-muted"
        onClick={() => setIsDetailOpen((currentValue) => !currentValue)}
        title={isDetailOpen ? "장소 상세 숨기기" : `${selectedPlace.name} 다시 보기`}
        type="button"
      >
        {isDetailOpen ? (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M3 3l18 18" />
            <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
            <path d="M9.9 4.2A8.8 8.8 0 0 1 12 4c5 0 8 6 8 6a13.8 13.8 0 0 1-2.2 3.1" />
            <path d="M6.6 6.6C4.9 7.8 4 10 4 10s3 6 8 6a8.8 8.8 0 0 0 3.4-.7" />
          </svg>
        ) : (
          <svg
            aria-hidden="true"
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
          >
            <path d="M4 12s3-6 8-6 8 6 8 6-3 6-8 6-8-6-8-6z" />
            <circle cx="12" cy="12" r="2.5" />
          </svg>
        )}
      </button>

      {toast && (
        <div className="glass-panel absolute left-1/2 top-4 z-40 flex max-w-[min(520px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 rounded-lg border border-success/20 px-4 py-3 shadow-panel">
          <p className="min-w-0 flex-1 text-sm font-bold leading-5 text-foreground">{toast.message}</p>
          {toast.kind === "optimize" && lastOptimizedChain && (
            <button
              className="shrink-0 rounded-sm border border-success/30 bg-success/12 px-3 py-1.5 text-xs font-bold text-success transition hover:bg-success/20"
              onClick={undoOptimizedOrder}
              type="button"
            >
              되돌리기
            </button>
          )}
          <button
            aria-label="안내 메시지 닫기"
            className="grid h-7 w-7 shrink-0 place-items-center rounded-sm text-sm font-bold text-muted transition hover:bg-surface-muted hover:text-foreground"
            onClick={() => setToast(null)}
            type="button"
          >
            ×
          </button>
        </div>
      )}

      <TripChainBuilder
        chainPlaces={chainPlaces}
        isDragOver={isChainDropActive}
        isPreviewActive={isPreviewActive}
        isWalkingRouteActive={isWalkingRouteActive}
        onClear={clearChain}
        onDragLeave={() => setIsChainDropActive(false)}
        onDragOver={() => setIsChainDropActive(Boolean(draggedPlaceId))}
        onDropPlace={dropDraggedPlaceToChain}
        onFocusPlace={focusPlace}
        onMovePlace={movePlaceInChain}
        onOptimizeRoute={optimizeChainOrder}
        onPreview={toggleChainPreview}
        onPublish={() => setIsPublishOpen(true)}
        onRemovePlace={removePlaceFromChain}
        onReorderPlace={reorderChainPlaces}
        onWalkingRoute={toggleWalkingRoutePreview}
      />

      {isPublishOpen && (
        <TripPublishPanel
          chainPlaces={chainPlaces}
          onClose={() => setIsPublishOpen(false)}
          onPublishDraft={publishDraft}
        />
      )}

      {publishedDraft && (
        <TripDetailPreview draft={publishedDraft} onClose={() => setPublishedDraft(null)} />
      )}

      {isCommunityOpen && (
        <CommunityHub latestDraft={publishedDraft} onClose={() => setIsCommunityOpen(false)} />
      )}
    </section>
  );
}
