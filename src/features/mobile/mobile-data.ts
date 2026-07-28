export type AreaId = "seongsu" | "hongdae" | "gangnam";

export type PlaceCategory = "전시" | "카페" | "팝업" | "산책";

export type MobilePlace = {
  id: string;
  name: string;
  category: PlaceCategory;
  areaId: AreaId;
  area: string;
  address: string;
  description: string;
  distance: string;
  duration: string;
  price: string;
  tags: string[];
  hours: string;
  savedBy: number;
  lat: number;
  lng: number;
};

export type TripVisibility = "public" | "link" | "private";

export type FeedTrip = {
  id: string;
  title: string;
  description: string;
  authorHandle: string;
  authorName: string;
  areaId: AreaId;
  visibility: TripVisibility;
  placeIds: string[];
  likes: number;
  comments: number;
  saved: number;
  rankScore: number;
  isMine: boolean;
  publishedAt: string;
};

export const areaMeta: Record<AreaId, { name: string; coverage: string; center: { lat: number; lng: number } }> = {
  seongsu: { name: "성수", coverage: "건대 · 서울숲 · 뚝섬 일대", center: { lat: 37.5445, lng: 127.0507 } },
  hongdae: {
    name: "홍대",
    coverage: "합정 · 망원 · 연남 · 연희 · 상수 일대",
    center: { lat: 37.5564, lng: 126.9196 },
  },
  gangnam: { name: "강남", coverage: "신사 · 압구정 · 가로수길 일대", center: { lat: 37.5245, lng: 127.0316 } },
};

export const promptExamples = [
  "성수에서 팝업 보고 카페 가는 데이트",
  "홍대에서 친구랑 걷고 먹는 코스",
  "강남에서 쇼핑하고 분위기 좋은 저녁",
  "비 오는 날 실내 위주로 성수 둘러보기",
  "혼자 조용히 걷고 커피 마시는 코스",
];

export function inferArea(prompt: string): AreaId {
  const text = prompt.replace(/\s/g, "");

  if (/홍대|합정|망원|연남|연희|상수/.test(text)) {
    return "hongdae";
  }

  if (/강남|신사|압구정|가로수길|청담/.test(text)) {
    return "gangnam";
  }

  return "seongsu";
}

