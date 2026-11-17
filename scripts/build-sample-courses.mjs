// Builds the sample courses shown in 탐색 (src/features/mobile/sample-courses.json) from the current place data:
// each course is a theme, a handful of named sights, one meal and one café picked near them, and the order
// that makes the whole walk shortest with the meal after the same sights and the café last (the same rule
// as optimizeRoutePreservingPins in recommend-engine.ts).
//
//   node scripts/build-sample-courses.mjs            # writes sample-courses.json
//   node scripts/build-sample-courses.mjs --check    # prints what each course picked, writes nothing

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "src", "features", "mobile");
const CHECK = process.argv.includes("--check");

const sights = JSON.parse(readFileSync(path.join(DATA, "seoul-places.json"), "utf8"));
const dining = [];
for (const file of readdirSync(path.join(DATA, "dining-data")).filter((f) => f.endsWith(".json") && !["bounds.json", "districts.json"].includes(f))) {
  dining.push(...JSON.parse(readFileSync(path.join(DATA, "dining-data", file), "utf8")));
}

const hav = (a, b) => {
  const r = Math.PI / 180;
  const dl = (b.lat - a.lat) * r;
  const dg = (b.lng - a.lng) * r;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dg / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
};
const walk = (route) => route.reduce((sum, place, i) => (i ? sum + hav(route[i - 1], place) : 0), 0);
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((rest) => [x, ...rest])));

