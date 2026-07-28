import type {
  FurnitureCell,
  FurnitureDefinition,
  FurnitureMaterialId,
  FurnitureVoxel,
} from "./types.ts";

export interface FurnitureSelection {
  start: FurnitureCell;
  end: FurnitureCell;
}

export interface FurnitureGridLimits {
  width: { min: number; max: number };
  depth: { min: number; max: number };
  height: { min: number; max: number };
}

export interface FurnitureTransformResult {
  furniture: FurnitureDefinition;
  selection: FurnitureSelection;
  changed: boolean;
  blocked: boolean;
}

type PlanePoint = { a: number; b: number };
type PlaneBounds = { minA: number; maxA: number; minB: number; maxB: number };

function voxelKey(voxel: FurnitureCell): string {
  return `${voxel.x}:${voxel.y}:${voxel.z}`;
}

function compareVoxels(first: FurnitureVoxel, second: FurnitureVoxel): number {
  return first.z - second.z || first.y - second.y || first.x - second.x ||
    first.material.localeCompare(second.material) ||
    (first.color ?? "").localeCompare(second.color ?? "");
}

function sortedVoxels(voxels: FurnitureVoxel[]): FurnitureVoxel[] {
  return voxels.map((voxel) => ({ ...voxel })).sort(compareVoxels);
}

function toPlane(
  furniture: FurnitureDefinition,
  cell: FurnitureCell,
): PlanePoint {
  return furniture.placement === "wall"
    ? { a: cell.x, b: cell.z }
    : { a: cell.x, b: cell.y };
}

function fromPlane(
  furniture: FurnitureDefinition,
  point: PlanePoint,
  layer: number,
): FurnitureCell {
  if (furniture.placement === "wall") {
    return { x: point.a, y: 0, z: point.b };
  }
  return {
    x: point.a,
    y: point.b,
    z: furniture.placement === "floor" ? 0 : layer,
  };
}

function planeLayer(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
): number {
  return furniture.placement === "volume" ? selection.start.z : 0;
}

function planeSize(furniture: FurnitureDefinition): PlanePoint {
  return furniture.placement === "wall"
    ? { a: furniture.grid.width, b: furniture.grid.height }
    : { a: furniture.grid.width, b: furniture.grid.depth };
}

function selectionBounds(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
): PlaneBounds {
  const start = toPlane(furniture, selection.start);
  const end = toPlane(furniture, selection.end);
  return {
    minA: Math.min(start.a, end.a),
    maxA: Math.max(start.a, end.a),
    minB: Math.min(start.b, end.b),
    maxB: Math.max(start.b, end.b),
  };
}

function selectionFromBounds(
  furniture: FurnitureDefinition,
  bounds: PlaneBounds,
  layer: number,
): FurnitureSelection {
  return {
    start: fromPlane(furniture, { a: bounds.minA, b: bounds.minB }, layer),
    end: fromPlane(furniture, { a: bounds.maxA, b: bounds.maxB }, layer),
  };
}

function isInsidePlane(furniture: FurnitureDefinition, point: PlanePoint): boolean {
  const size = planeSize(furniture);
  return point.a >= 0 && point.b >= 0 && point.a < size.a && point.b < size.b;
}

function containsCell(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  cell: FurnitureCell,
): boolean {
  const bounds = selectionBounds(furniture, selection);
  const point = toPlane(furniture, cell);
  const sameLayer = furniture.placement !== "volume" ||
    cell.z === planeLayer(furniture, selection);
  return sameLayer && point.a >= bounds.minA && point.a <= bounds.maxA &&
    point.b >= bounds.minB && point.b <= bounds.maxB;
}

export function cloneFurniture(
  furniture: FurnitureDefinition,
): FurnitureDefinition {
  return {
    ...furniture,
    grid: { ...furniture.grid },
    voxels: sortedVoxels(furniture.voxels),
    provenance: { ...furniture.provenance },
  };
}

