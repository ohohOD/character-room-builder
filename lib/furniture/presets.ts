import type {
  FurnitureDefinition,
  FurnitureMaterialId,
  FurniturePlacement,
  FurnitureVoxel,
} from "./types";

export const FURNITURE_MATERIALS: Record<
  FurnitureMaterialId,
  { name: string; color: string }
> = {
  wood: { name: "참나무", color: "#8c6652" },
  woodDark: { name: "짙은 목재", color: "#523b32" },
  sage: { name: "세이지 천", color: "#8da18d" },
  cream: { name: "크림 표면", color: "#e8e2d5" },
  rose: { name: "말린 장미", color: "#c38f87" },
  metal: { name: "무광 금속", color: "#7f817c" },
};

const VOLUME_GRID = { width: 10, depth: 10, height: 8 };
const FLOOR_GRID = { width: 10, depth: 10, height: 1 };
const WALL_GRID = { width: 10, depth: 1, height: 8 };

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
  placement: FurniturePlacement,
  grid: FurnitureDefinition["grid"],
  voxels: FurnitureVoxel[],
): FurnitureDefinition {
  const uniqueVoxels = new Map<string, FurnitureVoxel>();
  voxels.forEach((voxel) => {
    uniqueVoxels.set(`${voxel.x}:${voxel.y}:${voxel.z}`, voxel);
  });

  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement,
    name,
    grid: { ...grid },
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
  return makeDefinition("세이지 쿠션 스툴", "volume", VOLUME_GRID, voxels);
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
  return makeDefinition("낮은 책장", "volume", VOLUME_GRID, voxels);
}

export function makeRugPreset(): FurnitureDefinition {
  const voxels: FurnitureVoxel[] = [];
  for (let y = 1; y < 9; y += 1) {
    for (let x = 1; x < 9; x += 1) {
      const dx = (x - 4.5) / 3.8;
      const dy = (y - 4.5) / 3.8;
      const distance = dx * dx + dy * dy;
      if (distance > 1) continue;
      const material = distance > 0.58
        ? "woodDark"
        : (x + y) % 4 === 0
          ? "cream"
          : "rose";
      voxels.push({ x, y, z: 0, material });
    }
  }
  return makeDefinition("말린 장미 러그", "floor", FLOOR_GRID, voxels);
}

export function makeWallFramePreset(): FurnitureDefinition {
  const voxels: FurnitureVoxel[] = [];
  for (let z = 1; z < 7; z += 1) {
    for (let x = 2; x < 8; x += 1) {
      const isFrame = x === 2 || x === 7 || z === 1 || z === 6;
      const isRoseCenter = x >= 4 && x <= 5 && z >= 3 && z <= 4;
      voxels.push({
        x,
        y: 0,
        z,
        material: isFrame ? "woodDark" : isRoseCenter ? "rose" : "cream",
      });
    }
  }
  return makeDefinition("장미 압화 액자", "wall", WALL_GRID, voxels);
}

export function makeEmptyVolumePreset(): FurnitureDefinition {
  return makeDefinition("새 입체 가구", "volume", VOLUME_GRID, []);
}

export function makeEmptyFloorPreset(): FurnitureDefinition {
  return makeDefinition("새 바닥 소품", "floor", FLOOR_GRID, []);
}

export function makeEmptyWallPreset(): FurnitureDefinition {
  return makeDefinition("새 벽 소품", "wall", WALL_GRID, []);
}

export const DEFAULT_PRESET_BY_PLACEMENT: Record<
  FurniturePlacement,
  () => FurnitureDefinition
> = {
  volume: makeStoolPreset,
  floor: makeRugPreset,
  wall: makeWallFramePreset,
};

export const FURNITURE_PRESETS = [
  { id: "stool", placement: "volume", name: "쿠션 스툴", create: makeStoolPreset },
  { id: "shelf", placement: "volume", name: "낮은 책장", create: makeShelfPreset },
  { id: "empty-volume", placement: "volume", name: "빈 입체판", create: makeEmptyVolumePreset },
  { id: "rug", placement: "floor", name: "장미 러그", create: makeRugPreset },
  { id: "empty-floor", placement: "floor", name: "빈 바닥판", create: makeEmptyFloorPreset },
  { id: "frame", placement: "wall", name: "압화 액자", create: makeWallFramePreset },
  { id: "empty-wall", placement: "wall", name: "빈 벽판", create: makeEmptyWallPreset },
] as const;
