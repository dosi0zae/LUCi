export type KakaoLatLng = {
  getLat(): number;
  getLng(): number;
};

export type KakaoMap = {
  addControl(control: KakaoControl, position: number): void;
  getLevel(): number;
  setBounds(bounds: KakaoLatLngBounds, padding?: number): void;
  setCenter(latlng: KakaoLatLng): void;
  setLevel(level: number): void;
  setZoomable(zoomable: boolean): void;
};

export type KakaoLatLngBounds = {
  extend(latlng: KakaoLatLng): void;
};

export type KakaoCustomOverlay = {
  setMap(map: KakaoMap | null): void;
};

export type KakaoPolyline = {
  setMap(map: KakaoMap | null): void;
};

export type KakaoControl = object;

export type KakaoMapsApi = {
  ControlPosition: Record<"BOTTOM" | "LEFT" | "RIGHT" | "TOP" | "TOPLEFT" | "TOPRIGHT", number>;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
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
  Polyline: new (options: {
    endArrow?: boolean;
    path: KakaoLatLng[];
    strokeColor?: string;
    strokeOpacity?: number;
    strokeStyle?: string;
    strokeWeight?: number;
  }) => KakaoPolyline;
  ZoomControl: new () => KakaoControl;
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
