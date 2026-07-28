import { MAX_FURNITURE_VOXELS } from "./types.ts";
import type {
  FurnitureDefinition,
  FurnitureLicense,
  FurnitureMaterialId,
  FurnitureResolution,
  FurnitureVoxel,
} from "./types.ts";

export interface PixelImage {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface QuantizedPixelImage extends PixelImage {
  colors: Array<string | null>;
  palette: string[];
}

export interface ImageQuantizeOptions {
  width: number;
  height: number;
  paletteSize: number;
  alphaThreshold: number;
  dither: boolean;
}

export type ImageFurnitureMode = "wall" | "floor" | "relief";

export interface ImageFurnitureOptions {
  mode: ImageFurnitureMode;
  material: FurnitureMaterialId;
  reliefHeight: number;
  reliefSource?: "brightness" | "alpha";
  name: string;
  license: FurnitureLicense;
  credit?: string;
}

type Rgb = [number, number, number];
type WeightedColor = { color: Rgb; count: number };

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function colorHex(color: Rgb): string {
  return "#" + color.map((channel) => clampByte(channel).toString(16).padStart(2, "0")).join("");
}

function colorDistance(first: Rgb, second: Rgb): number {
  const red = first[0] - second[0];
  const green = first[1] - second[1];
  const blue = first[2] - second[2];
  return red * red * 0.299 + green * green * 0.587 + blue * blue * 0.114;
}

function nearestPaletteColor(color: Rgb, palette: Rgb[]): Rgb {
  return palette.reduce((nearest, candidate) =>
    colorDistance(color, candidate) < colorDistance(color, nearest)
      ? candidate
      : nearest
  );
}

function channelRange(colors: WeightedColor[], channel: number): number {
  let minimum = 255;
  let maximum = 0;
  colors.forEach((item) => {
    minimum = Math.min(minimum, item.color[channel]);
    maximum = Math.max(maximum, item.color[channel]);
  });
  return maximum - minimum;
}

function averageBox(colors: WeightedColor[]): Rgb {
  const total = colors.reduce((sum, item) => sum + item.count, 0) || 1;
  return [0, 1, 2].map((channel) =>
    colors.reduce((sum, item) => sum + item.color[channel] * item.count, 0) / total
  ) as Rgb;
}

function makePalette(pixels: Rgb[], maximum: number): Rgb[] {
  const histogram = new Map<string, WeightedColor>();
  pixels.forEach((color) => {
    const reduced: Rgb = color.map((channel) => Math.round(channel / 8) * 8) as Rgb;
    const key = reduced.join(":");
    const current = histogram.get(key);
    histogram.set(key, { color: reduced, count: (current?.count ?? 0) + 1 });
  });
  if (histogram.size === 0) return [[244, 239, 227]];

  const boxes: WeightedColor[][] = [[...histogram.values()]];
  while (boxes.length < maximum) {
    let targetIndex = -1;
    let targetScore = -1;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      const score = Math.max(
        channelRange(box, 0),
        channelRange(box, 1),
        channelRange(box, 2),
      ) * box.reduce((sum, item) => sum + item.count, 0);
      if (score > targetScore) {
        targetIndex = index;
        targetScore = score;
      }
    });
    if (targetIndex < 0) break;
    const target = boxes[targetIndex];
    const channel = [0, 1, 2].sort((first, second) =>
      channelRange(target, second) - channelRange(target, first)
    )[0];
    const sorted = [...target].sort((first, second) =>
      first.color[channel] - second.color[channel] ||
      first.color[0] - second.color[0] ||
      first.color[1] - second.color[1] ||
      first.color[2] - second.color[2]
    );
    const total = sorted.reduce((sum, item) => sum + item.count, 0);
    let accumulated = 0;
    let split = 1;
    for (; split < sorted.length; split += 1) {
      accumulated += sorted[split - 1].count;
      if (accumulated >= total / 2) break;
    }
    boxes.splice(targetIndex, 1, sorted.slice(0, split), sorted.slice(split));
  }
  return boxes.map(averageBox);
}

