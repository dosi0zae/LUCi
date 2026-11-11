import type { Locale } from "@/features/mobile/i18n/translations";
import type { MobilePlace } from "@/features/mobile/mobile-data";

// The closed tag vocabulary of dining stops (scripts/build-food-pool.mjs TAG_GROUPS), by id, in
// every UI language. A stop stores only ids; the label is looked up here per language.
// `main` marks the tags that say what kind of place it is (cuisine / café type / bar type) —
// the one shown in the short subtitle of a course card.
type TagLabels = { ko: string; en: string; ja: string; zh: string; main?: true };

export const DINING_TAGS: Record<string, TagLabels> = {
  // meal
  brunch: { ko: "아침·브런치", en: "Breakfast & brunch", ja: "朝食・ブランチ", zh: "早餐·早午餐" },
  lunch: { ko: "점심", en: "Lunch", ja: "ランチ", zh: "午餐" },
  dinner: { ko: "저녁", en: "Dinner", ja: "ディナー", zh: "晚餐" },
  dessert: { ko: "간식·디저트", en: "Snacks & dessert", ja: "軽食・デザート", zh: "点心·甜品" },
  drinks: { ko: "술 한잔", en: "Drinks", ja: "一杯", zh: "小酌" },
  latenight: { ko: "야식", en: "Late-night eats", ja: "夜食", zh: "夜宵" },
  // cuisine
  korean: { ko: "한식", en: "Korean", ja: "韓国料理", zh: "韩餐", main: true },
  soup: { ko: "국밥·탕", en: "Soups & stews", ja: "クッパ・鍋", zh: "汤饭·汤锅", main: true },
  grill: { ko: "고기·구이", en: "Grilled meat", ja: "焼肉", zh: "烤肉", main: true },
  noodle: { ko: "면", en: "Noodles", ja: "麺類", zh: "面食", main: true },
  snack: { ko: "분식", en: "Korean street snacks", ja: "粉食（軽食）", zh: "韩式小吃", main: true },
  japanese: { ko: "일식", en: "Japanese", ja: "日本料理", zh: "日料", main: true },
  western: { ko: "양식·파스타", en: "Western & pasta", ja: "洋食・パスタ", zh: "西餐·意面", main: true },
  chinese: { ko: "중식", en: "Chinese", ja: "中華料理", zh: "中餐", main: true },
  asian: { ko: "아시안", en: "Asian", ja: "アジア料理", zh: "亚洲料理", main: true },
  seafood: { ko: "해산물", en: "Seafood", ja: "海鮮", zh: "海鲜", main: true },
  vegan: { ko: "비건·채식", en: "Vegan & vegetarian", ja: "ヴィーガン・ベジタリアン", zh: "纯素·素食", main: true },
  course: { ko: "한정식·코스", en: "Set course", ja: "韓定食・コース", zh: "韩定食·套餐", main: true },
  // café type
  coffee: { ko: "커피 전문", en: "Coffee specialist", ja: "コーヒー専門", zh: "咖啡专门店", main: true },
  cake: { ko: "디저트·케이크", en: "Desserts & cake", ja: "デザート・ケーキ", zh: "甜品·蛋糕", main: true },
  bakery: { ko: "베이글·빵", en: "Bagels & bread", ja: "ベーグル・パン", zh: "贝果·面包", main: true },
  tea: { ko: "전통차·한옥카페", en: "Traditional tea & hanok cafe", ja: "伝統茶・韓屋カフェ", zh: "传统茶·韩屋咖啡馆", main: true },
  brunchcafe: { ko: "브런치 카페", en: "Brunch cafe", ja: "ブランチカフェ", zh: "早午餐咖啡馆", main: true },
  // bar type
  wine: { ko: "와인", en: "Wine", ja: "ワイン", zh: "葡萄酒", main: true },
  cocktail: { ko: "칵테일", en: "Cocktails", ja: "カクテル", zh: "鸡尾酒", main: true },
  soju: { ko: "전통주·막걸리", en: "Traditional liquor & makgeolli", ja: "伝統酒・マッコリ", zh: "传统酒·马格利", main: true },
  beer: { ko: "맥주·펍", en: "Beer & pub", ja: "ビール・パブ", zh: "啤酒·酒馆", main: true },
  izakaya: { ko: "이자카야·포차", en: "Izakaya & pocha", ja: "居酒屋・ポチャ", zh: "居酒屋·大排档", main: true },
  // mood
  quiet: { ko: "조용한", en: "Quiet", ja: "静か", zh: "安静" },
  lively: { ko: "활기찬", en: "Lively", ja: "賑やか", zh: "热闹" },
  aesthetic: { ko: "감성·인테리어", en: "Stylish interior", ja: "おしゃれな内装", zh: "氛围·内饰" },
  trendy: { ko: "힙한·트렌디", en: "Trendy", ja: "トレンディ", zh: "潮流" },
  classic: { ko: "노포·오래된", en: "Long-established", ja: "老舗", zh: "老店" },
  hanok: { ko: "한옥·전통", en: "Hanok & traditional", ja: "韓屋・伝統", zh: "韩屋·传统" },
  view: { ko: "뷰 좋은", en: "Nice view", ja: "眺めが良い", zh: "景观好" },
  // situation
  date: { ko: "데이트", en: "Date", ja: "デート", zh: "约会" },
  solo: { ko: "혼자", en: "Solo", ja: "一人で", zh: "独自" },
  friends: { ko: "친구 모임", en: "With friends", ja: "友人との集まり", zh: "朋友聚会" },
  family: { ko: "가족·아이", en: "Family & kids", ja: "家族・子連れ", zh: "家庭·亲子" },
  group: { ko: "단체", en: "Groups", ja: "団体", zh: "团体" },
  pet: { ko: "반려동물", en: "Pet-friendly", ja: "ペット同伴可", zh: "可带宠物" },
  work: { ko: "작업·공부", en: "Work & study", ja: "作業・勉強", zh: "办公·学习" },
  foreigner: { ko: "외국인 친화", en: "Foreigner-friendly", ja: "外国人に優しい", zh: "对外国人友好" },
  // info
  waiting: { ko: "웨이팅 많음", en: "Often a wait", ja: "待ち時間が長い", zh: "常需排队" },
  reserve: { ko: "예약 권장", en: "Reservation advised", ja: "予約推奨", zh: "建议预约" },
  value: { ko: "가성비", en: "Good value", ja: "コスパが良い", zh: "性价比高" },
  late: { ko: "늦게까지", en: "Open late", ja: "夜遅くまで", zh: "营业到很晚" },
  parking: { ko: "주차 가능", en: "Parking available", ja: "駐車可", zh: "可停车" },
  // space
  spacious: { ko: "넓은 매장", en: "Spacious", ja: "広い店内", zh: "宽敞" },
  cozy: { ko: "아담한 매장", en: "Cozy", ja: "こぢんまり", zh: "小巧温馨" },
  groupseat: { ko: "단체석·룸", en: "Group seating & rooms", ja: "団体席・個室", zh: "团体席·包间" },
  barseat: { ko: "바 좌석", en: "Bar seating", ja: "カウンター席", zh: "吧台座位" },
  soloseat: { ko: "1인석", en: "Single seats", ja: "一人席", zh: "单人座" },
  outdoor: { ko: "야외 좌석", en: "Outdoor seating", ja: "屋外席", zh: "户外座位" },
  rooftop: { ko: "루프탑", en: "Rooftop", ja: "ルーフトップ", zh: "屋顶露台" },
  terrace: { ko: "테라스", en: "Terrace", ja: "テラス", zh: "露台" },
  highceiling: { ko: "층고 높은", en: "High ceilings", ja: "天井が高い", zh: "挑高" },
  hanokspace: { ko: "한옥 공간", en: "Hanok space", ja: "韓屋空間", zh: "韩屋空间" },
};

