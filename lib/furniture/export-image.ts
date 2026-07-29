import { PALETTES } from "../room/sample-room";
import type { PlacedFurnitureObject } from "../room/types";
import { drawPlacedFurniture } from "../renderer/draw-room";
import { getFurnitureRenderGeometry } from "./placement";
import { FURNITURE_MATERIALS } from "./presets";
import type { FurnitureDefinition } from "./types";

type Point = { x: number; y: number };

const EXPORT_SUPERSAMPLE = 2;

export type FurnitureExportSize = 128 | 256 | 512 | 1024;
export type FurnitureExportBackground = "transparent" | "paper";
export type FurnitureExportRotation = PlacedFurnitureObject["rotation"];
export type FurnitureTurntableDirection = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

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

function parseColor(color: string): [number, number, number] {
  const value = color.replace("#", "");
  return [
    Number.parseInt(value.slice(0, 2), 16),
    Number.parseInt(value.slice(2, 4), 16),
    Number.parseInt(value.slice(4, 6), 16),
  ];
}

function shadeColor(color: string, amount: number): string {
  const [red, green, blue] = parseColor(color);
  const target = amount < 0 ? 48 : 255;
  const strength = Math.abs(amount);
  return `rgb(${Math.round(red + (target - red) * strength)}, ${Math.round(green + (target - green) * strength)}, ${Math.round(blue + (target - blue) * strength)})`;
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
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
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
        if (
          Math.abs(source[index + 3] - source[neighborIndex + 3]) > 96
        ) {
          return true;
        }
        if (source[neighborIndex + 3] < 96) return false;
        const difference =
          Math.abs(source[index] - source[neighborIndex]) +
          Math.abs(source[index + 1] - source[neighborIndex + 1]) +
          Math.abs(source[index + 2] - source[neighborIndex + 2]);
        return difference > 30;
      });

      if (boundary) {
        output[index] = ink[0];
        output[index + 1] = ink[1];
        output[index + 2] = ink[2];
        output[index + 3] = Math.max(output[index + 3], 220);
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

type TurntablePoint = { x: number; y: number; z: number };
type TurntableFace = {
  points: TurntablePoint[];
  normal: TurntablePoint;
  color: string;
  styleKey: string;
  depth: number;
};

type TurntableEdgeInfo = {
  count: number;
  normals: Set<string>;
  styles: Set<string>;
};

function turntableVoxelKey(x: number, y: number, z: number): string {
  return `${x}:${y}:${z}`;
}

function turntablePointKey(point: TurntablePoint): string {
  return [point.x, point.y, point.z]
    .map((value) => Math.round(value * 1_000_000) / 1_000_000)
    .join(":");
}

function turntableEdgeKey(first: TurntablePoint, second: TurntablePoint): string {
  return [turntablePointKey(first), turntablePointKey(second)].sort().join("|");
}

function turntableNormalKey(normal: TurntablePoint): string {
  return turntablePointKey(normal);
}

export function renderFurnitureTurntableFrame(
  canvas: HTMLCanvasElement,
  furniture: FurnitureDefinition,
  options: Omit<FurnitureImageExportOptions, "rotation">,
  direction: FurnitureTurntableDirection,
): void {
  canvas.width = options.size;
  canvas.height = options.size;
  const outputContext = canvas.getContext("2d");
  if (!outputContext) return;
  const renderSize = options.size * EXPORT_SUPERSAMPLE;
  const surface = document.createElement("canvas");
  surface.width = renderSize;
  surface.height = renderSize;
  const context = surface.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, renderSize, renderSize);
  if (options.background === "paper") {
    context.fillStyle = "#f3efe6";
    context.fillRect(0, 0, renderSize, renderSize);
  }
  if (furniture.voxels.length === 0) return;

  const xs = furniture.voxels.map((voxel) => voxel.x);
  const ys = furniture.voxels.map((voxel) => voxel.y);
  const zs = furniture.voxels.map((voxel) => voxel.z);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const minZ = Math.min(...zs);
  const width = Math.max(...xs) - minX + 1;
  const depth = Math.max(...ys) - minY + 1;
  const angle = direction * Math.PI / 4;
  const cosine = Math.cos(angle);
  const sine = Math.sin(angle);
  const centerX = width * 0.5;
  const centerY = depth * 0.5;
  const rotate = (point: TurntablePoint): TurntablePoint => {
    const x = point.x - centerX;
    const y = point.y - centerY;
    return {
      x: x * cosine - y * sine,
      y: x * sine + y * cosine,
      z: point.z,
    };
  };
  const rotateNormal = (normal: TurntablePoint): TurntablePoint => ({
    x: normal.x * cosine - normal.y * sine,
    y: normal.x * sine + normal.y * cosine,
    z: normal.z,
  });
  const occupied = new Set(
    furniture.voxels.map((voxel) => turntableVoxelKey(voxel.x, voxel.y, voxel.z)),
  );
  const faces: TurntableFace[] = [];
  const definitions = [
    { delta: [0, 0, 1], normal: [0, 0, 1], corners: [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]] },
    { delta: [1, 0, 0], normal: [1, 0, 0], corners: [[1, 0, 0], [1, 1, 0], [1, 1, 1], [1, 0, 1]] },
    { delta: [-1, 0, 0], normal: [-1, 0, 0], corners: [[0, 1, 0], [0, 0, 0], [0, 0, 1], [0, 1, 1]] },
    { delta: [0, 1, 0], normal: [0, 1, 0], corners: [[1, 1, 0], [0, 1, 0], [0, 1, 1], [1, 1, 1]] },
    { delta: [0, -1, 0], normal: [0, -1, 0], corners: [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]] },
  ] as const;
  furniture.voxels.forEach((voxel) => {
    const x = voxel.x - minX;
    const y = voxel.y - minY;
    const z = voxel.z - minZ;
    const baseColor = voxel.color ?? FURNITURE_MATERIALS[voxel.material].color;
    definitions.forEach((definition) => {
      if (occupied.has(turntableVoxelKey(
        voxel.x + definition.delta[0],
        voxel.y + definition.delta[1],
        voxel.z + definition.delta[2],
      ))) return;
      const normal = rotateNormal({
        x: definition.normal[0],
        y: definition.normal[1],
        z: definition.normal[2],
      });
      if (normal.x + normal.y + normal.z <= 0.0001) return;
      const cellHeight = furniture.placement === "floor" ? 0.16 : 1;
      const points = definition.corners.map((corner) => rotate({
        x: x + corner[0],
        y: y + corner[1],
        z: (z + corner[2] * cellHeight),
      }));
      const shade = normal.z > 0.5
        ? 0.12
        : Math.abs(normal.x) > Math.abs(normal.y) ? -0.2 : -0.3;
      faces.push({
        points,
        normal,
        color: shadeColor(baseColor, shade),
        styleKey: `${voxel.material}:${baseColor}`,
        depth: points.reduce((sum, point) => sum + point.x + point.y + point.z, 0) /
          points.length,
      });
    });
  });
  const projected = faces.flatMap((face) => face.points.map((point) => rawProject(
    point.x,
    point.y,
    point.z,
  )));
  const minProjectedX = Math.min(...projected.map((point) => point.x));
  const maxProjectedX = Math.max(...projected.map((point) => point.x));
  const minProjectedY = Math.min(...projected.map((point) => point.y));
  const maxProjectedY = Math.max(...projected.map((point) => point.y));
  const padding = renderSize * 0.11;
  const unit = Math.min(
    (renderSize - padding * 2) / Math.max(1, maxProjectedX - minProjectedX),
    (renderSize - padding * 2) / Math.max(1, maxProjectedY - minProjectedY),
  );
  const contentWidth = (maxProjectedX - minProjectedX) * unit;
  const contentHeight = (maxProjectedY - minProjectedY) * unit;
  const project = (point: TurntablePoint): Point => {
    const raw = rawProject(point.x, point.y, point.z);
    return {
      x: (renderSize - contentWidth) * 0.5 + (raw.x - minProjectedX) * unit,
      y: (renderSize - contentHeight) * 0.5 + (raw.y - minProjectedY) * unit,
    };
  };
  if (options.shadow) {
    context.save();
    context.fillStyle = "rgba(48, 44, 39, 0.12)";
    context.shadowColor = "rgba(48, 44, 39, 0.2)";
    context.shadowBlur = renderSize * 0.018;
    context.beginPath();
    context.ellipse(
      renderSize * 0.5,
      renderSize * 0.72,
      Math.max(renderSize * 0.08, contentWidth * 0.34),
      Math.max(renderSize * 0.035, contentHeight * 0.08),
      0,
      0,
      Math.PI * 2,
    );
    context.fill();
    context.restore();
  }
  const edges = new Map<string, TurntableEdgeInfo>();
  faces.forEach((face) => {
    face.points.forEach((point, index) => {
      const key = turntableEdgeKey(point, face.points[(index + 1) % face.points.length]);
      const edge = edges.get(key) ?? {
        count: 0,
        normals: new Set<string>(),
        styles: new Set<string>(),
      };
      edge.count += 1;
      edge.normals.add(turntableNormalKey(face.normal));
      edge.styles.add(face.styleKey);
      edges.set(key, edge);
    });
  });
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = Math.max(1.5, renderSize / 384);
  context.strokeStyle = "rgba(59, 51, 46, 0.84)";
  faces.sort((first, second) => first.depth - second.depth).forEach((face) => {
    const points = face.points.map(project);
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => context.lineTo(point.x, point.y));
    context.closePath();
    context.fillStyle = face.color;
    context.fill();
    if (!options.outline) return;
    face.points.forEach((point, index) => {
      const nextIndex = (index + 1) % face.points.length;
      const edge = edges.get(turntableEdgeKey(point, face.points[nextIndex]));
      if (
        !edge ||
        !(edge.count === 1 || edge.normals.size > 1 || edge.styles.size > 1)
      ) return;
      context.beginPath();
      context.moveTo(points[index].x, points[index].y);
      context.lineTo(points[nextIndex].x, points[nextIndex].y);
      context.stroke();
    });
  });
  outputContext.clearRect(0, 0, options.size, options.size);
  outputContext.imageSmoothingEnabled = true;
  outputContext.imageSmoothingQuality = "high";
  outputContext.drawImage(surface, 0, 0, options.size, options.size);
}

export function renderFurnitureTurntableFrames(
  furniture: FurnitureDefinition,
  options: Omit<FurnitureImageExportOptions, "rotation">,
): HTMLCanvasElement[] {
  return ([0, 1, 2, 3, 4, 5, 6, 7] as FurnitureTurntableDirection[]).map(
    (direction) => {
      const frame = document.createElement("canvas");
      renderFurnitureTurntableFrame(frame, furniture, options, direction);
      return frame;
    },
  );
}

export function renderFurnitureEightDirectionSheet(
  furniture: FurnitureDefinition,
  options: Omit<FurnitureImageExportOptions, "rotation">,
): HTMLCanvasElement {
  const frames = renderFurnitureTurntableFrames(furniture, options);
  const sheet = document.createElement("canvas");
  sheet.width = options.size * frames.length;
  sheet.height = options.size;
  const context = sheet.getContext("2d");
  if (!context) return sheet;
  context.imageSmoothingEnabled = false;
  frames.forEach((frame, index) => context.drawImage(frame, index * options.size, 0));
  return sheet;
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
