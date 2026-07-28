export type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

export type KakaoMap = {
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
};

export type KakaoCustomOverlay = {
  setMap(map: KakaoMap | null): void;
};

export type KakaoMapsApi = {
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Map: new (
    container: HTMLElement,
    options: { center: KakaoLatLng; draggable?: boolean; level: number; scrollwheel?: boolean },
  ) => KakaoMap;
  CustomOverlay: new (options: {
    clickable?: boolean;
    content: HTMLElement | string;
    position: KakaoLatLng;
    xAnchor?: number;
    yAnchor?: number;
    zIndex?: number;
  }) => KakaoCustomOverlay;
  load(callback: () => void): void;
};

type KakaoWindow = Window & {
  kakao?: {
    maps: KakaoMapsApi;
  };
};

function getKakaoWindow(): KakaoWindow {
  return window as KakaoWindow;
}

let kakaoSdkPromise: Promise<KakaoMapsApi> | null = null;

export function loadKakaoMaps(appKey: string) {
  const kakaoWindow = getKakaoWindow();

  if (kakaoWindow.kakao?.maps) {
    return new Promise<KakaoMapsApi>((resolve) => {
      kakaoWindow.kakao?.maps.load(() => resolve(kakaoWindow.kakao!.maps));
    });
  }

  if (kakaoSdkPromise) {
    return kakaoSdkPromise;
  }

  kakaoSdkPromise = new Promise<KakaoMapsApi>((resolve, reject) => {
    const existingScript = document.getElementById("kakao-map-sdk");

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        kakaoWindow.kakao?.maps.load(() => resolve(kakaoWindow.kakao!.maps));
      });
      existingScript.addEventListener("error", () => reject(new Error("Kakao Map SDK load failed")));
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.id = "kakao-map-sdk";
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${appKey}&autoload=false`;
    script.onload = () => {
      kakaoWindow.kakao?.maps.load(() => resolve(kakaoWindow.kakao!.maps));
    };
    script.onerror = () => reject(new Error("Kakao Map SDK load failed"));
    document.head.appendChild(script);
  });

  return kakaoSdkPromise;
}
