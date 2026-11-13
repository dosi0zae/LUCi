// The three phrases offered on the first screen. They are put together when the screen opens from what
// is true right now, so they are not the same list every time:
//  - the weather in Seoul (rain, snow, cold, hot, fine; Open-Meteo, no key, fixed Seoul coordinates so
//    nothing about the person is sent),
//  - the time of day, the season, weekend or weekday,
//  - a festival that is running today, or a famous place ("popular") picked at random.
// One phrase comes from the situation, one from the trend, one from the mood, then the order is shuffled.

import { localizePlace, places, type MobilePlace } from "@/features/mobile/mobile-data";
import type { Locale } from "@/features/mobile/i18n/translations";

export type Weather = "rain" | "snow" | "cold" | "hot" | "fine";
type TimeSlot = "morning" | "lunch" | "afternoon" | "evening" | "night";
type Season = "spring" | "summer" | "autumn" | "winter";

type Texts = {
  weather: Record<Weather, string[]>;
  time: Record<TimeSlot, string[]>;
  season: Record<Season, string[]>;
  day: Record<"weekend" | "weekday", string[]>;
  evergreen: string[];
  // {name} is replaced with a place name.
  festival: string;
  popular: string[];
};

const TEXTS: Record<Locale, Texts> = {
  ko: {
    weather: {
      rain: ["비 오는 날 실내 박물관 위주로 둘러보기", "비 오는 날 전시 보고 따뜻한 카페 가는 코스"],
      snow: ["눈 오는 날 고궁 산책하는 코스", "눈 구경하고 따뜻한 곳에서 쉬는 코스"],
      cold: ["추운 날 따뜻한 실내 위주 코스", "쌀쌀한 날 전시 보고 따뜻한 국물 먹는 코스"],
      hot: ["더운 날 시원한 전시 보고 카페 가는 코스", "더위 피해서 실내 위주로 즐기는 코스"],
      fine: ["날씨 좋은 날 걷기 좋은 산책 코스", "햇살 좋은 날 한강 노을 보러 가는 코스"],
    },
    time: {
      morning: ["아침 일찍 조용한 고궁 산책 코스", "아침에 브런치 먹고 시작하는 코스"],
      lunch: ["점심 먹고 가볍게 걷는 코스", "점심 먹고 전시 보는 코스"],
      afternoon: ["오후에 전시 보고 카페 가는 코스", "오후 햇살 받으며 걷는 산책 코스"],
      evening: ["퇴근하고 야경 보러 가는 저녁 코스", "저녁에 분위기 좋은 곳에서 여유롭게"],
      night: ["밤에 야경 보며 걷는 코스", "밤 산책하기 좋은 조용한 코스"],
    },
    season: {
      spring: ["봄꽃 구경하며 걷는 코스", "봄바람 맞으며 고궁 산책하는 코스"],
      summer: ["여름밤 한강에서 시원하게 즐기는 코스", "여름에 시원한 실내 전시 위주 코스"],
      autumn: ["단풍 구경하는 가을 산책 코스", "가을 하늘 아래 고궁 걷는 코스"],
      winter: ["겨울에 따뜻하게 즐기는 전시와 카페 코스", "겨울 고궁 산책 코스"],
    },
    day: {
      weekend: ["주말 가족 나들이 코스", "주말에 친구들이랑 핫플 투어"],
      weekday: ["평일에 한적하게 즐기는 코스", "평일 반차 내고 여유롭게 걷는 코스"],
    },
    evergreen: [
      "혼자 조용히 쉬어가는 하루",
      "데이트하기 좋은 로맨틱한 코스",
      "친구들이랑 사진 찍기 좋은 코스",
      "아이랑 함께 체험하는 코스",
      "경복궁 보고 인사동 걷는 반나절 코스",
    ],
    festival: "지금 열리는 {name} 보러 가는 코스",
    popular: ["{name} 보고 근처 걷는 코스", "{name}에서 시작하는 하루"],
  },
  en: {
    weather: {
      rain: ["Indoor museums for a rainy day", "Catch an exhibition, then a warm cafe on a rainy day"],
      snow: ["A palace walk on a snowy day", "Enjoy the snow, then warm up somewhere cosy"],
      cold: ["A warm, mostly indoor course for a cold day", "See an exhibition, then a hot bowl of soup"],
      hot: ["Cool exhibitions and a cafe on a hot day", "Escape the heat with an indoor-focused course"],
      fine: ["A good walking route for a lovely day", "Watch the sunset by the Han River"],
    },
    time: {
      morning: ["An early, quiet palace walk", "Start with brunch, then explore"],
      lunch: ["Lunch, then an easy stroll", "Lunch, then an exhibition"],
      afternoon: ["An exhibition, then a cafe this afternoon", "A sunny afternoon walk"],
      evening: ["An evening course with night views after work", "A relaxed evening somewhere with atmosphere"],
      night: ["A walk with night views", "A quiet course for a night stroll"],
    },
    season: {
      spring: ["Stroll among the spring blossoms", "A palace walk in the spring breeze"],
      summer: ["A cool summer night by the Han River", "Cool indoor exhibitions for the summer"],
      autumn: ["An autumn walk among the fall colours", "A palace walk under the autumn sky"],
      winter: ["Cosy exhibitions and cafes for winter", "A winter palace walk"],
    },
    day: {
      weekend: ["A weekend outing for the whole family", "A weekend hot-spot tour with friends"],
      weekday: ["A quiet weekday course", "Take a half day off and wander"],
    },
    evergreen: [
      "A quiet day on my own",
      "A romantic course for a date",
      "A course with great photo spots for friends",
      "A hands-on course with kids",
      "A half-day course seeing Gyeongbokgung and walking Insadong",
    ],
    festival: "A course around {name}, on right now",
    popular: ["See {name}, then walk nearby", "A day that starts at {name}"],
  },
  ja: {
    weather: {
      rain: ["雨の日に屋内の博物館を巡る", "雨の日に展示を見て温かいカフェへ"],
      snow: ["雪の日に古宮を散策するコース", "雪景色を楽しんで温かい場所で休むコース"],
      cold: ["寒い日に温かい屋内中心のコース", "寒い日に展示を見て温かいスープを楽しむコース"],
      hot: ["暑い日に涼しい展示とカフェのコース", "暑さを避けて屋内中心に楽しむコース"],
      fine: ["天気のいい日に歩きたい散策コース", "晴れた日に漢江の夕焼けを見に行くコース"],
    },
    time: {
      morning: ["朝早く静かな古宮を散策するコース", "朝はブランチから始めるコース"],
      lunch: ["ランチのあと軽く歩くコース", "ランチのあと展示を見るコース"],
      afternoon: ["午後に展示を見てカフェへ行くコース", "午後の日差しの中を歩く散策コース"],
      evening: ["仕事帰りに夜景を見に行く夕方コース", "夕方に雰囲気のいい場所でのんびり"],
      night: ["夜景を見ながら歩くコース", "夜の散歩に合う静かなコース"],
    },
    season: {
      spring: ["春の花を見ながら歩くコース", "春風の中で古宮を散策するコース"],
      summer: ["夏の夜に漢江で涼むコース", "夏に涼しい屋内展示中心のコース"],
      autumn: ["紅葉を楽しむ秋の散策コース", "秋空の下で古宮を歩くコース"],
      winter: ["冬に温かく楽しむ展示とカフェのコース", "冬の古宮散策コース"],
    },
    day: {
      weekend: ["週末の家族お出かけコース", "週末に友達とホットスポット巡り"],
      weekday: ["平日に静かに楽しむコース", "平日に半休をとってのんびり歩くコース"],
    },
    evergreen: [
      "一人で静かに過ごす一日",
      "デートにぴったりのロマンチックなコース",
      "友達と写真を撮りたいコース",
      "子どもと一緒に体験するコース",
      "景福宮を見て仁寺洞を歩く半日コース",
    ],
    festival: "今開催中の{name}を見に行くコース",
    popular: ["{name}を見て近くを歩くコース", "{name}から始まる一日"],
  },
  zh: {
    weather: {
      rain: ["雨天以室内博物馆为主", "雨天看展览再去温暖的咖啡馆"],
      snow: ["雪天漫步古宫的路线", "赏雪后在温暖的地方休息的路线"],
      cold: ["寒冷天气以温暖室内为主的路线", "冷天看展览再喝一碗热汤"],
      hot: ["炎热天气看凉爽展览再去咖啡馆", "避开暑热以室内为主的路线"],
      fine: ["天气好适合散步的路线", "晴天去汉江看夕阳的路线"],
    },
    time: {
      morning: ["清晨安静地漫步古宫", "从早午餐开始的路线"],
      lunch: ["午饭后轻松散步的路线", "午饭后看展览的路线"],
      afternoon: ["下午看展览再去咖啡馆", "沐浴午后阳光的散步路线"],
      evening: ["下班后去看夜景的傍晚路线", "傍晚在有氛围的地方悠闲度过"],
      night: ["边看夜景边散步的路线", "适合夜间散步的安静路线"],
    },
    season: {
      spring: ["边赏春花边散步的路线", "在春风中漫步古宫的路线"],
      summer: ["夏夜在汉江边乘凉的路线", "夏天以凉爽室内展览为主的路线"],
      autumn: ["赏红叶的秋日散步路线", "在秋日天空下漫步古宫的路线"],
      winter: ["冬天温暖享受展览和咖啡馆的路线", "冬日古宫漫步路线"],
    },
    day: {
      weekend: ["周末家庭出游路线", "周末和朋友逛热门景点"],
      weekday: ["工作日安静享受的路线", "工作日请半天假悠闲漫步的路线"],
    },
    evergreen: [
      "一个人安静度过的一天",
      "适合约会的浪漫路线",
      "和朋友一起拍照的路线",
      "带孩子一起体验的路线",
      "参观景福宫再逛仁寺洞的半日路线",
    ],
    festival: "去看正在举办的{name}的路线",
    popular: ["参观{name}再在附近散步的路线", "从{name}开始的一天"],
  },
};