export function furnitureGridLimits(
  furniture: FurnitureDefinition,
): FurnitureGridLimits {
  return {
    width: { min: 4, max: 16 * furniture.resolution },
    depth: furniture.placement === "wall"
      ? { min: 1, max: 1 }
      : { min: 4, max: 16 * furniture.resolution },
    height: furniture.placement === "floor"
      ? { min: 1, max: 1 }
      : {
          min: furniture.placement === "wall" ? 4 : 2,
          max: 12 * furniture.resolution,
        },
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function resizeFurnitureGrid(
  furniture: FurnitureDefinition,
  grid: FurnitureDefinition["grid"],
): FurnitureDefinition {
  const limits = furnitureGridLimits(furniture);
  const nextGrid = {
    width: clamp(grid.width, limits.width.min, limits.width.max),
    depth: clamp(grid.depth, limits.depth.min, limits.depth.max),
    height: clamp(grid.height, limits.height.min, limits.height.max),
  };
  return {
    ...furniture,
    grid: nextGrid,
    voxels: sortedVoxels(
      furniture.voxels.filter(
        (voxel) => voxel.x < nextGrid.width && voxel.y < nextGrid.depth &&
          voxel.z < nextGrid.height,
      ),
    ),
  };
}

export function cellsInFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection | null,
): FurnitureCell[] {
  if (!selection) return [];
  const bounds = selectionBounds(furniture, selection);
  const layer = planeLayer(furniture, selection);
  const cells: FurnitureCell[] = [];
  for (let b = bounds.minB; b <= bounds.maxB; b += 1) {
    for (let a = bounds.minA; a <= bounds.maxA; a += 1) {
      const point = { a, b };
      if (isInsidePlane(furniture, point)) {
        cells.push(fromPlane(furniture, point, layer));
      }
    }
  }
  return cells;
}

export function eraseFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
): FurnitureDefinition {
  const voxels = furniture.voxels.filter(
    (voxel) => !containsCell(furniture, selection, voxel),
  );
  return voxels.length === furniture.voxels.length
    ? furniture
    : { ...furniture, voxels: sortedVoxels(voxels) };
}

function transformedFurniture(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  targetSelection: FurnitureSelection,
  transform: (point: PlanePoint) => PlanePoint,
  duplicate: boolean,
): FurnitureTransformResult {
  const targetCells = cellsInFurnitureSelection(furniture, targetSelection);
  const expectedCellCount = cellsInFurnitureSelection(furniture, selection).length;
  if (targetCells.length !== expectedCellCount) {
    return { furniture, selection, changed: false, blocked: true };
  }

  const selected = furniture.voxels.filter((voxel) =>
    containsCell(furniture, selection, voxel)
  );
  if (selected.length === 0) {
    return {
      furniture,
      selection: targetSelection,
      changed: false,
      blocked: false,
    };
  }

  const layer = planeLayer(furniture, selection);
  const next = new Map(furniture.voxels.map((voxel) => [voxelKey(voxel), { ...voxel }]));
  if (!duplicate) {
    selected.forEach((voxel) => next.delete(voxelKey(voxel)));
  }
  selected.forEach((voxel) => {
    const target = fromPlane(furniture, transform(toPlane(furniture, voxel)), layer);
    next.set(voxelKey(target), {
      ...target,
      material: voxel.material,
      ...(voxel.color ? { color: voxel.color } : {}),
    });
  });
  return {
    furniture: { ...furniture, voxels: sortedVoxels([...next.values()]) },
    selection: targetSelection,
    changed: true,
    blocked: false,
  };
}

export function moveFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  deltaA: number,
  deltaB: number,
  duplicate = false,
): FurnitureTransformResult {
  const bounds = selectionBounds(furniture, selection);
  const layer = planeLayer(furniture, selection);
  const targetBounds = {
    minA: bounds.minA + deltaA,
    maxA: bounds.maxA + deltaA,
    minB: bounds.minB + deltaB,
    maxB: bounds.maxB + deltaB,
  };
  const targetSelection = selectionFromBounds(furniture, targetBounds, layer);
  return transformedFurniture(
    furniture,
    selection,
    targetSelection,
    (point) => ({ a: point.a + deltaA, b: point.b + deltaB }),
    duplicate,
  );
}

