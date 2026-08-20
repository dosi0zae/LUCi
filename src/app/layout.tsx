import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Chain | 하루를 잇는 여행 경험",
  description:
    "장소 하나가 아니라, 하루의 흐름 전체를 발견하고 공유하는 소셜 여행 서비스입니다.",
};

// viewportFit: "cover" is what makes env(safe-area-inset-*) resolve to real values on
// iOS (it's 0 otherwise) — needed so bottom-anchored UI can pad itself clear of the
// home indicator instead of sitting flush against it.
// themeColor tints Safari's own toolbar to match the page background instead of
// leaving it a mismatched default, so the two read as one continuous surface.
export const viewport: Viewport = {
  viewportFit: "cover",
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
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