function sampleNearest(source: PixelImage, width: number, height: number): number[] {
  const sampled: number[] = [];
  for (let y = 0; y < height; y += 1) {
    const sourceY = Math.min(source.height - 1, Math.floor((y + 0.5) * source.height / height));
    for (let x = 0; x < width; x += 1) {
      const sourceX = Math.min(source.width - 1, Math.floor((x + 0.5) * source.width / width));
      const offset = (sourceY * source.width + sourceX) * 4;
      sampled.push(
        source.data[offset],
        source.data[offset + 1],
        source.data[offset + 2],
        source.data[offset + 3],
      );
    }
  }
  return sampled;
}

export function quantizePixelImage(
  source: PixelImage,
  options: ImageQuantizeOptions,
): QuantizedPixelImage {
  const width = Math.max(4, Math.min(64, Math.round(options.width)));
  const height = Math.max(4, Math.min(64, Math.round(options.height)));
  const paletteSize = Math.max(2, Math.min(24, Math.round(options.paletteSize)));
  const alphaThreshold = Math.max(0, Math.min(255, Math.round(options.alphaThreshold)));
  const sampled = sampleNearest(source, width, height);
  const opaque: Rgb[] = [];
  for (let index = 0; index < sampled.length; index += 4) {
    if (sampled[index + 3] >= alphaThreshold) {
      opaque.push([sampled[index], sampled[index + 1], sampled[index + 2]]);
    }
  }
  const palette = makePalette(opaque, paletteSize);
  const working = sampled.map(Number);
  const data = new Uint8ClampedArray(width * height * 4);
  const colors: Array<string | null> = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = working[offset + 3];
      if (alpha < alphaThreshold) {
        colors.push(null);
        continue;
      }
      const original: Rgb = [working[offset], working[offset + 1], working[offset + 2]];
      const selected = nearestPaletteColor(original, palette);
      data.set([selected[0], selected[1], selected[2], clampByte(alpha)], offset);
      colors.push(colorHex(selected));
      if (!options.dither) continue;
      const error: Rgb = [
        original[0] - selected[0],
        original[1] - selected[1],
        original[2] - selected[2],
      ];
      const spread = (targetX: number, targetY: number, amount: number) => {
        if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) return;
        const targetOffset = (targetY * width + targetX) * 4;
        if (working[targetOffset + 3] < alphaThreshold) return;
        for (let channel = 0; channel < 3; channel += 1) {
          working[targetOffset + channel] += error[channel] * amount;
        }
      };
      spread(x + 1, y, 7 / 16);
      spread(x - 1, y + 1, 3 / 16);
      spread(x, y + 1, 5 / 16);
      spread(x + 1, y + 1, 1 / 16);
    }
  }

  return { width, height, data, colors, palette: palette.map(colorHex) };
}

function resolutionForGrid(
  mode: ImageFurnitureMode,
  width: number,
  height: number,
  reliefHeight: number,
): FurnitureResolution {
  for (const resolution of [1, 2, 4] as FurnitureResolution[]) {
    const valid = mode === "wall"
      ? width <= 16 * resolution && height <= 12 * resolution
      : mode === "floor"
        ? width <= 16 * resolution && height <= 16 * resolution
        : width <= 16 * resolution && height <= 16 * resolution &&
          reliefHeight <= 12 * resolution;
    if (valid) return resolution;
  }
  throw new Error("선택한 픽셀 크기가 현재 조립판 상한을 넘어요.");
}

function luminance(hex: string): number {
  const red = Number.parseInt(hex.slice(1, 3), 16);
  const green = Number.parseInt(hex.slice(3, 5), 16);
  const blue = Number.parseInt(hex.slice(5, 7), 16);
  return (red * 0.299 + green * 0.587 + blue * 0.114) / 255;
}