// [title, description, sights..., translations]. Sight names are matched exactly (a "name@구" picks the district).
const COURSES = [
  {
    ko: ["고궁과 박물관을 잇는 하루", "경복궁에서 시작해 근처 박물관과 한옥 골목까지 걷는 정통 코스."],
    en: ["Palaces and Museums in a Day", "Start at Gyeongbokgung, then walk on to nearby museums and a hanok lane."],
    ja: ["古宮と博物館をつなぐ一日", "景福宮から始まり、近くの博物館や韓屋の路地まで歩く定番コース。"],
    zh: ["串联古宫与博物馆的一天", "从景福宫出发，步行前往附近的博物馆与韩屋巷的经典路线。"],
    sights: ["경복궁", "국립민속박물관 본관", "국립현대미술관 서울", "서울도보관광코스 북촌한옥마을"],
  },
  {
    ko: ["조선 왕실을 따라 걷는 하루", "창덕궁에서 창경궁, 종묘까지 왕실의 길을 이어 걷는 코스."],
    en: ["Walking the Joseon Royal Path", "From Changdeokgung through Changgyeonggung to Jongmyo, following the royal grounds."],
    ja: ["朝鮮王室をたどる一日", "昌徳宮から昌慶宮、宗廟まで王室の道をつないで歩くコース。"],
    zh: ["沿着朝鲜王室漫步的一天", "从昌德宫经昌庆宫到宗庙，沿王室之路一路走下去。"],
    sights: ["창덕궁", "창경궁", "종묘@종로구"],
  },
  {
    ko: ["서울 도심 대표 명소 도장깨기", "덕수궁부터 서울로, 남산까지 처음 서울에 온 날 꼭 가볼 곳."],
    en: ["Seoul's Must-See Highlights", "Deoksugung, Seoullo and Namsan: the essentials for a first day in Seoul."],
    ja: ["ソウル都心の代表スポット制覇", "徳寿宮からソウルロ、南山まで初めてのソウルで外せない場所。"],
    zh: ["首尔市中心必游地标打卡", "从德寿宫、首尔路到南山，初到首尔不容错过的地方。"],
    sights: ["덕수궁", "서울로7017", "남산공원(서울)", "N서울타워"],
  },
  {
    ko: ["남산 한옥마을과 야경 산책", "한옥마을에서 시작해 해질녘 남산 전망까지 이어지는 저녁 코스."],
    en: ["Namsan Hanok and Night Views", "From the hanok village to the Namsan view at dusk."],
    ja: ["南山韓屋村と夜景さんぽ", "韓屋村から始まり、夕暮れの南山の眺めまで続く夕方コース。"],
    zh: ["南山韩屋村与夜景漫步", "从韩屋村出发，在黄昏时分欣赏南山景色的傍晚路线。"],
    sights: ["남산골한옥마을", "남산케이블카", "N서울타워"],
  },
  {
    ko: ["한강 노을 보러 가는 하루", "여의도 물빛광장에서 한강공원까지, 강변을 따라 노을을 기다리는 코스."],
    en: ["Han River Sunset Day", "From Yeouido Water Plaza to Hangang Park, waiting for the sunset along the river."],
    ja: ["漢江の夕焼けを見に行く一日", "汝矣島の水辺広場から漢江公園まで、川沿いで夕焼けを待つコース。"],
    zh: ["去汉江看日落的一天", "从汝矣岛水光广场到汉江公园，沿江等待日落的路线。"],
    sights: ["여의도물빛광장", "여의도한강공원", "63빌딩"],
  },
  {
    ko: ["홍대·연남 감성 산책", "경의선숲길을 따라 책거리와 골목을 걷는 마포의 하루."],
    en: ["Hongdae and Yeonnam Stroll", "A Mapo day along the Gyeongui Line Forest Park, past the book street and back lanes."],
    ja: ["弘大・延南の感性さんぽ", "京義線の森道に沿って本通りや路地を歩く麻浦の一日。"],
    zh: ["弘大·延南文艺漫步", "沿京义线森林路走过书街与小巷的麻浦一日。"],
    sights: ["경의선숲길", "경의선책거리", "홍대걷고싶은거리"],
  },
  {
    ko: ["망원시장과 한강 나들이", "시장에서 간식을 사 들고 한강공원까지 이어지는 가벼운 코스."],
    en: ["Mangwon Market and the River", "Grab snacks at the market and carry them down to the riverside park."],
    ja: ["望遠市場と漢江さんぽ", "市場でおやつを買って漢江公園まで歩く気軽なコース。"],
    zh: ["望远市场与汉江之行", "在市场买点小吃，一路走到汉江公园的轻松路线。"],
    sights: ["망원시장", "망리단길", "망원한강공원"],
  },
  {
    ko: ["서울숲과 성수 나들이", "서울숲 산책길과 은행나무길을 걷고 성수의 전시 공간까지 들르는 코스."],
    en: ["Seoul Forest and Seongsu", "Forest paths and the ginkgo avenue, then an exhibition space in Seongsu."],
    ja: ["ソウルの森と聖水さんぽ", "ソウルの森の遊歩道とイチョウ並木を歩き、聖水の展示空間に立ち寄るコース。"],
    zh: ["首尔林与圣水之行", "漫步首尔林步道与银杏路，再前往圣水展览空间的路线。"],
    sights: ["서울숲공원산책길", "서울숲 은행나무길", "디뮤지엄"],
  },
  {
    ko: ["주말 가족 나들이: 잠실", "롯데월드와 석촌호수, 아쿠아리움까지 아이와 함께 걷는 하루."],
    en: ["Weekend Family Outing: Jamsil", "Lotte World, Seokchon Lake and the aquarium: a day for walking with kids."],
    ja: ["週末家族お出かけ：蚕室", "ロッテワールドと石村湖、水族館まで子どもと歩く一日。"],
    zh: ["周末家庭出游：蚕室", "乐天世界、石村湖和水族馆，适合带孩子漫步的一天。"],
    sights: ["롯데월드 어드벤처", "석촌호수 서호", "롯데월드아쿠아리움"],
  },
  {
    ko: ["올림픽공원 산책 코스", "넓은 잔디밭과 장미광장을 걷고 한성백제박물관까지 들르는 코스."],
    en: ["Olympic Park Walk", "Wide lawns and the rose plaza, ending at the Hanseong Baekje Museum."],
    ja: ["オリンピック公園さんぽ", "広い芝生とバラ広場を歩き、漢城百済博物館まで立ち寄るコース。"],
    zh: ["奥林匹克公园漫步", "走过大片草坪与玫瑰广场，再到汉城百济博物馆的路线。"],
    sights: ["올림픽공원", "올림픽공원 장미광장", "한성백제박물관"],
  },
  {
    ko: ["용산 박물관 데이", "국립중앙박물관과 전쟁기념관, 리움미술관을 잇는 실내 코스."],
    en: ["Yongsan Museum Day", "An indoor course linking the National Museum, the War Memorial and Leeum."],
    ja: ["龍山ミュージアムデー", "国立中央博物館、戦争記念館、リウム美術館をつなぐ屋内コース。"],
    zh: ["龙山博物馆日", "串联国立中央博物馆、战争纪念馆与Leeum美术馆的室内路线。"],
    sights: ["국립중앙박물관", "전쟁기념관", "리움미술관"],
  },
  {
    ko: ["북촌·익선 전통 산책", "한옥 골목과 인사동 거리를 걸으며 옛 서울을 만나는 코스."],
    en: ["Bukchon and Ikseon Walk", "Hanok lanes and the Insadong street: meeting old Seoul on foot."],
    ja: ["北村・益善の伝統さんぽ", "韓屋の路地と仁寺洞の通りを歩いて昔のソウルに出会うコース。"],
    zh: ["北村·益善传统漫步", "走过韩屋小巷与仁寺洞街，邂逅老首尔的路线。"],
    sights: ["익선동한옥거리", "인사동 문화의거리", "서울도보관광코스 북촌한옥마을"],
  },
  {
    ko: ["서촌과 인왕산 조용한 산책", "윤동주문학관에서 인왕산 둘레길로 이어지는 차분한 코스."],
    en: ["Seochon and Inwangsan Walk", "A calm route from the Yun Dong-ju Museum to the Inwangsan trail."],
    ja: ["西村と仁王山の静かな散歩", "尹東柱文学館から仁王山の周遊路へ続く落ち着いたコース。"],
    zh: ["西村与仁王山静谧漫步", "从尹东柱文学馆到仁王山环山路的宁静路线。"],
    sights: ["윤동주문학관", "윤동주시인의언덕", "인왕산둘레길"],
  },
  {
    ko: ["동대문 DDP와 한양도성", "디자인 플라자에서 낙산공원 성곽길까지 새것과 옛것을 오가는 코스."],
    en: ["Dongdaemun DDP and City Wall", "From the design plaza to the Naksan fortress path: new and old side by side."],
    ja: ["東大門DDPと漢陽都城", "デザインプラザから駱山公園の城郭道まで新旧を行き来するコース。"],
    zh: ["东大门DDP与汉阳都城", "从设计广场到骆山公园城墙路，新旧交错的路线。"],
    sights: ["동대문디자인플라자", "낙산공원", "서울 한양도성@종로구"],
  },
  {
    ko: ["이태원·한남 이색 문화 코스", "앤틱 거리와 이태원 거리, 리움미술관까지 이어지는 이국적인 하루."],
    en: ["Itaewon and Hannam Culture", "Antique street, Itaewon's main street and Leeum: an international kind of day."],
    ja: ["梨泰院・漢南の異色カルチャー", "アンティーク通りと梨泰院通り、リウム美術館へ続くエキゾチックな一日。"],
    zh: ["梨泰院·汉南异域文化路线", "古董街、梨泰院街到Leeum美术馆，充满异国风情的一天。"],
    sights: ["이태원앤틱가구거리", "이태원거리", "리움미술관"],
  },
  {
    ko: ["서대문 독립의 길", "독립문에서 서대문형무소까지 근현대 역사를 짚어 보는 코스."],
    en: ["Seodaemun Independence Path", "From Independence Gate to the Seodaemun Prison: modern history on foot."],
    ja: ["西大門・独立への道", "独立門から西大門刑務所まで近現代史をたどるコース。"],
    zh: ["西大门独立之路", "从独立门到西大门刑务所，回顾近现代历史的路线。"],
    sights: ["서울 독립문", "서울 구 서대문형무소", "독립문영천시장"],
  },
  {
    ko: ["북서울꿈의숲 숲길 산책", "넓은 숲 공원을 걷고 동네 공원과 재래시장까지 이어지는 가벼운 코스."],
    en: ["North Seoul Dream Forest Walk", "A wide forest park, a neighbourhood park and a traditional market, all easy walking."],
    ja: ["北ソウルの夢の森さんぽ", "広い森の公園から近所の公園、在来市場まで続く気軽なコース。"],
    zh: ["北首尔梦想森林漫步", "走过大片森林公园、社区公园与传统市场的轻松路线。"],
    sights: ["북서울꿈의숲", "오동근린공원", "수유재래시장"],
  },
  {
    ko: ["강남 도심 속 쉼표", "봉은사와 코엑스, 별마당도서관을 잇는 도심 속 쉬어가기 코스."],
    en: ["A Pause in Gangnam", "Bongeunsa Temple, COEX and the Starfield Library: a breather in the city."],
    ja: ["江南・都心の休息", "奉恩寺とCOEX、ピョルマダン図書館をつなぐ都心の休憩コース。"],
    zh: ["江南都市中的小憩", "串联奉恩寺、COEX与星空图书馆的都市休憩路线。"],
    sights: ["대한불교조계종 봉은사", "코엑스", "별마당도서관 스타필드코엑스몰"],
  },
  {
    ko: ["서울식물원과 옛 양천 마을", "식물원 온실을 보고 겸재 미술관과 양천향교까지 이어지는 마곡의 하루."],
    en: ["Botanic Park and Old Yangcheon", "The glasshouse, then the Gyeomjae art museum and the old Yangcheon school."],
    ja: ["ソウル植物園と古い陽川の町", "植物園の温室を見て、謙斎美術館と陽川郷校へ続く麻谷の一日。"],
    zh: ["首尔植物园与古阳川村", "参观植物园温室，再到谦斋美术馆与阳川乡校的麻谷一日。"],
    sights: ["서울식물원", "겸재정선미술관", "양천향교"],
  },
  {
    ko: ["성북동 문화예술 산책", "길상사와 간송미술관, 성북동 고택까지 조용히 걷는 코스."],
    en: ["Seongbuk-dong Arts Walk", "A quiet walk from Gilsangsa Temple to the Kansong Museum and old mansions."],
    ja: ["城北洞アートさんぽ", "吉祥寺から澗松美術館、城北洞の古い邸宅まで静かに歩くコース。"],
    zh: ["城北洞艺术漫步", "从吉祥寺到涧松美术馆和城北洞古宅的安静路线。"],
    sights: ["길상사(서울)", "간송미술관(서울 보화각)", "성북동 별서"],
  },
];

