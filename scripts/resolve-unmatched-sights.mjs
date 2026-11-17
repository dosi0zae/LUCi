// Second chance for the place names the blog discovery (discover-sights.mjs) could not tie to a Kakao
// place inside the district it was found in. Two things make a name miss there:
//   - the post was about a neighbouring district ("흥인지문" found while searching 동대문구 stands in 종로구),
//   - Kakao files the place under a spelling with spaces ("경의선 책거리").
// Each such name that several posts used is searched across all of Seoul; a hit is filed under the
// district its ADDRESS is in, as scripts/.cache/sights-<구>-extra.json, which the merge stage of
// build-sights-pool.mjs reads next to the normal resolved list.
//
//   node scripts/resolve-unmatched-sights.mjs

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CACHE_DIR = path.join(__dirname, ".cache");

const env = {};
for (const line of readFileSync(path.join(ROOT, ".env.local"), "utf8").split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eq = trimmed.indexOf("=");
  if (eq !== -1) env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const squash = (value) => String(value).replace(/[\s·・\-_()（）\[\]"'.,]/g, "");
const MIN_POSTS = 3;
const AREA_NAME = /^[가-힣0-9]{2,8}(동|역|[0-9]가)$|사거리$|삼거리$|로터리$|교차로$/;
const NOT_A_SIGHT = /음식점|카페|술집|호텔|숙박|영화관|백화점|대형마트|편의점|병원|학원|지하철|전철|주차장|버스/;

const DISTRICTS = [
  "종로구", "중구", "용산구", "성동구", "광진구", "동대문구", "중랑구", "성북구", "강북구", "도봉구", "노원구",
  "은평구", "서대문구", "마포구", "양천구", "강서구", "구로구", "금천구", "영등포구", "동작구", "관악구",
  "서초구", "강남구", "송파구", "강동구",
];

async function kakaoKeyword(query) {
  const params = new URLSearchParams({ query, size: "7" });
  for (let attempt = 1; attempt <= 4; attempt++) {
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params}`, {
      headers: { Authorization: `KakaoAK ${env.KAKAO_REST_API_KEY}` },
    });
    if (response.ok) {
      await sleep(60);
      return response.json();
    }
    if (response.status === 429 || response.status >= 500) {
      await sleep(500 * attempt);
      continue;
    }
    return { documents: [] };
  }
  return { documents: [] };
}

// name -> { posts (largest over districts), samples, seenIn: districts that already listed it }
const wanted = new Map();
const resolvedByDistrict = {};
for (const district of DISTRICTS) {
  const file = path.join(CACHE_DIR, `sights-${district}-resolved.json`);
  if (!existsSync(file)) continue;
  const rows = JSON.parse(readFileSync(file, "utf8"));
  resolvedByDistrict[district] = rows;
  for (const row of rows) {
    if (row.kakao || row.posts < MIN_POSTS || AREA_NAME.test(row.name) || /구$/.test(row.name) || squash(row.name).length < 3) continue;
    const key = squash(row.name);
    const entry = wanted.get(key) ?? { name: row.name, posts: 0, samples: [] };
    entry.posts = Math.max(entry.posts, row.posts);
    if (entry.samples.length === 0) entry.samples = row.samples ?? [];
    wanted.set(key, entry);
  }
}
console.log(`[unmatched] ${wanted.size} distinct names used by ${MIN_POSTS}+ posts without a place in their own district`);

const byDistrict = {};
let found = 0;
for (const entry of wanted.values()) {
  const key = squash(entry.name);
  const data = await kakaoKeyword(`서울 ${entry.name}`);
  const docs = (data.documents ?? []).filter(
    (doc) => /^서울/.test(doc.address_name ?? "") && !NOT_A_SIGHT.test(doc.category_name ?? ""),
  );
  const pick =
    docs.find((doc) => squash(doc.place_name) === key) ??
    docs.find((doc) => squash(doc.place_name).includes(key) || (squash(doc.place_name).length >= 3 && key.includes(squash(doc.place_name))));
  if (!pick) continue;
  const district = DISTRICTS.find((name) => (pick.address_name ?? "").includes(`서울 ${name}`));
  if (!district) continue;
  found += 1;
  (byDistrict[district] ??= []).push({
    name: entry.name,
    posts: entry.posts,
    samples: entry.samples,
    kakao: {
      id: pick.id,
      name: pick.place_name,
      category: (pick.category_name ?? "").split(" > ").slice(1).join(" > "),
      address: pick.road_address_name || pick.address_name,
      lat: Number(pick.y),
      lng: Number(pick.x),
      url: pick.place_url,
    },
  });
}

for (const district of DISTRICTS) {
  const rows = byDistrict[district] ?? [];
  writeFileSync(path.join(CACHE_DIR, `sights-${district}-extra.json`), JSON.stringify(rows, null, 1), "utf8");
}
console.log(`[unmatched] ${found} of ${wanted.size} names found in Seoul; per district: ${DISTRICTS.map((d) => `${d.replace(/구$/, "")} ${(byDistrict[d] ?? []).length}`).join(", ")}`);