export function moveFurnitureSelectionLayer(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  deltaZ: number,
): FurnitureTransformResult {
  if (furniture.placement !== "volume") {
    return { furniture, selection, changed: false, blocked: true };
  }
  const targetLayer = selection.start.z + deltaZ;
  if (targetLayer < 0 || targetLayer >= furniture.grid.height) {
    return { furniture, selection, changed: false, blocked: true };
  }
  const selected = furniture.voxels.filter((voxel) =>
    containsCell(furniture, selection, voxel)
  );
  const targetSelection = {
    start: { ...selection.start, z: targetLayer },
    end: { ...selection.end, z: targetLayer },
  };
  if (selected.length === 0) {
    return {
      furniture,
      selection: targetSelection,
      changed: false,
      blocked: false,
    };
  }
  const next = new Map(
    furniture.voxels.map((voxel) => [voxelKey(voxel), { ...voxel }]),
  );
  selected.forEach((voxel) => next.delete(voxelKey(voxel)));
  selected.forEach((voxel) => {
    const target = { ...voxel, z: voxel.z + deltaZ };
    next.set(voxelKey(target), target);
  });
  return {
    furniture: { ...furniture, voxels: sortedVoxels([...next.values()]) },
    selection: targetSelection,
    changed: true,
    blocked: false,
  };
}

export function rotateFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
): FurnitureTransformResult {
  const bounds = selectionBounds(furniture, selection);
  const layer = planeLayer(furniture, selection);
  const targetBounds = {
    minA: bounds.minA,
    maxA: bounds.minA + (bounds.maxB - bounds.minB),
    minB: bounds.minB,
    maxB: bounds.minB + (bounds.maxA - bounds.minA),
  };
  return transformedFurniture(
    furniture,
    selection,
    selectionFromBounds(furniture, targetBounds, layer),
    (point) => ({
      a: bounds.minA + bounds.maxB - point.b,
      b: bounds.minB + point.a - bounds.minA,
    }),
    false,
  );
}

export function mirrorFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  axis: "a" | "b",
): FurnitureTransformResult {
  const bounds = selectionBounds(furniture, selection);
  return transformedFurniture(
    furniture,
    selection,
    selection,
    (point) => axis === "a"
      ? { a: bounds.minA + bounds.maxA - point.a, b: point.b }
      : { a: point.a, b: bounds.minB + bounds.maxB - point.b },
    false,
  );
}

function voxelStyleMatches(
  voxel: FurnitureVoxel | undefined,
  target: FurnitureVoxel | undefined,
): boolean {
  if (!voxel || !target) return voxel === target;
  return voxel.material === target.material && voxel.color === target.color;
}

export function floodFillFurniture(
  furniture: FurnitureDefinition,
  start: FurnitureCell,
  material: FurnitureMaterialId,
  color?: string,
): FurnitureDefinition {
  const startPoint = toPlane(furniture, start);
  if (!isInsidePlane(furniture, startPoint)) return furniture;
  const voxels = new Map(furniture.voxels.map((voxel) => [voxelKey(voxel), { ...voxel }]));
  const target = voxels.get(voxelKey(start));
  if (target?.material === material && target.color === color) return furniture;

  const layer = furniture.placement === "volume" ? start.z : 0;
  const queue: PlanePoint[] = [startPoint];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const point = queue.shift();
    if (!point || !isInsidePlane(furniture, point)) continue;
    const pointKey = `${point.a}:${point.b}`;
    if (visited.has(pointKey)) continue;
    const cell = fromPlane(furniture, point, layer);
    if (!voxelStyleMatches(voxels.get(voxelKey(cell)), target)) continue;
    visited.add(pointKey);
    voxels.set(voxelKey(cell), {
      ...cell,
      material,
      ...(color ? { color } : {}),
    });
    queue.push(
      { a: point.a - 1, b: point.b },
      { a: point.a + 1, b: point.b },
      { a: point.a, b: point.b - 1 },
      { a: point.a, b: point.b + 1 },
    );
  }

  return {
    ...furniture,
    voxels: sortedVoxels([...voxels.values()]),
  };
}
