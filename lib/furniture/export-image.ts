import { PALETTES } from "../room/sample-room";
import type { PlacedFurnitureObject } from "../room/types";
import { drawPlacedFurniture } from "../renderer/draw-room";
import { getFurnitureRenderGeometry } from "./placement";
import type { FurnitureDefinition } from "./types";

type Point = { x: number; y: number };

const EXPORT_SUPERSAMPLE = 2;

export type FurnitureExportSize = 256 | 512 | 1024;
export type FurnitureExportBackground = "transparent" | "paper";
export type FurnitureExportRotation = PlacedFurnitureObject["rotation"];

export interface FurnitureImageExportOptions {
  size: FurnitureExportSize;
  rotation: FurnitureExportRotation;
  background: FurnitureExportBackground;
  outline: boolean;
  shadow: boolean;
}

function rawProject(x: number, y: number, z: number): Point {
  return {
    x: x - y,
    y: (x + y) * 0.5 - z,
  };
}

function furnitureBounds(
  furniture: FurnitureDefinition,
  rotation: FurnitureExportRotation,
): { geometry: ReturnType<typeof getFurnitureRenderGeometry>; points: Point[] } {
  const geometry = getFurnitureRenderGeometry(furniture, rotation);
  const depth = furniture.placement === "wall" ? 0 : geometry.depth;
  const height = furniture.placement === "floor"
    ? Math.min(geometry.cellSize, 0.06)
    : geometry.height;
  const points = [0, geometry.width].flatMap((x) =>
    [0, depth].flatMap((y) =>
      [0, height].map((z) => rawProject(x, y, z)),
    ),
  );
  return { geometry, points };
}

function tracePolygon(context: CanvasRenderingContext2D, points: Point[]): void {
  context.beginPath();
  context.moveTo(points[0].x, points[0].y);
  points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
  context.closePath();
}

function applyVisiblePixelBoundaries(canvas: HTMLCanvasElement): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  const source = new Uint8ClampedArray(image.data);
  const output = image.data;
  const width = canvas.width;
  const height = canvas.height;
  const ink = [59, 51, 46] as const;
  const neighbors = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ] as const;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 96) continue;

      const boundary = neighbors.some(([offsetX, offsetY]) => {
        const neighborX = x + offsetX;
        const neighborY = y + offsetY;
        if (neighborX < 0 || neighborY < 0 || neighborX >= width || neighborY >= height) {
          return true;
        }
        const neighborIndex = (neighborY * width + neighborX) * 4;
        if (source[neighborIndex + 3] < 48) return true;
        if (source[neighborIndex + 3] < 160) return false;
        const difference =
          Math.abs(source[index] - source[neighborIndex]) +
          Math.abs(source[index + 1] - source[neighborIndex + 1]) +
          Math.abs(source[index + 2] - source[neighborIndex + 2]);
        return difference > 42;
      });

      if (boundary) {
        output[index] = ink[0];
        output[index + 1] = ink[1];
        output[index + 2] = ink[2];
        output[index + 3] = Math.max(output[index + 3], 190);
      }
    }
  }
  context.putImageData(image, 0, 0);
}

export function renderFurnitureImage(
  canvas: HTMLCanvasElement,
  furniture: FurnitureDefinition,
  options: FurnitureImageExportOptions,
): void {
  canvas.width = options.size;
  canvas.height = options.size;
  const outputContext = canvas.getContext("2d");
  if (!outputContext) return;

  const renderSize = options.size * EXPORT_SUPERSAMPLE;
  const renderSurface = document.createElement("canvas");
  renderSurface.width = renderSize;
  renderSurface.height = renderSize;
  const context = renderSurface.getContext("2d");
  if (!context) return;

  const finish = (): void => {
    outputContext.setTransform(1, 0, 0, 1, 0, 0);
    outputContext.clearRect(0, 0, options.size, options.size);
    outputContext.imageSmoothingEnabled = true;
    outputContext.imageSmoothingQuality = "high";
    outputContext.drawImage(renderSurface, 0, 0, options.size, options.size);
  };

  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, renderSize, renderSize);
  context.imageSmoothingEnabled = false;
  if (options.background === "paper") {
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, renderSize, renderSize);
  }
  if (furniture.voxels.length === 0) {
    finish();
    return;
  }

  const { geometry, points } = furnitureBounds(furniture, options.rotation);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const padding = renderSize * 0.11;
  const available = renderSize - padding * 2;
  const spanX = Math.max(maxX - minX, geometry.cellSize);
  const spanY = Math.max(maxY - minY, geometry.cellSize);
  const unit = Math.min(available / spanX, available / spanY);
  const contentWidth = spanX * unit;
  const contentHeight = spanY * unit;
  const offsetX = (renderSize - contentWidth) * 0.5 - minX * unit;
  const offsetY = (renderSize - contentHeight) * 0.5 - minY * unit;
  const project = (x: number, y: number, z = 0): Point => {
    const point = rawProject(x, y, z);
    return {
      x: offsetX + point.x * unit,
      y: offsetY + point.y * unit,
    };
  };

  if (options.shadow && furniture.placement !== "wall") {
    const shadow = [
      project(0, 0, 0),
      project(geometry.width, 0, 0),
      project(geometry.width, geometry.depth, 0),
      project(0, geometry.depth, 0),
    ];
    context.save();
    context.shadowColor = "rgba(48, 44, 39, 0.22)";
    context.shadowBlur = Math.max(4, renderSize * 0.018);
    context.shadowOffsetY = Math.max(2, renderSize * 0.008);
    tracePolygon(context, shadow);
    context.fillStyle = "rgba(48, 44, 39, 0.1)";
    context.fill();
    context.restore();
  }

  const object: PlacedFurnitureObject = {
    id: "furniture-export",
    type: "furniture",
    definition: furniture,
    x: 0,
    y: 0,
    z: 0,
    rotation: options.rotation,
    wall: "back",
  };
  const objectLayer = document.createElement("canvas");
  objectLayer.width = renderSize;
  objectLayer.height = renderSize;
  const objectContext = objectLayer.getContext("2d");
  if (!objectContext) return;
  objectContext.imageSmoothingEnabled = false;
  drawPlacedFurniture(
    objectContext,
    project,
    PALETTES.sage,
    object,
    false,
    false,
  );
  if (options.outline) {
    applyVisiblePixelBoundaries(objectLayer);
  }
  context.drawImage(objectLayer, 0, 0);
  finish();
}

export function renderFurnitureSpriteSheet(
  furniture: FurnitureDefinition,
  options: Omit<FurnitureImageExportOptions, "rotation">,
): HTMLCanvasElement {
  const sheet = document.createElement("canvas");
  sheet.width = options.size * 4;
  sheet.height = options.size;
  const context = sheet.getContext("2d");
  if (!context) return sheet;
  context.imageSmoothingEnabled = false;

  ([0, 1, 2, 3] as FurnitureExportRotation[]).forEach((rotation, index) => {
    const frame = document.createElement("canvas");
    renderFurnitureImage(frame, furniture, { ...options, rotation });
    context.drawImage(frame, index * options.size, 0);
  });
  return sheet;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/png" | "image/webp",
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("이미지 파일을 만들지 못했어요."));
          return;
        }
        resolve(blob);
      },
      type,
      type === "image/webp" ? 0.94 : undefined,
    );
  });
}

export function safeFurnitureFilename(name: string): string {
  const safe = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 64);
  return safe || "furniture";
}
