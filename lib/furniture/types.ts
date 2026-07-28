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

export interface FurnitureVoxel {
  x: number;
  y: number;
  z: number;
  material: FurnitureMaterialId;
}

export interface FurnitureDefinition {
  schemaVersion: 1;
  rendererVersion: 1;
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
