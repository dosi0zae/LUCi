// Kakao's official JS "카카오톡 공유하기" SDK — separate product from the Kakao Maps SDK
// loaded in kakao-loader.ts, but both use the same app JavaScript key. Requires the
// "카카오톡 공유" API to be switched on for that app in the Kakao Developers console.
type KakaoShareApi = {
  sendDefault(options: {
    objectType: "feed";
    content: {
      title: string;
      description: string;
      imageUrl: string;
      link: { mobileWebUrl: string; webUrl: string };
    };
    buttons: { title: string; link: { mobileWebUrl: string; webUrl: string } }[];
  }): void;
};

type KakaoSdk = {
  init(appKey: string): void;
  isInitialized(): boolean;
  Share: KakaoShareApi;
};

type KakaoShareWindow = Window & { Kakao?: KakaoSdk };

function getKakaoShareWindow(): KakaoShareWindow {
  return window as KakaoShareWindow;
}

let kakaoShareSdkPromise: Promise<KakaoSdk> | null = null;

function loadKakaoShareSdk(appKey: string): Promise<KakaoSdk> {
  const kakaoWindow = getKakaoShareWindow();

  if (kakaoWindow.Kakao?.isInitialized()) {
    return Promise.resolve(kakaoWindow.Kakao);
  }

  if (kakaoShareSdkPromise) {
    return kakaoShareSdkPromise;
  }

  const promise = new Promise<KakaoSdk>((resolve, reject) => {
    const existingScript = document.getElementById("kakao-share-sdk") as HTMLScriptElement | null;

    // Wrapped in try/catch because this runs from an async script "load" callback, not
    // synchronously inside this executor — a throw here (e.g. kakao.init rejecting a
    // malformed key) would otherwise be uncaught and leave the promise pending forever.
    function initAndResolve() {
      try {
        const kakao = getKakaoShareWindow().Kakao;
        if (!kakao) {
          throw new Error("Kakao SDK failed to attach to window");
        }
        if (!kakao.isInitialized()) {
          kakao.init(appKey);
        }
        resolve(kakao);
      } catch (error) {
        reject(error instanceof Error ? error : new Error("Kakao SDK init failed"));
      }
    }

    if (existingScript) {
      if (getKakaoShareWindow().Kakao) {
        initAndResolve();
      } else {
        existingScript.addEventListener("load", initAndResolve);
        existingScript.addEventListener("error", () => reject(new Error("Kakao Share SDK load failed")));
      }
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = "kakao-share-sdk";
    script.src = "https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
    script.onload = initAndResolve;
    script.onerror = () => reject(new Error("Kakao Share SDK load failed"));
    document.head.appendChild(script);
  });

  // A failed load/init shouldn't permanently wedge sharing for the rest of the session —
  // let the next call start over instead of replaying the same cached rejection forever.
  promise.catch(() => {
    if (kakaoShareSdkPromise === promise) {
      kakaoShareSdkPromise = null;
    }
  });

  kakaoShareSdkPromise = promise;
  return promise;
}

export async function shareToKakaoTalk(input: {
  appKey: string;
  title: string;
  description: string;
  imageUrl: string;
  link: string;
  buttonLabel: string;
}) {
  const kakao = await loadKakaoShareSdk(input.appKey);

  kakao.Share.sendDefault({
    objectType: "feed",
    content: {
      title: input.title,
      description: input.description,
      imageUrl: input.imageUrl,
      link: { mobileWebUrl: input.link, webUrl: input.link },
    },
    buttons: [
      {
        title: input.buttonLabel,
        link: { mobileWebUrl: input.link, webUrl: input.link },
      },
    ],
  });
}
