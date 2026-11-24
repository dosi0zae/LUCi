import type { Metadata, Viewport } from "next";
import "./globals.css";

// The address link previews are built against (the picture URL in them must be absolute).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://trip-chain.com";
const SITE_DESCRIPTION = "장소 하나가 아니라, 하루의 흐름 전체를 발견하고 공유하는 소셜 여행 서비스입니다.";
const SITE_CARD = `/og?${new URLSearchParams({ title: "Trip Chain", sub: "하루를 잇는 여행 경험" }).toString()}`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Trip Chain | 하루를 잇는 여행 경험",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Trip Chain",
    title: "Trip Chain | 하루를 잇는 여행 경험",
    description: SITE_DESCRIPTION,
    images: [{ url: SITE_CARD, width: 1200, height: 630, alt: "Trip Chain" }],
  },
  twitter: { card: "summary_large_image", images: [SITE_CARD] },
  // Only takes effect once launched from a home-screen icon (standalone display mode)
  // — a regular Safari tab always owns the status bar area itself, no web API reaches
  // it. "black-translucent" lets the app's own background show through there instead
  // of a solid system-drawn bar.
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Trip Chain",
  },
};

// viewportFit: "cover" is what makes env(safe-area-inset-*) resolve to real values on
// iOS (it's 0 otherwise) — needed so bottom-anchored UI can pad itself clear of the
// home indicator instead of sitting flush against it.
// themeColor tints Safari's own toolbar to match the page background instead of
// leaving it a mismatched default, so the two read as one continuous surface.
// maximumScale 1 stops the page from ever changing scale by itself (focus auto-zoom, double-tap).
export const viewport: Viewport = {
  viewportFit: "cover",
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7fafc" },
    { media: "(prefers-color-scheme: dark)", color: "#07111f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: the script below puts data-theme on <html> before React takes over.
    <html lang="ko" className="h-full antialiased" suppressHydrationWarning>
      <head>
        {/* The chosen screen mode (see features/mobile/theme.ts) is put on <html> before the first paint, so there is no flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var m=localStorage.getItem("tripchain:theme");if(m==="light"||m==="dark")document.documentElement.setAttribute("data-theme",m)}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
