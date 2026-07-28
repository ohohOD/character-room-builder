import type { Metadata } from "next";
import { CharacterRoomBuilder } from "../character-room-builder";

export const metadata: Metadata = {
  title: "Room Composer — Character Room Builder",
  description:
    "Furniture Foundry에서 만든 FURN1 가구를 아이소메트릭 방에 배치하고 ROOM1 코드로 공유하는 로컬 쇼룸.",
};

export default function RoomPage() {
  return <CharacterRoomBuilder />;
}
