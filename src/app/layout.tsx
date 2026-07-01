import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Trip Chain | 하루를 잇는 여행 경험",
  description:
    "장소 하나가 아니라, 하루의 흐름 전체를 발견하고 공유하는 소셜 여행 서비스입니다.",
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