const pick = <T>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const FESTIVAL_RANGE = /^(\d{4})\.(\d{2})\.(\d{2}) - (\d{4})\.(\d{2})\.(\d{2})$/;

// A festival whose run includes today (the data stores "YYYY.MM.DD - YYYY.MM.DD" in `hours`).
function festivalsRunningToday(now: Date): MobilePlace[] {
  const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();
  return places.filter((place) => {
    if (place.category !== "축제행사") {
      return false;
    }
    const match = FESTIVAL_RANGE.exec(place.hours);
    if (!match) {
      return false;
    }
    const start = Number(match[1]) * 10000 + Number(match[2]) * 100 + Number(match[3]);
    const end = Number(match[4]) * 10000 + Number(match[5]) * 100 + Number(match[6]);
    return start <= today && today <= end;
  });
}

// The places everyone knows. Picked by hand from the top of the fame ranking (the raw ranking also holds
// district names, duplicate listings and museum objects, which make poor phrases); a name that is not in
// the data is simply skipped.
const FAMOUS_NAMES = [
  "경복궁",
  "창덕궁",
  "덕수궁",
  "종묘",
  "남산공원",
  "북촌한옥마을",
  "익선동한옥거리",
  "서울숲",
  "여의도한강공원",
  "반포한강공원",
  "뚝섬한강공원",
  "청계천",
  "롯데월드 어드벤처",
];
const FAMOUS_PLACES = FAMOUS_NAMES.map((name) => places.find((place) => place.name === name)).filter(
  (place): place is MobilePlace => Boolean(place),
);

