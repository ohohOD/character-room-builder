import type { FurnitureDefinition } from "../furniture/types";

export type PaletteId = "sage" | "rose" | "night";

export type RoomObjectType =
  | "bed"
  | "chair"
  | "desk"
  | "frame"
  | "lamp"
  | "letter"
  | "plant"
  | "rug"
  | "shelf"
  | "window";

interface RoomObjectBase {
  id: string;
  x: number;
  y: number;
  z?: number;
  parentId?: string;
  variant?: string;
}

export interface BuiltInRoomObject extends RoomObjectBase {
  type: RoomObjectType;
}

export interface PlacedFurnitureObject extends RoomObjectBase {
  type: "furniture";
  definition: FurnitureDefinition;
  rotation: 0 | 1 | 2 | 3;
  wall?: "back" | "left";
}

export type RoomObject = BuiltInRoomObject | PlacedFurnitureObject;

export interface RoomDocument {
  schemaVersion: 1;
  rendererVersion: 1;
  id: string;
  seed: string;
  palette: PaletteId;
  layout: "corner";
  objects: RoomObject[];
  provenance: {
    generatedImageModel: false;
    stylePack: string;
    stylePackVersion: string;
    license: "MIT";
  };
}
