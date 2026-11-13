import { NextRequest, NextResponse } from "next/server";

// Checks a Google ID token (the "credential" the Sign in with Google button returns) and answers
// with the account's public profile. Google's tokeninfo endpoint does the signature and expiry
// check; this route adds the checks only the app can make: the token must have been issued for
// THIS app's client id, by Google, to an account with a verified email.
//
// No session is created here: the app keeps everything on the device for now, so the profile is
// stored client-side. When a database arrives, issue a signed httpOnly session cookie from here.

const TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo";
const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

type TokenInfo = {
  aud?: string;
  iss?: string;
  exp?: string;
  sub?: string;
  email?: string;
  email_verified?: string | boolean;
  name?: string;
  given_name?: string;
  picture?: string;
};

export async function POST(request: NextRequest) {
  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "google_sign_in_not_configured" }, { status: 503 });
  }

  let credential = "";
  try {
    const body = await request.json();
    credential = typeof body?.credential === "string" ? body.credential : "";
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }
  // A Google ID token is a JWT of a few hundred bytes to ~2 KB; anything else is not one.
  if (credential.length < 20 || credential.length > 4096) {
    return NextResponse.json({ error: "invalid_credential" }, { status: 400 });
  }

  let info: TokenInfo;
  try {
    const response = await fetch(`${TOKENINFO_URL}?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(6000),
      cache: "no-store",
    });
    if (!response.ok) {
      return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
    }
    info = (await response.json()) as TokenInfo;
  } catch {
    return NextResponse.json({ error: "verification_unavailable" }, { status: 502 });
  }

  const emailVerified = info.email_verified === true || info.email_verified === "true";
  const notExpired = Number(info.exp) * 1000 > Date.now();
  if (
    info.aud !== clientId ||
    !info.iss ||
    !GOOGLE_ISSUERS.has(info.iss) ||
    !notExpired ||
    !info.sub ||
    !info.email ||
    !emailVerified
  ) {
    return NextResponse.json({ error: "invalid_credential" }, { status: 401 });
  }

  return NextResponse.json({
    account: {
      sub: info.sub,
      name: info.name || info.given_name || info.email.split("@")[0],
      email: info.email,
      picture: info.picture ?? "",
    },
  });
}