export const placesByArea: Record<AreaId, MobilePlace[]> = {
  seongsu: [
    {
      id: "seongsu-forest-brunch",
      name: "서울숲 브런치",
      category: "카페",
      areaId: "seongsu",
      area: "서울숲",
      address: "서울 성동구 서울숲길",
      description: "숲 뷰를 보며 가볍게 시작하기 좋은 브런치 카페.",
      distance: "0.4km",
      duration: "60분",
      price: "1.5만원대",
      tags: ["브런치", "숲뷰"],
      hours: "09:00 - 21:00",
      savedBy: 812,
      lat: 37.5449,
      lng: 127.041,
    },
    {
      id: "seongsu-popup",
      name: "성수 팝업 스토어",
      category: "팝업",
      areaId: "seongsu",
      area: "성수",
      address: "서울 성동구 성수이로",
      description: "이번 시즌 한정으로 열리는 트렌디한 브랜드 팝업.",
      distance: "0.9km",
      duration: "45분",
      price: "무료 입장",
      tags: ["한정", "포토존"],
      hours: "11:00 - 20:00",
      savedBy: 1204,
      lat: 37.5443,
      lng: 127.0557,
    },
    {
      id: "seongsu-roastery",
      name: "뚝섬 로스터리 카페",
      category: "카페",
      areaId: "seongsu",
      area: "뚝섬",
      address: "서울 성동구 뚝섬로",
      description: "직접 로스팅한 원두로 내리는 커피와 조용한 좌석.",
      distance: "1.2km",
      duration: "50분",
      price: "8천원대",
      tags: ["로스터리", "휴식"],
      hours: "10:00 - 22:00",
      savedBy: 566,
      lat: 37.5472,
      lng: 127.0479,
    },
    {
      id: "seongsu-gallery",
      name: "건대 전시 공간",
      category: "전시",
      areaId: "seongsu",
      area: "건대",
      address: "서울 광진구 능동로",
      description: "젊은 작가들의 작품을 소개하는 소규모 전시 공간.",
      distance: "2.1km",
      duration: "40분",
      price: "1만원",
      tags: ["전시", "문화"],
      hours: "11:00 - 19:00",
      savedBy: 341,
      lat: 37.5407,
      lng: 127.0694,
    },
    {
      id: "seongsu-riverwalk",
      name: "서울숲 산책로",
      category: "산책",
      areaId: "seongsu",
      area: "서울숲",
      address: "서울 성동구 뚝섬로 273",
      description: "해질녘 걷기 좋은 서울숲 메인 산책 코스.",
      distance: "0.6km",
      duration: "30분",
      price: "무료",
      tags: ["산책", "노을"],
      hours: "24시간",
      savedBy: 998,
      lat: 37.5445,
      lng: 127.0397,
    },
  ],
  hongdae: [
    {
      id: "hongdae-mangwon-lunch",
      name: "망원시장 점심",
      category: "카페",
      areaId: "hongdae",
      area: "망원",
      address: "서울 마포구 망원로",
      description: "로컬 무드 가득한 시장에서 즐기는 캐주얼 한 끼.",
      distance: "0.3km",
      duration: "50분",
      price: "1만원대",
      tags: ["로컬", "시장"],
      hours: "10:00 - 20:00",
      savedBy: 723,
      lat: 37.5563,
      lng: 126.9016,
    },
    {
      id: "hongdae-yeonnam-walk",
      name: "연남 골목 산책",
      category: "산책",
      areaId: "hongdae",
      area: "연남",
      address: "서울 마포구 연남동",
      description: "경의선숲길을 따라 이어지는 여유로운 걷기 코스.",
      distance: "1.0km",
      duration: "35분",
      price: "무료",
      tags: ["숲길", "느긋함"],
      hours: "24시간",
      savedBy: 1150,
      lat: 37.5619,
      lng: 126.9256,
    },
    {
      id: "hongdae-sangsu-shop",
      name: "상수 편집숍",
      category: "팝업",
      areaId: "hongdae",
      area: "상수",
      address: "서울 마포구 와우산로",
      description: "취향 좋은 소품과 의류를 큐레이션한 편집숍.",
      distance: "1.6km",
      duration: "40분",
      price: "무료 입장",
      tags: ["편집숍", "취향"],
      hours: "12:00 - 21:00",
      savedBy: 489,
      lat: 37.5478,
      lng: 126.9227,
    },
    {
      id: "hongdae-hapjeong-dining",
      name: "합정 다이닝 바",
      category: "카페",
      areaId: "hongdae",
      area: "합정",
      address: "서울 마포구 양화로",
      description: "저녁 마무리로 좋은 조용한 분위기의 다이닝 바.",
      distance: "1.9km",
      duration: "70분",
      price: "3만원대",
      tags: ["다이닝", "분위기"],
      hours: "17:00 - 24:00",
      savedBy: 645,
      lat: 37.5495,
      lng: 126.9139,
    },
    {
      id: "hongdae-yeonhui-cafe",
      name: "연희동 감성 카페",
      category: "카페",
      areaId: "hongdae",
      area: "연희",
      address: "서울 서대문구 연희로",
      description: "주택가 골목 안에 숨은 조용한 독립 카페.",
      distance: "2.3km",
      duration: "45분",
      price: "7천원대",
      tags: ["독립카페", "조용함"],
      hours: "11:00 - 20:00",
      savedBy: 402,
      lat: 37.5665,
      lng: 126.9346,
    },
  ],
  gangnam: [
    {
      id: "gangnam-sinsa-brunch",
      name: "신사 브런치",
      category: "카페",
      areaId: "gangnam",
      area: "신사",
      address: "서울 강남구 신사동",
      description: "프리미엄한 분위기로 하루를 시작하는 브런치 레스토랑.",
      distance: "0.5km",
      duration: "60분",
      price: "2.5만원대",
      tags: ["브런치", "프리미엄"],
      hours: "09:00 - 21:00",
      savedBy: 877,
      lat: 37.5233,
      lng: 127.0202,
    },
    {
      id: "gangnam-garosugil-showroom",
      name: "가로수길 쇼룸",
      category: "팝업",
      areaId: "gangnam",
      area: "신사",
      address: "서울 강남구 가로수길",
      description: "시즌 컬렉션을 미리 만나볼 수 있는 브랜드 쇼룸.",
      distance: "0.8km",
      duration: "45분",
      price: "무료 입장",
      tags: ["쇼핑", "쇼룸"],
      hours: "11:00 - 20:00",
      savedBy: 1032,
      lat: 37.5205,
      lng: 127.0233,
    },
    {
      id: "gangnam-apgujeong-dessert",
      name: "압구정 디저트 카페",
      category: "카페",
      areaId: "gangnam",
      area: "압구정",
      address: "서울 강남구 압구정로",
      description: "정갈한 디저트와 함께 잠시 쉬어가는 티타임.",
      distance: "1.4km",
      duration: "40분",
      price: "1.2만원대",
      tags: ["디저트", "휴식"],
      hours: "10:00 - 22:00",
      savedBy: 594,
      lat: 37.5274,
      lng: 127.0287,
    },
    {
      id: "gangnam-cheongdam-wine",
      name: "청담 와인바",
      category: "카페",
      areaId: "gangnam",
      area: "청담",
      address: "서울 강남구 청담동",
      description: "분위기 있는 저녁 마무리를 위한 와인바.",
      distance: "2.0km",
      duration: "80분",
      price: "4만원대",
      tags: ["와인", "분위기"],
      hours: "18:00 - 01:00",
      savedBy: 711,
      lat: 37.5245,
      lng: 127.0473,
    },
    {
      id: "gangnam-sinsa-gallery",
      name: "신사 갤러리",
      category: "전시",
      areaId: "gangnam",
      area: "신사",
      address: "서울 강남구 도산대로",
      description: "현대미술 작품을 감상할 수 있는 프라이빗 갤러리.",
      distance: "1.1km",
      duration: "35분",
      price: "무료",
      tags: ["전시", "갤러리"],
      hours: "11:00 - 19:00",
      savedBy: 288,
      lat: 37.5238,
      lng: 127.0388,
    },
  ],
};

