import { NextRequest, NextResponse } from "next/server";
import type { MapSearchResult } from "@/features/mobile/custom-places";

export const runtime = "nodejs";

// The map screen's search box: a place name or an address, answered by Kakao Local (the same data the Kakao Map
// app searches). Only Seoul is searched, since that is what the app covers. The key stays on the server.
const SEOUL_RECT = "126.76,37.41,127.19,37.70";
const MAX_RESULTS = 8;

type KakaoKeywordDocument = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
};

type KakaoAddressDocument = {
  address_name: string;
  x: string;
  y: string;
  road_address?: { address_name: string; building_name?: string } | null;
};

// `path` is under /v2/local/ (search/keyword.json, geo/coord2address.json, ...).
async function kakaoGet<T>(path: string, params: Record<string, string>, key: string): Promise<T[]> {
  const response = await fetch(`https://dapi.kakao.com/v2/local/${path}?${new URLSearchParams(params).toString()}`, {
    headers: { Authorization: `KakaoAK ${key}` },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) {
    throw new Error(`Kakao ${path} ${response.status}`);
  }
  const data = (await response.json()) as { documents?: T[] };
  return data.documents ?? [];
}

export async function GET(request: NextRequest) {
  const key = process.env.KAKAO_REST_API_KEY;
  if (!key) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }

  const query = (request.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 60);
  if (query.length < 2) {
    return NextResponse.json({ results: [] });
  }

  // A lot is a number address ("합정동 395-1", "독막로 12"): the address search finds those, the keyword
  // search finds names. Both run, names first.
  const looksLikeAddress = /\d/.test(query);

  try {
    const [keyword, address] = await Promise.all([
      kakaoGet<KakaoKeywordDocument>("search/keyword.json", { query, size: String(MAX_RESULTS), rect: SEOUL_RECT }, key).catch(() => []),
      looksLikeAddress ? kakaoGet<KakaoAddressDocument>("search/address.json", { query, size: "4" }, key).catch(() => []) : Promise.resolve([]),
    ]);

    const fromKeyword = keyword.map(
      (doc): MapSearchResult => ({
        id: doc.id,
        name: doc.place_name,
        address: doc.road_address_name || doc.address_name,
        categoryName: doc.category_name,
        categoryGroup: doc.category_group_code,
        lat: Number(doc.y),
        lng: Number(doc.x),
        kind: "place",
      }),
    );
    const fromAddress = address
      // An address outside Seoul is not something this app covers.
      .filter((doc) => /^서울/.test(doc.address_name))
      .map(
        (doc): MapSearchResult => ({
          id: `addr-${Number(doc.y).toFixed(5)}-${Number(doc.x).toFixed(5)}`,
          name: doc.road_address?.building_name || doc.road_address?.address_name || doc.address_name,
          address: doc.road_address?.address_name || doc.address_name,
          categoryName: "",
          categoryGroup: "",
          lat: Number(doc.y),
          lng: Number(doc.x),
          kind: "address",
        }),
      );

    // A number address is about the spot itself, so it leads; a name search leads with the names.
    const results = (looksLikeAddress && fromAddress.length > 0 ? [...fromAddress, ...fromKeyword] : [...fromKeyword, ...fromAddress]).filter(
      (result) => Number.isFinite(result.lat) && Number.isFinite(result.lng),
    );

    return NextResponse.json({ results: results.slice(0, MAX_RESULTS) });
  } catch {
    return NextResponse.json({ error: "search_failed" }, { status: 502 });
  }
}
