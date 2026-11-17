import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { ensureDiningLoadedForIds } from "@/features/mobile/dining-store";
import { dictionaries, SUPPORTED_LOCALES, type Locale } from "@/features/mobile/i18n/translations";
import { getPlacesByIds, getTotalMinutes, localizePlace, type MobilePlace } from "@/features/mobile/mobile-data";

// The picture a chat app or social site shows under a shared course link (Open Graph image). It is drawn
// here, on the server, from the place ids and title in the link itself, because there is no stored copy of a
// shared course anywhere else. It looks like the in-app "constellation" share card, laid out wide.

const WIDTH = 1200;
const HEIGHT = 630;
const MAP_SIZE = 460;
const MAP_PADDING = 56;
const MAX_STOPS = 5;

// Fonts are fetched once per language from Google Fonts, asking for only the characters on the card (a few
// kilobytes instead of a whole CJK font), and kept for the life of the server instance.
const FONT_FAMILY: Record<Locale, string> = {
  ko: "Noto Sans KR",
  en: "Noto Sans KR",
  ja: "Noto Sans JP",
  zh: "Noto Sans SC",
};

async function loadFont(family: string, text: string): Promise<ArrayBuffer | null> {
  try {
    const css = await (
      await fetch(
        `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@800&text=${encodeURIComponent(text)}`,
        {
          // An old browser name makes Google answer with a plain TrueType file, which the renderer reads.
          headers: { "User-Agent": "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1" },
        },
      )
    ).text();
    const url = /src: url\((.+?)\) format\('(?:opentype|truetype)'\)/.exec(css)?.[1];
    if (!url) {
      return null;
    }
    const response = await fetch(url);
    return response.ok ? await response.arrayBuffer() : null;
  } catch {
    return null;
  }
}

// The horizontal Trip Chain logo, recolored white (the file itself is blue), as an inline image.
async function loadWhiteLogo(origin: string): Promise<string | null> {
  try {
    const response = await fetch(`${origin}/tripchain-logo-horizontal.svg`);
    if (!response.ok) {
      return null;
    }
    const svg = (await response.text()).replace(/fill="#[0-9a-fA-F]{3,6}"/g, 'fill="#ffffff"');
    return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
  } catch {
    return null;
  }
}

function fill(template: string, count: number): string {
  return template.replace("{count}", String(count));
}

