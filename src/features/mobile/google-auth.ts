// Sign in with Google through Google's account-chooser popup (the OAuth token client), loaded on
// demand. The app draws its own button; tapping it opens Google's popup, and what comes back is an
// access token that /api/auth/google checks with Google before the app trusts it.
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (a Web OAuth client whose "Authorized JavaScript origins"
// list every address the app is served from).

export type GoogleAccount = {
  sub: string;
  name: string;
  email: string;
  picture: string;
};

type TokenResponse = { access_token?: string; error?: string };
type TokenClient = { requestAccessToken(overrides?: { prompt?: string }): void };
type GoogleOauth2Api = {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { type: string }) => void;
  }): TokenClient;
};

type GoogleWindow = Window & { google?: { accounts: { oauth2: GoogleOauth2Api } } };

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise: Promise<void> | null = null;

// Loads Google's script. Call it ahead of time (when the sign-in screen appears): the popup has to be
// opened straight from the tap, so the script must already be there when the button is pressed.
export function loadGoogleScript(): Promise<void> {
  if ((window as GoogleWindow).google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => {
        // Let the next attempt (another visit to the sign-in screen) try the download again.
        scriptPromise = null;
        script.remove();
        reject(new Error("Google sign-in script failed to load"));
      };
      document.head.appendChild(script);
    });
  }
  return scriptPromise;
}

// Opens Google's account chooser and resolves with an access token for name, email and photo.
// Must be called synchronously from a tap. Rejects with Error("popup_closed") when the person
// simply closes the popup, which is not an error worth showing.
export function requestGoogleAccessToken(): Promise<string> {
  return new Promise((resolve, reject) => {
    const api = (window as GoogleWindow).google?.accounts.oauth2;
    if (!api || !GOOGLE_CLIENT_ID) {
      reject(new Error("not_ready"));
      return;
    }
    const client = api.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: "openid email profile",
      callback: (response) =>
        response.access_token ? resolve(response.access_token) : reject(new Error(response.error ?? "no_token")),
      error_callback: (error) => reject(new Error(error.type === "popup_closed" ? "popup_closed" : error.type)),
    });
    client.requestAccessToken({ prompt: "select_account" });
  });
}

export function isGoogleAccount(value: unknown): value is GoogleAccount {
  if (!value || typeof value !== "object") {
    return false;
  }
  const account = value as Record<string, unknown>;
  return (
    typeof account.sub === "string" &&
    typeof account.name === "string" &&
    typeof account.email === "string" &&
    typeof account.picture === "string"
  );
}
