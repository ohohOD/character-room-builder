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

export interface RoomObject {
  id: string;
  type: RoomObjectType;
  x: number;
  y: number;
  z?: number;
  parentId?: string;
  variant?: string;
}

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
