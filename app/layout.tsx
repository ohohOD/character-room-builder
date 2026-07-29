import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "복셀 가구 에디터 — 코드로 만드는 아이소메트릭 가구",
  description:
    "생성형 이미지 없이 복셀 가구를 만들고 편집 데이터와 투명 이미지로 내보내는 로컬 Canvas 공방.",
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
