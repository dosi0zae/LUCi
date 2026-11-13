// Google Identity Services ("Sign in with Google"), loaded on demand. The button hands back an ID
// token (a signed JWT) that /api/auth/google checks with Google before the app trusts it.
// Needs NEXT_PUBLIC_GOOGLE_CLIENT_ID (a Web OAuth client whose "Authorized JavaScript origins"
// list every address the app is served from).

export type GoogleAccount = {
  sub: string;
  name: string;
  email: string;
  picture: string;
};

type GoogleCredentialResponse = { credential?: string };

type GoogleIdApi = {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    ux_mode?: "popup";
    auto_select?: boolean;
  }): void;
  renderButton(
    parent: HTMLElement,
    options: {
      theme?: "outline" | "filled_blue" | "filled_black";
      size?: "large" | "medium" | "small";
      shape?: "pill" | "rectangular";
      text?: "signin_with" | "continue_with" | "signin";
      logo_alignment?: "left" | "center";
      width?: number;
      locale?: string;
    },
  ): void;
  disableAutoSelect(): void;
};

type GoogleWindow = Window & { google?: { accounts: { id: GoogleIdApi } } };

export const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";

const SCRIPT_SRC = "https://accounts.google.com/gsi/client";
let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if ((window as GoogleWindow).google?.accounts?.id) {
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

// Draws Google's own button inside `parent` and calls `onCredential` with the ID token once the
// person has chosen an account. Resolves when the button is on screen.
export async function renderGoogleSignInButton(
  parent: HTMLElement,
  options: { locale: string; width: number; onCredential: (credential: string) => void },
): Promise<void> {
  await loadScript();
  const api = (window as GoogleWindow).google?.accounts.id;
  if (!api || !GOOGLE_CLIENT_ID) {
    return;
  }
  api.initialize({
    client_id: GOOGLE_CLIENT_ID,
    callback: (response) => {
      if (response.credential) {
        options.onCredential(response.credential);
      }
    },
    ux_mode: "popup",
  });
  parent.replaceChildren();
  api.renderButton(parent, {
    theme: "outline",
    size: "large",
    shape: "pill",
    text: "continue_with",
    logo_alignment: "left",
    width: options.width,
    locale: options.locale,
  });
}

// Stops Google from silently signing the same person back in after they chose to sign out.
export function disableGoogleAutoSelect() {
  (window as GoogleWindow).google?.accounts.id.disableAutoSelect();
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