function find(spec) {
  const [name, area] = spec.split("@");
  const matches = sights.filter((p) => p.name === name && (!area || p.area === area));
  if (matches.length > 0) {
    // an exact name can exist twice (old heritage entry and a new place): prefer the one with the richer record
    return matches.sort((a, b) => (b.image ? 1 : 0) - (a.image ? 1 : 0) || (b.fameScore ?? 0) - (a.fameScore ?? 0))[0];
  }
  return null;
}

const popScore = (p) => (p.dining?.pop === "high" ? 1 : 0) + (p.dining?.hot === "surge" || p.dining?.hot === "rising" ? 0.3 : 0) + ((p.dining?.tagIds?.length ?? 0) > 0 ? 0.3 : 0);
function pickDining(category, near, taken, maxKm) {
  return dining
    .filter((p) => p.category === category && !taken.has(p.id) && hav(near, p) <= maxKm)
    .map((p) => ({ p, score: popScore(p) - hav(near, p) * 1.5 }))
    .sort((a, b) => b.score - a.score)[0]?.p;
}

const out = [];
const problems = [];
COURSES.forEach((course, index) => {
  const stops = course.sights.map((spec) => ({ spec, place: find(spec) }));
  const missing = stops.filter((s) => !s.place).map((s) => s.spec);
  if (missing.length > 0) {
    problems.push(`${course.ko[0]}: not found ${missing.join(", ")}`);
    return;
  }
  const chosen = stops.map((s) => s.place);
  const taken = new Set(chosen.map((p) => p.id));
  const mealAfter = Math.floor((chosen.length - 1) / 2);
  // the meal is picked near the sight it follows, the café near the last one (like weaveDefaultDining)
  const meal = pickDining("식당", chosen[mealAfter], taken, 1.0);
  if (meal) taken.add(meal.id);
  const cafe = pickDining("카페", chosen[chosen.length - 1], taken, 1.0);
  if (!meal || !cafe) problems.push(`${course.ko[0]}: no ${!meal ? "meal" : "café"} within 1 km`);

  // best order of the sights with the meal after `mealAfter + 1` sights and the café last
  let best = null;
  let bestKm = Infinity;
  for (const order of perms(chosen)) {
    const route = [];
    order.forEach((p, i) => {
      route.push(p);
      if (meal && i === mealAfter) route.push(meal);
    });
    if (cafe) route.push(cafe);
    const km = walk(route);
    if (km < bestKm) {
      bestKm = km;
      best = route;
    }
  }
  out.push({ index, ko: course.ko, en: course.en, ja: course.ja, zh: course.zh, placeIds: best.map((p) => p.id), km: Number(bestKm.toFixed(2)), names: best.map((p) => p.name) });
});

for (const row of out) console.log(`${String(row.index + 1).padStart(2)}. ${row.ko[0]} (${row.km} km): ${row.names.join(" → ")}`);
if (problems.length > 0) console.log("\nPROBLEMS:\n" + problems.join("\n"));

if (!CHECK) {
  if (problems.length > 0) {
    console.error("\nNot written: fix the problems above first.");
    process.exit(1);
  }
  const file = COURSES.map((c, i) => {
    const row = out.find((r) => r.index === i);
    return { title: c.ko[0], description: c.ko[1], translations: { en: { title: c.en[0], description: c.en[1] }, ja: { title: c.ja[0], description: c.ja[1] }, zh: { title: c.zh[0], description: c.zh[1] } }, placeIds: row.placeIds };
  });
  writeFileSync(path.join(DATA, "sample-courses.json"), JSON.stringify(file, null, 1) + "\n", "utf8");
  console.log(`\nwritten ${file.length} courses to src/features/mobile/sample-courses.json`);
}
