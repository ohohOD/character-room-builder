import type { PlacedFurnitureObject } from "../room/types";
import type { FurnitureDefinition, FurnitureVoxel } from "./types";

export const FURNITURE_ROOM_CELL_SIZE = 0.18;

export interface FurnitureRenderCell extends FurnitureVoxel {
  localX: number;
  localY: number;
  localZ: number;
}

export interface FurnitureRenderGeometry {
  cells: FurnitureRenderCell[];
  cellSize: number;
  width: number;
  depth: number;
  height: number;
}

function voxelBounds(voxels: FurnitureVoxel[]): {
  minX: number;
  minY: number;
  minZ: number;
  width: number;
  depth: number;
  height: number;
} {
  if (voxels.length === 0) {
    return { minX: 0, minY: 0, minZ: 0, width: 0, depth: 0, height: 0 };
  }
  const xs = voxels.map((voxel) => voxel.x);
  const ys = voxels.map((voxel) => voxel.y);
  const zs = voxels.map((voxel) => voxel.z);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const minZ = Math.min(...zs);
  return {
    minX,
    minY,
    minZ,
    width: Math.max(...xs) - minX + 1,
    depth: Math.max(...ys) - minY + 1,
    height: Math.max(...zs) - minZ + 1,
  };
}

export function getFurnitureRenderGeometry(
  definition: FurnitureDefinition,
  rotation: PlacedFurnitureObject["rotation"] = 0,
): FurnitureRenderGeometry {
  const bounds = voxelBounds(definition.voxels);
  const cellSize = FURNITURE_ROOM_CELL_SIZE / definition.resolution;
  const rotated = definition.placement === "wall" ? 0 : rotation;
  const cells = definition.voxels.map((voxel) => {
    const x = voxel.x - bounds.minX;
    const y = voxel.y - bounds.minY;
    const z = voxel.z - bounds.minZ;
    let localX = x;
    let localY = y;
    if (rotated === 1) {
      localX = y;
      localY = bounds.width - 1 - x;
    } else if (rotated === 2) {
      localX = bounds.width - 1 - x;
      localY = bounds.depth - 1 - y;
    } else if (rotated === 3) {
      localX = bounds.depth - 1 - y;
      localY = x;
    }
    return {
      ...voxel,
      localX,
      localY: definition.placement === "wall" ? 0 : localY,
      localZ: definition.placement === "floor" ? 0 : z,
    };
  });
  const swapsAxes = rotated === 1 || rotated === 3;
  return {
    cells,
    cellSize,
    width: (swapsAxes ? bounds.depth : bounds.width) * cellSize,
    depth: (swapsAxes ? bounds.width : bounds.depth) * cellSize,
    height: bounds.height * cellSize,
  };
}

export function getPlacedFurnitureFootprint(
  object: PlacedFurnitureObject,
): { width: number; depth: number } {
  const geometry = getFurnitureRenderGeometry(object.definition, object.rotation);
  if (object.definition.placement === "wall") {
    return { width: 0, depth: 0 };
  }
  return { width: geometry.width, depth: geometry.depth };
}
