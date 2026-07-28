import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Character Room Builder — 코드로 짓는 캐릭터의 방",
  description:
    "생성형 이미지 없이 절차적 Canvas 코드로 만드는 커뮤니티 캐릭터 방 꾸미기 도구.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