export function pixelImageToFurniture(
  image: QuantizedPixelImage,
  options: ImageFurnitureOptions,
): FurnitureDefinition {
  const reliefHeight = Math.max(2, Math.min(48, Math.round(options.reliefHeight)));
  const resolution = resolutionForGrid(
    options.mode,
    image.width,
    image.height,
    reliefHeight,
  );
  const voxels: FurnitureVoxel[] = [];
  image.colors.forEach((color, index) => {
    if (!color) return;
    const x = index % image.width;
    const row = Math.floor(index / image.width);
    if (options.mode === "wall") {
      voxels.push({
        x,
        y: 0,
        z: image.height - 1 - row,
        material: options.material,
        color,
      });
      return;
    }
    if (options.mode === "floor") {
      voxels.push({ x, y: row, z: 0, material: options.material, color });
      return;
    }
    const sourceValue = options.reliefSource === "alpha"
      ? image.data[index * 4 + 3] / 255
      : luminance(color);
    const columnHeight = Math.max(1, Math.round(sourceValue * reliefHeight));
    for (let z = 0; z < columnHeight; z += 1) {
      voxels.push({ x, y: row, z, material: options.material, color });
    }
  });
  if (voxels.length > MAX_FURNITURE_VOXELS) {
    throw new Error(
      `변환 결과가 ${voxels.length.toLocaleString("ko-KR")}칸이라 최대 ${MAX_FURNITURE_VOXELS.toLocaleString("ko-KR")}칸을 넘어요. 픽셀 크기나 부조 높이를 줄여주세요.`,
    );
  }
  const placement = options.mode === "wall" ? "wall" : options.mode === "floor" ? "floor" : "volume";
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement,
    resolution,
    name: options.name.trim().slice(0, 40) || "이미지 변환 가구",
    grid: {
      width: image.width,
      depth: placement === "wall" ? 1 : image.height,
      height: placement === "floor" ? 1 : placement === "wall" ? image.height : reliefHeight,
    },
    voxels,
    provenance: {
      generatedImageModel: false,
      license: options.license,
      ...(options.credit?.trim() ? { credit: options.credit.trim().slice(0, 80) } : {}),
    },
  };
}

export interface VisualHullOptions {
  material: FurnitureMaterialId;
  name: string;
  license: FurnitureLicense;
  credit?: string;
}

export function visualHullFromSilhouettes(
  front: QuantizedPixelImage,
  side: QuantizedPixelImage,
  top: QuantizedPixelImage,
  options: VisualHullOptions,
): FurnitureDefinition {
  const width = front.width;
  const depth = side.width;
  const height = front.height;
  if (
    side.height !== height ||
    top.width !== width ||
    top.height !== depth
  ) {
    throw new Error("앞·옆·위 실루엣의 가로·깊이·높이 크기가 서로 맞지 않아요.");
  }
  const resolution = resolutionForGrid("relief", width, depth, height);
  const voxels: FurnitureVoxel[] = [];
  for (let z = 0; z < height; z += 1) {
    for (let y = 0; y < depth; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const frontColor = front.colors[(height - 1 - z) * width + x];
        const sideColor = side.colors[(height - 1 - z) * depth + y];
        const topColor = top.colors[y * width + x];
        if (!frontColor || !sideColor || !topColor) continue;
        voxels.push({
          x,
          y,
          z,
          material: options.material,
          color: frontColor,
        });
        if (voxels.length > MAX_FURNITURE_VOXELS) {
          throw new Error(
            `삼면도 교차 결과가 최대 ${MAX_FURNITURE_VOXELS.toLocaleString("ko-KR")}칸을 넘어요. 조립 크기를 줄여주세요.`,
          );
        }
      }
    }
  }
  return {
    schemaVersion: 1,
    rendererVersion: 1,
    placement: "volume",
    resolution,
    name: options.name.trim().slice(0, 40) || "삼면도 복셀",
    grid: { width, depth, height },
    voxels,
    provenance: {
      generatedImageModel: false,
      license: options.license,
      ...(options.credit?.trim() ? { credit: options.credit.trim().slice(0, 80) } : {}),
    },
  };
}
