import type {
  FurnitureDefinition,
  FurnitureResolution,
  FurnitureVoxel,
} from "./types";

function voxelStyleKey(voxel: FurnitureVoxel): string {
  return `${voxel.material}:${voxel.color ?? ""}`;
}

function compareText(first: string, second: string): number {
  if (first < second) return -1;
  if (first > second) return 1;
  return 0;
}

function chooseVoxelStyle(voxels: FurnitureVoxel[]): FurnitureVoxel {
  const counts = new Map<string, { count: number; voxel: FurnitureVoxel }>();
  voxels.forEach((voxel) => {
    const key = voxelStyleKey(voxel);
    const current = counts.get(key);
    counts.set(key, {
      count: (current?.count ?? 0) + 1,
      voxel: current?.voxel ?? voxel,
    });
  });
  return [...counts.entries()]
    .sort((first, second) => second[1].count - first[1].count || compareText(first[0], second[0]))[0][1]
    .voxel;
}

function expandVoxel(
  voxel: FurnitureVoxel,
  placement: FurnitureDefinition["placement"],
): FurnitureVoxel[] {
  const xOffsets = [0, 1];
  const yOffsets = placement === "wall" ? [0] : [0, 1];
  const zOffsets = placement === "volume" ? [0, 1] : [0];
  return xOffsets.flatMap((xOffset) =>
    yOffsets.flatMap((yOffset) =>
      zOffsets.map((zOffset) => ({
        x: voxel.x * 2 + xOffset,
        y: placement === "wall" ? 0 : voxel.y * 2 + yOffset,
        z: placement === "floor" ? 0 : voxel.z * 2 + zOffset,
        material: voxel.material,
        ...(voxel.color ? { color: voxel.color } : {}),
      })),
    ),
  );
}

function collapseVoxels(
  voxels: FurnitureVoxel[],
  placement: FurnitureDefinition["placement"],
): FurnitureVoxel[] {
  const groups = new Map<string, FurnitureVoxel[]>();
  voxels.forEach((voxel) => {
    const x = Math.floor(voxel.x / 2);
    const y = placement === "wall" ? 0 : Math.floor(voxel.y / 2);
    const z = placement === "floor" ? 0 : Math.floor(voxel.z / 2);
    const key = `${x}:${y}:${z}`;
    groups.set(key, [...(groups.get(key) ?? []), voxel]);
  });
  return [...groups.entries()].map(([key, grouped]) => {
    const [x, y, z] = key.split(":").map(Number);
    const style = chooseVoxelStyle(grouped);
    return {
      x,
      y,
      z,
      material: style.material,
      ...(style.color ? { color: style.color } : {}),
    };
  });
}

export function convertFurnitureResolution(
  furniture: FurnitureDefinition,
  resolution: FurnitureResolution,
): FurnitureDefinition {
  if (furniture.resolution === resolution) {
    return {
      ...furniture,
      grid: { ...furniture.grid },
      voxels: furniture.voxels.map((voxel) => ({ ...voxel })),
      provenance: { ...furniture.provenance },
    };
  }

  const expanding = resolution > furniture.resolution;
  const scaleGrid = (value: number, active: boolean): number => {
    if (!active) return value;
    return expanding ? value * 2 : Math.ceil(value / 2);
  };

  return {
    ...furniture,
    resolution,
    grid: {
      width: scaleGrid(furniture.grid.width, true),
      depth: scaleGrid(furniture.grid.depth, furniture.placement !== "wall"),
      height: scaleGrid(furniture.grid.height, furniture.placement !== "floor"),
    },
    voxels: expanding
      ? furniture.voxels.flatMap((voxel) => expandVoxel(voxel, furniture.placement))
      : collapseVoxels(furniture.voxels, furniture.placement),
  };
}
