import type { Metadata } from "next";
import { FurnitureFoundry } from "./furniture-foundry";

export const metadata: Metadata = {
  title: "Furniture Foundry — Character Room Builder",
  description:
    "아이소메트릭 조립판에 직접 가구를 만들고 FURN1, 투명 PNG, WebP와 스프라이트 시트로 내보내는 로컬 Canvas 공방.",
};

export default function FurniturePage() {
  return <FurnitureFoundry />;
}
