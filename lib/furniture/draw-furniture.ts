import { FURNITURE_MATERIALS } from "./presets";
import type {
  FurnitureDefinition,
  FurnitureMaterialId,
  FurnitureVoxel,
} from "./types";

type Point = { x: number; y: number };
export type FurnitureCell = { x: number; y: number };

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

function makeLayout(
  width: number,
  height: number,
  furniture: FurnitureDefinition,
): Layout {
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

function project(
  layout: Layout,
  x: number,
  y: number,
  z: number,
): Point {
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

function diamond(
  layout: Layout,
  x: number,
  y: number,
  z: number,
): Point[] {
  return [
    project(layout, x, y, z),
    project(layout, x + 1, y, z),
    project(layout, x + 1, y + 1, z),
    project(layout, x, y + 1, z),
  ];
}

function drawCube(
  context: CanvasRenderingContext2D,
  layout: Layout,
  voxel: FurnitureVoxel,
): void {
  const base = FURNITURE_MATERIALS[voxel.material].color;
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
  polygon(
    context,
    top,
    mixColor(base, "#ffffff", 0.14),
    outline,
  );
}

function drawAssemblyGrid(
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
  const backdrop = context.createLinearGradient(0, 0, 0, bounds.height);
  backdrop.addColorStop(0, "#f7f3eb");
  backdrop.addColorStop(1, "#e8e0d3");
  context.fillStyle = backdrop;
  context.fillRect(0, 0, bounds.width, bounds.height);

  const floor = [
    project(layout, 0, 0, 0),
    project(layout, furniture.grid.width, 0, 0),
    project(layout, furniture.grid.width, furniture.grid.depth, 0),
    project(layout, 0, furniture.grid.depth, 0),
  ];
  polygon(context, floor, "#ddd0bd", "rgba(48, 44, 39, 0.36)", 1.2);

  drawAssemblyGrid(context, layout, furniture, state.activeLayer);

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

  if (state.hover) {
    const material = FURNITURE_MATERIALS[state.selectedMaterial].color;
    polygon(
      context,
      diamond(
        layout,
        state.hover.x,
        state.hover.y,
        state.activeLayer + 1,
      ),
      state.tool === "erase"
        ? "rgba(195, 105, 92, 0.24)"
        : withAlpha(material, 0.38),
      state.tool === "erase" ? "#9f4e45" : "#557a4f",
      2,
    );
  }

  context.fillStyle = "rgba(48, 44, 39, 0.58)";
  context.font = '11px "Cascadia Code", Consolas, monospace';
  context.textAlign = "right";
  context.fillText(
    `LAYER ${state.activeLayer + 1}/${furniture.grid.height} · ${furniture.voxels.length} VOXELS`,
    bounds.width - 18,
    bounds.height - 18,
  );
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
  const deltaX = localX - layout.originX;
  const deltaY =
    localY - layout.originY + (activeLayer + 1) * layout.cubeHeight;
  const x = Math.floor(deltaY / layout.tileHeight + deltaX / layout.tileWidth);
  const y = Math.floor(deltaY / layout.tileHeight - deltaX / layout.tileWidth);

  if (
    x < 0 ||
    y < 0 ||
    x >= furniture.grid.width ||
    y >= furniture.grid.depth
  ) {
    return null;
  }
  return { x, y };
}
