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

export type FurnitureEditPlane = "xy" | "xz" | "yz";

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

export function defaultFurnitureEditPlane(
  furniture: FurnitureDefinition,
): FurnitureEditPlane {
  return furniture.placement === "wall" ? "xz" : "xy";
}

function toPlane(
  furniture: FurnitureDefinition,
  cell: FurnitureCell,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): PlanePoint {
  if (plane === "xz") return { a: cell.x, b: cell.z };
  if (plane === "yz") return { a: cell.y, b: cell.z };
  return { a: cell.x, b: cell.y };
}

function fromPlane(
  furniture: FurnitureDefinition,
  point: PlanePoint,
  slice: number,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureCell {
  if (plane === "xz") return { x: point.a, y: slice, z: point.b };
  if (plane === "yz") return { x: slice, y: point.a, z: point.b };
  return { x: point.a, y: point.b, z: slice };
}

function planeSlice(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): number {
  if (plane === "xz") return selection.start.y;
  if (plane === "yz") return selection.start.x;
  return selection.start.z;
}

function planeSize(
  furniture: FurnitureDefinition,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): PlanePoint {
  if (plane === "xz") return { a: furniture.grid.width, b: furniture.grid.height };
  if (plane === "yz") return { a: furniture.grid.depth, b: furniture.grid.height };
  return { a: furniture.grid.width, b: furniture.grid.depth };
}

function selectionBounds(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): PlaneBounds {
  const start = toPlane(furniture, selection.start, plane);
  const end = toPlane(furniture, selection.end, plane);
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
  slice: number,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureSelection {
  return {
    start: fromPlane(furniture, { a: bounds.minA, b: bounds.minB }, slice, plane),
    end: fromPlane(furniture, { a: bounds.maxA, b: bounds.maxB }, slice, plane),
  };
}

function isInsidePlane(
  furniture: FurnitureDefinition,
  point: PlanePoint,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): boolean {
  const size = planeSize(furniture, plane);
  return point.a >= 0 && point.b >= 0 && point.a < size.a && point.b < size.b;
}

function containsCell(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  cell: FurnitureCell,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): boolean {
  const bounds = selectionBounds(furniture, selection, plane);
  const point = toPlane(furniture, cell, plane);
  const sameLayer = plane === "xz"
    ? cell.y === planeSlice(furniture, selection, plane)
    : plane === "yz"
      ? cell.x === planeSlice(furniture, selection, plane)
      : cell.z === planeSlice(furniture, selection, plane);
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
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureCell[] {
  if (!selection) return [];
  const bounds = selectionBounds(furniture, selection, plane);
  const slice = planeSlice(furniture, selection, plane);
  const cells: FurnitureCell[] = [];
  for (let b = bounds.minB; b <= bounds.maxB; b += 1) {
    for (let a = bounds.minA; a <= bounds.maxA; a += 1) {
      const point = { a, b };
      if (isInsidePlane(furniture, point, plane)) {
        cells.push(fromPlane(furniture, point, slice, plane));
      }
    }
  }
  return cells;
}

export function eraseFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureDefinition {
  const voxels = furniture.voxels.filter(
    (voxel) => !containsCell(furniture, selection, voxel, plane),
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
  plane: FurnitureEditPlane,
): FurnitureTransformResult {
  const targetCells = cellsInFurnitureSelection(furniture, targetSelection, plane);
  const expectedCellCount = cellsInFurnitureSelection(furniture, selection, plane).length;
  if (targetCells.length !== expectedCellCount) {
    return { furniture, selection, changed: false, blocked: true };
  }

  const selected = furniture.voxels.filter((voxel) =>
    containsCell(furniture, selection, voxel, plane)
  );
  if (selected.length === 0) {
    return {
      furniture,
      selection: targetSelection,
      changed: false,
      blocked: false,
    };
  }

  const slice = planeSlice(furniture, selection, plane);
  const next = new Map(furniture.voxels.map((voxel) => [voxelKey(voxel), { ...voxel }]));
  if (!duplicate) {
    selected.forEach((voxel) => next.delete(voxelKey(voxel)));
  }
  selected.forEach((voxel) => {
    const target = fromPlane(
      furniture,
      transform(toPlane(furniture, voxel, plane)),
      slice,
      plane,
    );
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
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureTransformResult {
  const bounds = selectionBounds(furniture, selection, plane);
  const slice = planeSlice(furniture, selection, plane);
  const targetBounds = {
    minA: bounds.minA + deltaA,
    maxA: bounds.maxA + deltaA,
    minB: bounds.minB + deltaB,
    maxB: bounds.maxB + deltaB,
  };
  const targetSelection = selectionFromBounds(furniture, targetBounds, slice, plane);
  return transformedFurniture(
    furniture,
    selection,
    targetSelection,
    (point) => ({ a: point.a + deltaA, b: point.b + deltaB }),
    duplicate,
    plane,
  );
}

export function moveFurnitureSelectionSlice(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  delta: number,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureTransformResult {
  const currentSlice = planeSlice(furniture, selection, plane);
  const maxSlice = plane === "xz"
    ? furniture.grid.depth
    : plane === "yz"
      ? furniture.grid.width
      : furniture.grid.height;
  const targetSlice = currentSlice + delta;
  if (targetSlice < 0 || targetSlice >= maxSlice) {
    return { furniture, selection, changed: false, blocked: true };
  }
  const selected = furniture.voxels.filter((voxel) =>
    containsCell(furniture, selection, voxel, plane)
  );
  const bounds = selectionBounds(furniture, selection, plane);
  const targetSelection = selectionFromBounds(
    furniture,
    bounds,
    targetSlice,
    plane,
  );
  if (selected.length === 0) {
    return { furniture, selection: targetSelection, changed: false, blocked: false };
  }
  const next = new Map(
    furniture.voxels.map((voxel) => [voxelKey(voxel), { ...voxel }]),
  );
  selected.forEach((voxel) => next.delete(voxelKey(voxel)));
  selected.forEach((voxel) => {
    const target = plane === "xz"
      ? { ...voxel, y: voxel.y + delta }
      : plane === "yz"
        ? { ...voxel, x: voxel.x + delta }
        : { ...voxel, z: voxel.z + delta };
    next.set(voxelKey(target), target);
  });
  return {
    furniture: { ...furniture, voxels: sortedVoxels([...next.values()]) },
    selection: targetSelection,
    changed: true,
    blocked: false,
  };
}

export function moveFurnitureSelectionLayer(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  deltaZ: number,
): FurnitureTransformResult {
  if (furniture.placement !== "volume") {
    return { furniture, selection, changed: false, blocked: true };
  }
  return moveFurnitureSelectionSlice(furniture, selection, deltaZ, "xy");
}

export function rotateFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureTransformResult {
  const bounds = selectionBounds(furniture, selection, plane);
  const slice = planeSlice(furniture, selection, plane);
  const targetBounds = {
    minA: bounds.minA,
    maxA: bounds.minA + (bounds.maxB - bounds.minB),
    minB: bounds.minB,
    maxB: bounds.minB + (bounds.maxA - bounds.minA),
  };
  return transformedFurniture(
    furniture,
    selection,
    selectionFromBounds(furniture, targetBounds, slice, plane),
    (point) => ({
      a: bounds.minA + bounds.maxB - point.b,
      b: bounds.minB + point.a - bounds.minA,
    }),
    false,
    plane,
  );
}

export function mirrorFurnitureSelection(
  furniture: FurnitureDefinition,
  selection: FurnitureSelection,
  axis: "a" | "b",
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureTransformResult {
  const bounds = selectionBounds(furniture, selection, plane);
  return transformedFurniture(
    furniture,
    selection,
    selection,
    (point) => axis === "a"
      ? { a: bounds.minA + bounds.maxA - point.a, b: point.b }
      : { a: point.a, b: bounds.minB + bounds.maxB - point.b },
    false,
    plane,
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
  plane: FurnitureEditPlane = defaultFurnitureEditPlane(furniture),
): FurnitureDefinition {
  const startPoint = toPlane(furniture, start, plane);
  if (!isInsidePlane(furniture, startPoint, plane)) return furniture;
  const voxels = new Map(furniture.voxels.map((voxel) => [voxelKey(voxel), { ...voxel }]));
  const target = voxels.get(voxelKey(start));
  if (target?.material === material && target.color === color) return furniture;

  const slice = plane === "xz" ? start.y : plane === "yz" ? start.x : start.z;
  const queue: PlanePoint[] = [startPoint];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const point = queue.shift();
    if (!point || !isInsidePlane(furniture, point, plane)) continue;
    const pointKey = `${point.a}:${point.b}`;
    if (visited.has(pointKey)) continue;
    const cell = fromPlane(furniture, point, slice, plane);
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
