import { NextRequest, NextResponse } from "next/server";

// Checks a Google access token (what the sign-in popup returns) and answers with the account's public
// profile. Two checks, both made with Google: tokeninfo says the token is real, not expired, and was
// issued to THIS app's client id (so a token minted for some other app is refused); userinfo then
// gives the name, photo and verified email.
//
// No session is created here: the app keeps everything on the device for now, so the profile is
// stored client-side. When a database arrives, issue a signed httpOnly session cookie from here.

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo";

type TokenInfo = { aud?: string; azp?: string; expires_in?: string | number };
type UserInfo = {
  sub?: string;
  name?: string;
  given_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean | string;
};

export async function POST(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "google_sign_in_not_configured" }, { status: 503 });
  }

  let accessToken = "";
  try {
    const body = await request.json();
    accessToken = typeof body?.accessToken === "string" ? body.accessToken : "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // A Google access token is a short opaque string (about 200 characters); anything else is not one.
  if (accessToken.length < 20 || accessToken.length > 2048) {
    return NextResponse.json({ error: "invalid_credential" }, { status: 400 });
  }

  let info: TokenInfo;
  let user: UserInfo;
  try {
    const infoResponse = await fetch(`${TOKENINFO_URL}?access_token=${encodeURIComponent(accessToken)}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!infoResponse.ok) {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }
    info = (await infoResponse.json()) as TokenInfo;
    if (info.aud !== clientId && info.azp !== clientId) {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }
    if (!(Number(info.expires_in) > 0)) {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }

    const userResponse = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!userResponse.ok) {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }
    user = (await userResponse.json()) as UserInfo;
  } catch {
    return NextResponse.json({ error: "verification_unavailable" }, { status: 502 });
  }

  const emailVerified = user.email_verified === true || user.email_verified === "true";
  if (!user.sub || !user.email || !emailVerified) {
    return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
  }

  return NextResponse.json({
    account: {
      sub: user.sub,
      name: user.name || user.given_name || user.email.split("@")[0],
      email: user.email,
      picture: user.picture ?? "",
    },
  });
}
