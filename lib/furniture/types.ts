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

export interface FurnitureVoxel {
  x: number;
  y: number;
  z: number;
  material: FurnitureMaterialId;
  color?: string;
}

export interface FurnitureDefinition {
  schemaVersion: 1;
  rendererVersion: 1;
  placement: FurniturePlacement;
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
