// Turns a place the request names (a station, a neighbourhood, a landmark: "성수역", "연남동", "서울숲") into a point on the
// map with Kakao Local, the same search the map screen uses, so a course is built AROUND that place. Before this the
// only ways to anchor on a place were the guess of the language model (which has to pick a district and does so wrongly:
// "성수동" came back as 송파구, "강남역" as 종로구) and a hand-kept list of 18 places.

const SEOUL_RECT = "126.76,37.41,127.19,37.70";

type KeywordDocument = {
  place_name: string;
  category_group_code: string;
  category_name: string;
  x: string;
  y: string;
};

export type PlaceAnchor = { lat: number; lng: number; name: string };

// A station named in the sentence, for when the language model gave no place: "성수역", "홍대입구역 근처".
export function stationFromPrompt(prompt: string): string | null {
  const match = /([가-힣0-9]{2,12}역)(?![가-힣])/.exec(prompt);
  return match ? match[1] : null;
}

export async function resolvePlaceAnchor(name: string): Promise<PlaceAnchor | null> {
  const key = process.env.KAKAO_REST_API_KEY;
  const query = name.trim().slice(0, 40);
  if (!key || query.length < 2) {
    return null;
  }

  try {
    const params = new URLSearchParams({ query, size: "8", rect: SEOUL_RECT });
    const response = await fetch(`https://dapi.kakao.com/v2/local/search/keyword.json?${params.toString()}`, {
      headers: { Authorization: `KakaoAK ${key}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) {
      return null;
    }
    const documents = ((await response.json()) as { documents?: KeywordDocument[] }).documents ?? [];
    if (documents.length === 0) {
      return null;
    }

    const bare = query.replace(/\s+/g, "");
    const rank = (doc: KeywordDocument) => {
      const docName = doc.place_name.replace(/\s+/g, "");
      let score = 0;
      // A station is what "...역" means; for any other name the place with exactly that name is.
      if (query.endsWith("역") && doc.category_group_code === "SW8") score += 3;
      if (docName === bare) score += 3;
      else if (docName.startsWith(bare)) score += 2;
      else if (docName.includes(bare)) score += 1;
      return score;
    };
    const best = [...documents].sort((a, b) => rank(b) - rank(a))[0];
    const lat = Number(best.y);
    const lng = Number(best.x);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng, name: best.place_name } : null;
  } catch {
    return null;
  }
}
