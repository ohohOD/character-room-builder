import { FURNITURE_MATERIALS } from "./presets";
import { normalizeFurnitureColor } from "./colors";
import type {
  FurnitureDefinition,
  FurnitureMaterialId,
  FurnitureVoxel,
} from "./types";

type Point = { x: number; y: number };
export type FurnitureCell = { x: number; y: number; z: number };

interface Layout {
  width: number;
  height: number;
  originX: number;
  originY: number;
  tileWidth: number;
  tileHeight: number;
  cubeHeight: number;
}

export interface FurnitureRenderState {
  activeLayer: number;
  selectedMaterial: FurnitureMaterialId;
  selectedColor: string;
  tool: "paint" | "erase";
  hover: FurnitureCell | null;
}

function parseHex(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function mixColor(first: string, second: string, amount: number): string {
  const a = parseHex(first);
  const b = parseHex(second);
  const channel = (index: number) =>
    Math.round(a[index] + (b[index] - a[index]) * amount)
      .toString(16)
      .padStart(2, "0");
  return "#" + channel(0) + channel(1) + channel(2);
}

function withAlpha(color: string, alpha: number): string {
  const [red, green, blue] = parseHex(color);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function voxelColor(voxel: FurnitureVoxel): string {
  return (voxel.color && normalizeFurnitureColor(voxel.color)) ??
    FURNITURE_MATERIALS[voxel.material].color;
}

function makeLayout(
  width: number,
  height: number,
  furniture: FurnitureDefinition,
): Layout {
  if (furniture.placement === "wall") {
    const horizontalFit = ((width - 120) * 2) / furniture.grid.width;
    const verticalFit =
      (height - 150) /
      (furniture.grid.height * 0.5 + furniture.grid.width * 0.25);
    const tileWidth = Math.max(28, Math.min(56, horizontalFit, verticalFit));
    const tileHeight = tileWidth * 0.5;
    return {
      width,
      height,
      originX: width * 0.5 - furniture.grid.width * tileWidth * 0.25,
      originY: Math.min(height - 88, height * 0.62),
      tileWidth,
      tileHeight,
      cubeHeight: tileHeight,
    };
  }

  const gridSpan = furniture.grid.width + furniture.grid.depth;
  const tileWidth = Math.max(28, Math.min(52, ((width - 72) * 2) / gridSpan));
  const tileHeight = tileWidth * 0.5;
  return {
    width,
    height,
    originX: width * 0.5,
    originY: Math.max(165, height * 0.39),
    tileWidth,
    tileHeight,
    cubeHeight: tileHeight,
  };
}

function project(layout: Layout, x: number, y: number, z: number): Point {
  return {
    x: layout.originX + (x - y) * layout.tileWidth * 0.5,
    y:
      layout.originY +
      (x + y) * layout.tileHeight * 0.5 -
      z * layout.cubeHeight,
  };
}

function polygon(
  context: CanvasRenderingContext2D,
  points: Point[],
  fill: string,
  stroke: string,
  lineWidth = 1,
): void {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
  context.fillStyle = fill;
  context.fill();
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.lineJoin = "round";
  context.stroke();
}

function diamond(layout: Layout, x: number, y: number, z: number): Point[] {
  return [
    project(layout, x, y, z),
    project(layout, x + 1, y, z),
    project(layout, x + 1, y + 1, z),
    project(layout, x, y + 1, z),
  ];
}

function wallTile(layout: Layout, x: number, z: number): Point[] {
  return [
    project(layout, x, 0, z),
    project(layout, x + 1, 0, z),
    project(layout, x + 1, 0, z + 1),
    project(layout, x, 0, z + 1),
  ];
}

function drawCube(
  context: CanvasRenderingContext2D,
  layout: Layout,
  voxel: FurnitureVoxel,
): void {
  const base = voxelColor(voxel);
  const bottom = diamond(layout, voxel.x, voxel.y, voxel.z);
  const top = diamond(layout, voxel.x, voxel.y, voxel.z + 1);
  const outline = withAlpha("#302c27", 0.72);

  polygon(
    context,
    [bottom[3], bottom[2], top[2], top[3]],
    mixColor(base, "#302c27", 0.18),
    outline,
  );
  polygon(
    context,
    [bottom[1], bottom[2], top[2], top[1]],
    mixColor(base, "#302c27", 0.28),
    outline,
  );
  polygon(context, top, mixColor(base, "#ffffff", 0.14), outline);
}

function drawFloorCell(
  context: CanvasRenderingContext2D,
  layout: Layout,
  voxel: FurnitureVoxel,
): void {
  const base = voxelColor(voxel);
  const bottom = diamond(layout, voxel.x, voxel.y, 0);
  const top = diamond(layout, voxel.x, voxel.y, 0.14);
  const outline = withAlpha("#302c27", 0.58);
  polygon(
    context,
    [bottom[3], bottom[2], top[2], top[3]],
    mixColor(base, "#302c27", 0.14),
    outline,
    0.8,
  );
  polygon(
    context,
    [bottom[1], bottom[2], top[2], top[1]],
    mixColor(base, "#302c27", 0.2),
    outline,
    0.8,
  );
  polygon(context, top, mixColor(base, "#ffffff", 0.1), outline, 0.9);
}

function drawVolumeGrid(
  context: CanvasRenderingContext2D,
  layout: Layout,
  furniture: FurnitureDefinition,
  activeLayer: number,
): void {
  const planeZ = activeLayer + 1;
  for (let y = 0; y < furniture.grid.depth; y += 1) {
    for (let x = 0; x < furniture.grid.width; x += 1) {
      polygon(
        context,
        diamond(layout, x, y, planeZ),
        (x + y) % 2 === 0
          ? "rgba(251, 250, 246, 0.36)"
          : "rgba(232, 224, 211, 0.24)",
        "rgba(85, 122, 79, 0.28)",
        0.8,
      );
    }
  }
}

function drawFloorSurface(
  context: CanvasRenderingContext2D,
  layout: Layout,
  furniture: FurnitureDefinition,
): void {
  for (let y = 0; y < furniture.grid.depth; y += 1) {
    for (let x = 0; x < furniture.grid.width; x += 1) {
      polygon(
        context,
        diamond(layout, x, y, 0.02),
        (x + y) % 2 === 0 ? "#ece4d8" : "#e6dccf",
        "rgba(85, 122, 79, 0.24)",
        0.8,
      );
    }
  }
  furniture.voxels.forEach((voxel) => drawFloorCell(context, layout, voxel));
}

function drawWallSurface(
  context: CanvasRenderingContext2D,
  layout: Layout,
  furniture: FurnitureDefinition,
): void {
  const wall = [
    project(layout, 0, 0, 0),
    project(layout, furniture.grid.width, 0, 0),
    project(layout, furniture.grid.width, 0, furniture.grid.height),
    project(layout, 0, 0, furniture.grid.height),
  ];
  polygon(context, wall, "#e6dccf", "rgba(48, 44, 39, 0.42)", 1.2);

  for (let z = 0; z < furniture.grid.height; z += 1) {
    for (let x = 0; x < furniture.grid.width; x += 1) {
      polygon(
        context,
        wallTile(layout, x, z),
        (x + z) % 2 === 0 ? "rgba(251, 250, 246, 0.34)" : "rgba(232, 224, 211, 0.2)",
        "rgba(85, 122, 79, 0.25)",
        0.8,
      );
    }
  }

  furniture.voxels.forEach((voxel) => {
    const base = voxelColor(voxel);
    polygon(
      context,
      wallTile(layout, voxel.x, voxel.z),
      mixColor(base, "#ffffff", 0.12),
      withAlpha("#302c27", 0.62),
      1,
    );
  });
}

function drawBackdrop(
  context: CanvasRenderingContext2D,
  bounds: DOMRect,
): void {
  const backdrop = context.createLinearGradient(0, 0, 0, bounds.height);
  backdrop.addColorStop(0, "#f7f3eb");
  backdrop.addColorStop(1, "#e8e0d3");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, bounds.width, bounds.height);
}

export function drawFurniture(
  canvas: HTMLCanvasElement,
  furniture: FurnitureDefinition,
  state: FurnitureRenderState,
): void {
  const bounds = canvas.getBoundingClientRect();
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.floor(bounds.width * pixelRatio));
  canvas.height = Math.max(1, Math.floor(bounds.height * pixelRatio));

  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);

  const layout = makeLayout(bounds.width, bounds.height, furniture);
  drawBackdrop(context, bounds);

  if (furniture.placement === "wall") {
    drawWallSurface(context, layout, furniture);
  } else {
    const floor = [
      project(layout, 0, 0, 0),
      project(layout, furniture.grid.width, 0, 0),
      project(layout, furniture.grid.width, furniture.grid.depth, 0),
      project(layout, 0, furniture.grid.depth, 0),
    ];
    polygon(context, floor, "#ddd0bd", "rgba(48, 44, 39, 0.36)", 1.2);

    if (furniture.placement === "floor") {
      drawFloorSurface(context, layout, furniture);
    } else {
      drawVolumeGrid(context, layout, furniture, state.activeLayer);
      furniture.voxels
        .filter((voxel) => voxel.z <= state.activeLayer)
        .sort(
          (first, second) =>
            first.x + first.y + first.z - (second.x + second.y + second.z) ||
            first.z - second.z ||
            first.y - second.y ||
            first.x - second.x,
        )
        .forEach((voxel) => drawCube(context, layout, voxel));
    }
  }

  if (state.hover) {
    const material = normalizeFurnitureColor(state.selectedColor) ??
      FURNITURE_MATERIALS[state.selectedMaterial].color;
    const hoverPoints = furniture.placement === "wall"
      ? wallTile(layout, state.hover.x, state.hover.z)
      : diamond(
          layout,
          state.hover.x,
          state.hover.y,
          furniture.placement === "floor" ? 0.18 : state.hover.z + 1,
        );
    polygon(
      context,
      hoverPoints,
      state.tool === "erase"
        ? "rgba(195, 105, 92, 0.24)"
        : withAlpha(material, 0.38),
      state.tool === "erase" ? "#9f4e45" : "#557a4f",
      2,
    );
  }

  const metric = furniture.placement === "volume"
    ? `LAYER ${state.activeLayer + 1}/${furniture.grid.height} · ${furniture.voxels.length} VOXELS`
    : `${furniture.placement.toUpperCase()} SURFACE · ${furniture.voxels.length} CELLS`;
  context.fillStyle = "rgba(48, 44, 39, 0.58)";
  context.font = '11px "Cascadia Code", Consolas, monospace';
  context.textAlign = "right";
  context.fillText(metric, bounds.width - 18, bounds.height - 18);
}

