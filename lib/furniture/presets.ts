import type {
  FurnitureDefinition,
  FurnitureMaterialId,
  FurnitureVoxel,
} from "./types";

export const FURNITURE_MATERIALS: Record<
  FurnitureMaterialId,
  { name: string; color: string }
> = {
  wood: { name: "참나무", color: "#8c6652" },
  woodDark: { name: "짙은 목재", color: "#523b32" },
  sage: { name: "세이지 천", color: "#8da18d" },
  cream: { name: "크림 도기", color: "#e8e2d5" },
  rose: { name: "말린 장미", color: "#c38f87" },
  metal: { name: "무광 금속", color: "#7f817c" },
};

const GRID = { width: 10, depth: 10, height: 8 };

function addBox(
  voxels: FurnitureVoxel[],
  from: [number, number, number],
  size: [number, number, number],
  material: FurnitureMaterialId,
): void {
  for (let z = from[2]; z < from[2] + size[2]; z += 1) {
    for (let y = from[1]; y < from[1] + size[1]; y += 1) {
      for (let x = from[0]; x < from[0] + size[0]; x += 1) {
        voxels.push({ x, y, z, material });
      }
    }
  }
}

function makeDefinition(
  name: string,
  voxels: FurnitureVoxel[],
): FurnitureDefinition {
  const uniqueVoxels = new Map<string, FurnitureVoxel>();
  voxels.forEach((voxel) => {
    uniqueVoxels.set(`${voxel.x}:${voxel.y}:${voxel.z}`, voxel);
  });

  return {
    schemaVersion: 1,
    rendererVersion: 1,
    name,
    grid: { ...GRID },
    voxels: [...uniqueVoxels.values()],
    provenance: {
      generatedImageModel: false,
      license: "all-rights-reserved",
    },
  };
}

export function makeStoolPreset(): FurnitureDefinition {
  const voxels: FurnitureVoxel[] = [];
  [[2, 2], [6, 2], [2, 6], [6, 6]].forEach(([x, y]) => {
    addBox(voxels, [x, y, 0], [1, 1, 3], "woodDark");
  });
  addBox(voxels, [2, 2, 3], [5, 5, 1], "wood");
  addBox(voxels, [2, 2, 4], [5, 5, 1], "sage");
  return makeDefinition("세이지 쿠션 스툴", voxels);
}

export function makeShelfPreset(): FurnitureDefinition {
  const voxels: FurnitureVoxel[] = [];
  addBox(voxels, [2, 3, 0], [1, 4, 7], "woodDark");
  addBox(voxels, [7, 3, 0], [1, 4, 7], "woodDark");
  [0, 3, 6].forEach((z) => {
    addBox(voxels, [2, 3, z], [6, 4, 1], "wood");
  });
  addBox(voxels, [3, 4, 1], [1, 2, 2], "rose");
  addBox(voxels, [4, 4, 1], [1, 2, 2], "cream");
  addBox(voxels, [5, 4, 4], [1, 2, 2], "sage");
  addBox(voxels, [6, 4, 4], [1, 2, 2], "cream");
  return makeDefinition("낮은 책장", voxels);
}

export function makeEmptyPreset(): FurnitureDefinition {
  return makeDefinition("새 가구", []);
}

export const FURNITURE_PRESETS = [
  { id: "stool", name: "쿠션 스툴", create: makeStoolPreset },
  { id: "shelf", name: "낮은 책장", create: makeShelfPreset },
  { id: "empty", name: "빈 조립판", create: makeEmptyPreset },
] as const;
