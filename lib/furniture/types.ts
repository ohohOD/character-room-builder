export type FurnitureMaterialId =
  | "wood"
  | "woodDark"
  | "sage"
  | "cream"
  | "rose"
  | "metal";

export type FurnitureLicense =
  | "all-rights-reserved"
  | "CC-BY-4.0"
  | "CC0-1.0";

export type FurniturePlacement = "volume" | "floor" | "wall";
export type FurnitureResolution = 1 | 2 | 4;

export const MAX_FURNITURE_VOXELS = 9_600;

export interface FurnitureVoxel {
  x: number;
  y: number;
  z: number;
  material: FurnitureMaterialId;
  color?: string;
}

export interface FurnitureCell {
  x: number;
  y: number;
  z: number;
}

export interface FurnitureDefinition {
  schemaVersion: 1;
  rendererVersion: 1;
  placement: FurniturePlacement;
  resolution: FurnitureResolution;
  name: string;
  grid: {
    width: number;
    depth: number;
    height: number;
  };
  voxels: FurnitureVoxel[];
  provenance: {
    generatedImageModel: false;
    license: FurnitureLicense;
    credit?: string;
  };
}
