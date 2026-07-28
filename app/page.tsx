import type { Metadata } from "next";
import { FurnitureFoundry } from "./furniture/furniture-foundry";

export const metadata: Metadata = {
  title: "Furniture Foundry — 로컬 아이소메트릭 복셀 공방",
  description:
    "가구를 복셀로 만들고 FURN1, 투명 PNG, WebP와 4방향 스프라이트 시트로 내보내는 로컬 Canvas 제작 도구.",
};

export default function Home() {
  return <FurnitureFoundry />;
}