export function buildPromptSuggestions(locale: Locale, weather: Weather | null, now: Date = new Date()): string[] {
  const text = TEXTS[locale];
  const hour = now.getHours();
  const month = now.getMonth() + 1;
  const slot: TimeSlot = hour < 10 ? "morning" : hour < 14 ? "lunch" : hour < 18 ? "afternoon" : hour < 22 ? "evening" : "night";
  const season: Season = month >= 3 && month <= 5 ? "spring" : month <= 8 && month >= 6 ? "summer" : month >= 9 && month <= 11 ? "autumn" : "winter";
  const isWeekend = now.getDay() === 0 || now.getDay() === 6;

  const picked: string[] = [];
  const add = (phrase: string | undefined) => {
    if (phrase && !picked.includes(phrase)) {
      picked.push(phrase);
    }
  };

  // 1. The situation: a day with real weather first, otherwise the time of day (and a fine day's walk).
  add(pick(weather && weather !== "fine" ? text.weather[weather] : [...text.time[slot], ...(weather === "fine" ? text.weather.fine : [])]));

  // 2. The trend: a festival that is on right now, else somewhere everyone knows.
  const festival = festivalsRunningToday(now);
  if (festival.length > 0 && Math.random() < 0.7) {
    add(text.festival.replace("{name}", localizePlace(pick(festival), locale).name));
  } else {
    add(
      FAMOUS_PLACES.length > 0
        ? pick(text.popular).replace("{name}", localizePlace(pick(FAMOUS_PLACES), locale).name)
        : undefined,
    );
  }

  // 3. The mood: the season, the kind of day, or an all-weather favourite.
  add(pick([...text.season[season], ...text.day[isWeekend ? "weekend" : "weekday"], ...text.evergreen]));

  while (picked.length < 3) {
    add(pick(text.evergreen));
  }
  return shuffle(picked).slice(0, 3);
}

const WEATHER_CACHE_KEY = "tripchain:weather";
const WEATHER_CACHE_MS = 30 * 60 * 1000;
const RAIN_CODES = new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99]);
const SNOW_CODES = new Set([71, 73, 75, 77, 85, 86]);

// Seoul's weather right now (cached for half an hour in this tab), or null when it cannot be had in time.
export async function fetchSeoulWeather(): Promise<Weather | null> {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(WEATHER_CACHE_KEY) ?? "null") as { at: number; weather: Weather } | null;
    if (cached && Date.now() - cached.at < WEATHER_CACHE_MS) {
      return cached.weather;
    }
  } catch {
    // Storage unavailable: just ask again.
  }
  try {
    const response = await fetch(
      "https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.978&current=temperature_2m,precipitation,weather_code",
      { signal: AbortSignal.timeout(2500) },
    );
    if (!response.ok) {
      return null;
    }
    const current = (await response.json())?.current;
    const code = Number(current?.weather_code);
    const temperature = Number(current?.temperature_2m);
    const precipitation = Number(current?.precipitation);
    const weather: Weather = SNOW_CODES.has(code)
      ? "snow"
      : RAIN_CODES.has(code) || precipitation > 0
        ? "rain"
        : temperature <= 3
          ? "cold"
          : temperature >= 29
            ? "hot"
            : "fine";
    try {
      window.sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ at: Date.now(), weather }));
    } catch {
      // Not remembered, fine.
    }
    return weather;
  } catch {
    return null;
  }
}
