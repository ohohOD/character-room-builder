import type { PaletteId, RoomDocument } from "./types";

export interface RoomPalette {
  name: string;
  story: string;
  wall: string;
  wallShade: string;
  floor: string;
  floorLine: string;
  wood: string;
  woodDark: string;
  cloth: string;
  clothLight: string;
  accent: string;
  metal: string;
  leaf: string;
  ceramic: string;
  sky: string;
  ink: string;
  light: string;
}

export const PALETTES = {
  sage: {
    name: "정원 세이지",
    story: "오래 말린 잎과 오후의 빛",
    wall: "#EAE4D8",
    wallShade: "#DDD3C4",
    floor: "#C6A77E",
    floorLine: "#A98763",
    wood: "#79543F",
    woodDark: "#513A30",
    cloth: "#7E9278",
    clothLight: "#C9D0BC",
    accent: "#C98578",
    metal: "#927C64",
    leaf: "#557A4F",
    ceramic: "#D9C8B2",
    sky: "#AFC9C7",
    ink: "#3B332E",
    light: "#F7E6B5",
  },
  rose: {
    name: "잉크 로즈",
    story: "편지와 오래된 장미의 방",
    wall: "#EEE2DE",
    wallShade: "#DACCC8",
    floor: "#C9A88F",
    floorLine: "#A9826E",
    wood: "#704C40",
    woodDark: "#4A3531",
    cloth: "#925F69",
    clothLight: "#D9B8B5",
    accent: "#C58B62",
    metal: "#8B7468",
    leaf: "#6C7B5A",
    ceramic: "#E2D2C3",
    sky: "#BFCBD0",
    ink: "#3E3030",
    light: "#F8DDB4",
  },
  night: {
    name: "푸른 밤",
    story: "창밖의 달과 책상 위 한 점의 불",
    wall: "#C9CFD2",
    wallShade: "#AEB7BC",
    floor: "#8A7770",
    floorLine: "#6F5E59",
    wood: "#4A403F",
    woodDark: "#302B2D",
    cloth: "#506B79",
    clothLight: "#92A8B1",
    accent: "#C99E62",
    metal: "#8F8C89",
    leaf: "#49645C",
    ceramic: "#B9B1A8",
    sky: "#263D4B",
    ink: "#292B30",
    light: "#F0C878",
  },
} as const satisfies Record<PaletteId, RoomPalette>;

export function makeSampleRoom(
  seed: string,
  palette: PaletteId,
): RoomDocument {
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    id: "paper-attic",
    seed,
    palette,
    layout: "corner",
    objects: [
      { id: "window-main", type: "window", x: 3.15, y: 0, z: 1.65 },
      { id: "frame-left", type: "frame", x: 0, y: 1.15, z: 2.05 },
      { id: "shelf-oak", type: "shelf", x: 0.42, y: 0.28 },
      { id: "rug-woven", type: "rug", x: 2.15, y: 2.15 },
      { id: "bed-day", type: "bed", x: 0.7, y: 3.55 },
      { id: "desk-writing", type: "desk", x: 4.55, y: 0.72 },
      { id: "chair-writing", type: "chair", x: 5.42, y: 1.88 },
      { id: "lamp-desk", type: "lamp", x: 6.12, y: 0.98, z: 1.28 },
      { id: "letter-desk", type: "letter", x: 5.08, y: 1.02, z: 1.27 },
      { id: "plant-floor", type: "plant", x: 6.72, y: 4.55 },
    ],
    provenance: {
      generatedImageModel: false,
      stylePack: "paper-attic",
      stylePackVersion: "0.2.0",
      license: "MIT",
    },
  };
}