export function clientPointToFurnitureCell(
  canvas: HTMLCanvasElement,
  furniture: FurnitureDefinition,
  clientX: number,
  clientY: number,
  activeLayer: number,
): FurnitureCell | null {
  const bounds = canvas.getBoundingClientRect();
  const layout = makeLayout(bounds.width, bounds.height, furniture);
  const localX = clientX - bounds.left;
  const localY = clientY - bounds.top;

  if (furniture.placement === "wall") {
    const xCoordinate =
      (localX - layout.originX) / (layout.tileWidth * 0.5);
    const zCoordinate =
      (layout.originY + xCoordinate * layout.tileHeight * 0.5 - localY) /
      layout.cubeHeight;
    const x = Math.floor(xCoordinate);
    const z = Math.floor(zCoordinate);
    if (x < 0 || z < 0 || x >= furniture.grid.width || z >= furniture.grid.height) {
      return null;
    }
    return { x, y: 0, z };
  }

  const planeZ = furniture.placement === "floor" ? 0.14 : activeLayer + 1;
  const deltaX = localX - layout.originX;
  const deltaY = localY - layout.originY + planeZ * layout.cubeHeight;
  const x = Math.floor(deltaY / layout.tileHeight + deltaX / layout.tileWidth);
  const y = Math.floor(deltaY / layout.tileHeight - deltaX / layout.tileWidth);

  if (x < 0 || y < 0 || x >= furniture.grid.width || y >= furniture.grid.depth) {
    return null;
  }
  return { x, y, z: furniture.placement === "floor" ? 0 : activeLayer };
}