export function diningTagLabel(id: string, locale: Locale): string | undefined {
  return DINING_TAGS[id]?.[locale];
}

// The one tag that names what kind of place it is (cuisine / café type / bar type), if any.
export function mainDiningTagId(tagIds: string[]): string | undefined {
  return tagIds.find((id) => DINING_TAGS[id]?.main);
}

// "60분" → "60 min" / "60分" / "60分钟". Other strings pass through.
export function localizeMinutes(duration: string, locale: Locale): string {
  const match = /^(\d+)\s*분$/.exec(duration);
  if (!match || locale === "ko") {
    return duration;
  }
  const minutes = match[1];
  return locale === "en" ? `${minutes} min` : locale === "ja" ? `${minutes}分` : `${minutes}分钟`;
}

// The short line under a stop's name in a course. Sights show their district; a restaurant,
// café or bar shows what it is (category + cuisine/café/bar type) — the district is the same
// for most of the course and says little about a place you will eat at.
// `place` is the localized place, `categoryLabel` its category in the UI language.
export function placeSubtitle(place: MobilePlace, categoryLabel: string, locale: Locale): string {
  if (place.source !== "dining" || !place.dining) {
    return `${place.area} · ${place.duration}`;
  }
  const mainId = mainDiningTagId(place.dining.tagIds);
  const main = mainId ? diningTagLabel(mainId, locale) : undefined;
  return [categoryLabel, main, place.duration].filter(Boolean).join(" · ");
}