export const categoryTone: Record<PlaceCategory, string> = {
  전시: "#7c6cf2",
  카페: "#a36a3d",
  팝업: "#e87957",
  산책: "#2f9f8f",
};

export function getPlaceById(id: string): MobilePlace | undefined {
  return Object.values(placesByArea)
    .flat()
    .find((place) => place.id === id);
}

export function getPlacesByIds(ids: string[]): MobilePlace[] {
  return ids
    .map((id) => getPlaceById(id))
    .filter((place): place is MobilePlace => Boolean(place));
}

export function getTotalMinutes(places: MobilePlace[]): number {
  return places.reduce((total, place) => {
    const minutes = Number.parseInt(place.duration, 10);
    return Number.isNaN(minutes) ? total : total + minutes;
  }, 0);
}

export const seedFeedTrips: FeedTrip[] = [
  {
    id: "seed-seongsu-popup",
    title: "성수 전시와 팝업을 잇는 오후",
    description: "서울숲에서 시작해 팝업과 로스터리 카페까지, 성수를 느긋하게 즐기는 코스.",
    authorHandle: "mina.route",
    authorName: "Mina",
    areaId: "seongsu",
    visibility: "public",
    placeIds: [
      "seongsu-forest-brunch",
      "seongsu-popup",
      "seongsu-roastery",
      "seongsu-gallery",
    ],
    likes: 384,
    comments: 18,
    saved: 142,
    rankScore: 96,
    isMine: false,
    publishedAt: "2026-07-20",
  },
  {
    id: "seed-hongdae-walk",
    title: "연남에서 상수까지 걷는 하루",
    description: "숲길 산책과 편집숍, 마지막은 조용한 다이닝 바로 마무리.",
    authorHandle: "walk.seoul",
    authorName: "Walk Seoul",
    areaId: "hongdae",
    visibility: "public",
    placeIds: [
      "hongdae-mangwon-lunch",
      "hongdae-yeonnam-walk",
      "hongdae-sangsu-shop",
      "hongdae-hapjeong-dining",
    ],
    likes: 211,
    comments: 9,
    saved: 93,
    rankScore: 88,
    isMine: false,
    publishedAt: "2026-07-18",
  },
  {
    id: "seed-gangnam-shopping",
    title: "신사 압구정 프리미엄 데이트",
    description: "쇼룸 구경부터 갤러리, 와인바까지 이어지는 강남 코스.",
    authorHandle: "popup.finder",
    authorName: "Popup Finder",
    areaId: "gangnam",
    visibility: "public",
    placeIds: [
      "gangnam-sinsa-brunch",
      "gangnam-garosugil-showroom",
      "gangnam-apgujeong-dessert",
      "gangnam-cheongdam-wine",
    ],
    likes: 512,
    comments: 27,
    saved: 238,
    rankScore: 99,
    isMine: false,
    publishedAt: "2026-07-22",
  },
];