function mapPoints(places: MobilePlace[]) {
  const lats = places.map((place) => place.lat);
  const lngs = places.map((place) => place.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const lngCorrection = Math.cos(((minLat + maxLat) / 2) * (Math.PI / 180));
  const latRange = maxLat - minLat || 0.0005;
  const lngRange = (maxLng - minLng) * lngCorrection || 0.0005;
  const available = MAP_SIZE - MAP_PADDING * 2;
  const scale = Math.min(available / lngRange, available / latRange);
  const contentWidth = lngRange * scale;
  const contentHeight = latRange * scale;
  const offsetX = MAP_PADDING + (available - contentWidth) / 2;
  const offsetY = MAP_PADDING + (available - contentHeight) / 2;

  return places.map((place) => ({
    x: offsetX + (place.lng - minLng) * lngCorrection * scale,
    y: offsetY + contentHeight - (place.lat - minLat) * scale,
  }));
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const langParam = params.get("lang") ?? "ko";
  const locale: Locale = (SUPPORTED_LOCALES as string[]).includes(langParam) ? (langParam as Locale) : "ko";
  const t = dictionaries[locale];

  const ids = (params.get("course") ?? "").split(",").filter(Boolean).slice(0, 12);
  await ensureDiningLoadedForIds(ids);
  const places = getPlacesByIds(ids);
  const localized = places.map((place) => localizePlace(place, locale));
  // Without a course this is the plain site card: the title and sub line come straight from the link.
  const isCourse = places.length >= 2;
  const title = (params.get("title") ?? "").slice(0, 80) || (isCourse ? t.sharedCourseFallbackTitle : "Trip Chain");
  const summary = isCourse
    ? `${fill(t.placesCount, places.length)} · ${fill(t.minutesCount, getTotalMinutes(places))}`
    : (params.get("sub") ?? "").slice(0, 60);
  const stopNames = localized.slice(0, MAX_STOPS).map((place) => place.name);
  const more = localized.length - stopNames.length;

  // A site card has no real course to draw, so it shows a decorative route in the same style.
  const points = isCourse
    ? mapPoints(places)
    : [
        { x: 90, y: 360 },
        { x: 190, y: 250 },
        { x: 290, y: 300 },
        { x: 360, y: 170 },
        { x: 220, y: 110 },
      ];
  const fontText = `${title}${summary}${stopNames.join("")}…${more > 0 ? `+${more}` : ""}0123456789TRIPCHAIN.`;
  const [font, logo] = await Promise.all([loadFont(FONT_FAMILY[locale], fontText), loadWhiteLogo(request.nextUrl.origin)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          backgroundColor: "#0b1220",
          backgroundImage:
            "radial-gradient(circle at 18% 12%, rgba(79,141,247,0.55) 0%, rgba(21,33,58,0) 55%), radial-gradient(circle at 88% 92%, rgba(183,232,107,0.38) 0%, rgba(11,18,32,0) 50%)",
          color: "#ffffff",
          fontFamily: font ? "Noto" : "sans-serif",
          fontWeight: 800,
          padding: "64px 72px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", flex: 1, paddingRight: 40, justifyContent: "space-between" }}>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img alt="" height={40} src={logo} style={{ opacity: 0.5 }} width={140} />
            ) : (
              <div style={{ display: "flex", fontSize: 24, letterSpacing: 8, color: "rgba(255,255,255,0.45)" }}>TRIP CHAIN</div>
            )}
            <div
              style={{
                display: "flex",
                marginTop: 24,
                fontSize: title.length > 18 ? 48 : 58,
                lineHeight: 1.2,
                maxHeight: title.length > 18 ? 116 : 140,
                overflow: "hidden",
                wordBreak: "keep-all",
              }}
            >
              {title}
            </div>
            {summary ? (
              <div style={{ display: "flex", marginTop: 16, fontSize: 28, color: "#b7e86b" }}>{summary}</div>
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
            {stopNames.map((name, index) => (
              <div key={index} style={{ display: "flex", alignItems: "center", marginTop: index === 0 ? 0 : 8, fontSize: 24, color: "rgba(255,255,255,0.82)" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: "#b7e86b",
                    color: "#0b1220",
                    fontSize: 20,
                    marginRight: 16,
                  }}
                >
                  {index + 1}
                </div>
                <div style={{ display: "block", maxWidth: 480, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{name}</div>
              </div>
            ))}
            {more > 0 ? (
              <div style={{ display: "flex", marginTop: 10, fontSize: 24, color: "rgba(255,255,255,0.5)", paddingLeft: 50 }}>{`+${more}`}</div>
            ) : null}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            position: "relative",
            width: MAP_SIZE,
            height: MAP_SIZE,
            alignSelf: "center",
            borderRadius: 40,
            backgroundColor: "rgba(255,255,255,0.07)",
            border: "2px solid rgba(255,255,255,0.18)",
          }}
        >
          {points.length >= 2 ? (
            <>
              <svg width={MAP_SIZE} height={MAP_SIZE} viewBox={`0 0 ${MAP_SIZE} ${MAP_SIZE}`} style={{ position: "absolute", top: 0, left: 0 }}>
                <polyline
                  fill="none"
                  opacity="0.9"
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                  stroke="#b7e86b"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="6"
                />
                {points.map((point, index) => (
                  <circle cx={point.x} cy={point.y} fill="#b7e86b" key={index} opacity="0.2" r="24" />
                ))}
              </svg>
              {points.map((point, index) => (
                <div
                  key={index}
                  style={{
                    position: "absolute",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    left: point.x - 15,
                    top: point.y - 15,
                    width: 30,
                    height: 30,
                    borderRadius: 15,
                    backgroundColor: "#b7e86b",
                    color: "#0b1220",
                    fontSize: 18,
                  }}
                >
                  {index + 1}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </div>
    ),
    {
      width: WIDTH,
      height: HEIGHT,
      fonts: font ? [{ name: "Noto", data: font, weight: 800, style: "normal" }] : undefined,
      headers: { "Cache-Control": "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400" },
    },
  );
}
