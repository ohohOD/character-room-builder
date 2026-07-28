import type { Metadata } from "next";
import { FurnitureFoundry } from "./furniture-foundry";

export const metadata: Metadata = {
  title: "Furniture Foundry — Character Room Builder",
  description:
    "아이소메트릭 조립판에 직접 가구를 만들고 FURN1 공유 코드로 나누는 절차적 Canvas 공방.",
};

export default function FurniturePage() {
  return <FurnitureFoundry />;
}
