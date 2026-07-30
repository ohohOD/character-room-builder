import type { FurnitureDefinition } from "./types.ts";

export interface RgbaFrame {
  data: Uint8ClampedArray;
}

export interface FurnitureExportMetadata {
  schema: "character-room-builder/furniture-export-1";
  name: string;
  frame: {
    width: number;
    height: number;
    count: number;
    durationMs: number;
    directionsDegrees: number[];
    groundAnchor: { x: number; y: number };
  };
  furniture: {
    placement: FurnitureDefinition["placement"];
    resolution: FurnitureDefinition["resolution"];
    rendererVersion: number;
  };
  rights: {
    license: FurnitureDefinition["provenance"]["license"];
    credit?: string;
    generatedImageModel: false;
  };
}

const encoder = new TextEncoder();

function ascii(value: string): number[] {
  return [...value].map((character) => character.charCodeAt(0));
}

function writeUint16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeUint24(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff);
}

function writeUint32(target: number[], value: number): void {
  target.push(
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  );
}

function readUint32(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    data[offset + 1] << 8 |
    data[offset + 2] << 16 |
    data[offset + 3] << 24
  ) >>> 0;
}

interface GifHistogramColor {
  packed: number;
  count: number;
  red: number;
  green: number;
  blue: number;
}

interface GifColorBox {
  colors: GifHistogramColor[];
  count: number;
  ranges: [number, number, number];
}

interface GifPalette {
  bytes: Uint8Array;
  colors: number[];
  directIndices: Map<number, number>;
  nearestIndices: Map<number, number>;
}

function packRgb(red: number, green: number, blue: number): number {
  return red << 16 | green << 8 | blue;
}

function gifColorBox(colors: GifHistogramColor[]): GifColorBox {
  let count = 0;
  let redMin = 255;
  let redMax = 0;
  let greenMin = 255;
  let greenMax = 0;
  let blueMin = 255;
  let blueMax = 0;
  colors.forEach((color) => {
    count += color.count;
    redMin = Math.min(redMin, color.red);
    redMax = Math.max(redMax, color.red);
    greenMin = Math.min(greenMin, color.green);
    greenMax = Math.max(greenMax, color.green);
    blueMin = Math.min(blueMin, color.blue);
    blueMax = Math.max(blueMax, color.blue);
  });
  return {
    colors,
    count,
    ranges: [redMax - redMin, greenMax - greenMin, blueMax - blueMin],
  };
}

function splitGifColorBox(box: GifColorBox): [GifColorBox, GifColorBox] {
  const channel = box.ranges[1] > box.ranges[0] && box.ranges[1] >= box.ranges[2]
    ? 1
    : box.ranges[2] > box.ranges[0] && box.ranges[2] > box.ranges[1]
      ? 2
      : 0;
  const channelValue = (color: GifHistogramColor) =>
    channel === 0 ? color.red : channel === 1 ? color.green : color.blue;
  const colors = [...box.colors].sort(
    (first, second) => channelValue(first) - channelValue(second) || first.packed - second.packed,
  );
  let splitAt = 1;
  let cumulative = colors[0].count;
  while (splitAt < colors.length - 1 && cumulative < box.count / 2) {
    cumulative += colors[splitAt].count;
    splitAt += 1;
  }
  return [
    gifColorBox(colors.slice(0, splitAt)),
    gifColorBox(colors.slice(splitAt)),
  ];
}

function colorDistance(
  red: number,
  green: number,
  blue: number,
  otherRed: number,
  otherGreen: number,
  otherBlue: number,
): number {
  const redDifference = red - otherRed;
  const greenDifference = green - otherGreen;
  const blueDifference = blue - otherBlue;
  return (
    redDifference * redDifference * 3 +
    greenDifference * greenDifference * 4 +
    blueDifference * blueDifference * 2
  );
}

function representativeGifColor(box: GifColorBox): number {
  let redTotal = 0;
  let greenTotal = 0;
  let blueTotal = 0;
  box.colors.forEach((color) => {
    redTotal += color.red * color.count;
    greenTotal += color.green * color.count;
    blueTotal += color.blue * color.count;
  });
  const red = redTotal / box.count;
  const green = greenTotal / box.count;
  const blue = blueTotal / box.count;
  return box.colors.reduce((best, color) => {
    const distance = colorDistance(red, green, blue, color.red, color.green, color.blue);
    const bestDistance = colorDistance(red, green, blue, best.red, best.green, best.blue);
    return distance < bestDistance || distance === bestDistance && color.packed < best.packed
      ? color
      : best;
  }).packed;
}

function selectGifColors(histogram: Map<number, number>): number[] {
  const colors = [...histogram].map(([packed, count]) => ({
    packed,
    count,
    red: packed >>> 16,
    green: packed >>> 8 & 0xff,
    blue: packed & 0xff,
  }));
  if (colors.length <= 255) return colors.map((color) => color.packed).sort((a, b) => a - b);

  const boxes = [gifColorBox(colors)];
  while (boxes.length < 255) {
    let selected = -1;
    let selectedScore = -1;
    boxes.forEach((box, index) => {
      if (box.colors.length < 2) return;
      const score = Math.max(...box.ranges) * box.count;
      if (score > selectedScore) {
        selected = index;
        selectedScore = score;
      }
    });
    if (selected < 0) break;
    const [first, second] = splitGifColorBox(boxes[selected]);
    boxes.splice(selected, 1, first, second);
  }
  return boxes.map(representativeGifColor).sort((a, b) => a - b);
}

function gifPalette(frames: RgbaFrame[], width: number, height: number): GifPalette {
  const histogram = new Map<number, number>();
  frames.forEach((frame) => {
    if (frame.data.length !== width * height * 4) {
      throw new Error("GIF 프레임의 픽셀 수가 맞지 않아요.");
    }
    for (let offset = 0; offset < frame.data.length; offset += 4) {
      if (frame.data[offset + 3] < 128) continue;
      const packed = packRgb(frame.data[offset], frame.data[offset + 1], frame.data[offset + 2]);
      histogram.set(packed, (histogram.get(packed) ?? 0) + 1);
    }
  });
  const colors = selectGifColors(histogram);
  if (colors.length === 0) colors.push(0);
  const bytes = new Uint8Array(256 * 3);
  const directIndices = new Map<number, number>();
  colors.forEach((color, index) => {
    const paletteIndex = index + 1;
    bytes[paletteIndex * 3] = color >>> 16;
    bytes[paletteIndex * 3 + 1] = color >>> 8 & 0xff;
    bytes[paletteIndex * 3 + 2] = color & 0xff;
    directIndices.set(color, paletteIndex);
  });
  return { bytes, colors, directIndices, nearestIndices: new Map() };
}

function frameToGifIndices(
  frame: RgbaFrame,
  width: number,
  height: number,
  palette: GifPalette,
): Uint8Array {
  if (frame.data.length !== width * height * 4) {
    throw new Error("GIF 프레임의 픽셀 수가 맞지 않아요.");
  }
  const indices = new Uint8Array(width * height);
  for (let index = 0; index < indices.length; index += 1) {
    const offset = index * 4;
    if (frame.data[offset + 3] < 128) {
      indices[index] = 0;
      continue;
    }
    const red = frame.data[offset];
    const green = frame.data[offset + 1];
    const blue = frame.data[offset + 2];
    const packed = packRgb(red, green, blue);
    const directIndex = palette.directIndices.get(packed);
    if (directIndex !== undefined) {
      indices[index] = directIndex;
      continue;
    }
    const cachedIndex = palette.nearestIndices.get(packed);
    if (cachedIndex !== undefined) {
      indices[index] = cachedIndex;
      continue;
    }
    let nearestIndex = 1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    palette.colors.forEach((color, paletteColorIndex) => {
      const distance = colorDistance(
        red,
        green,
        blue,
        color >>> 16,
        color >>> 8 & 0xff,
        color & 0xff,
      );
      if (distance < nearestDistance) {
        nearestIndex = paletteColorIndex + 1;
        nearestDistance = distance;
      }
    });
    palette.nearestIndices.set(packed, nearestIndex);
    indices[index] = nearestIndex;
  }
  return indices;
}

function gifLzw(indices: Uint8Array): Uint8Array {
  const clearCode = 256;
  const endCode = 257;
  const output: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  let codeSize = 9;
  let nextCode = 258;
  let dictionary = new Map<string, number>();
  const writeCode = (code: number) => {
    bitBuffer |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  const reset = () => {
    dictionary = new Map();
    codeSize = 9;
    nextCode = 258;
  };
  writeCode(clearCode);
  if (indices.length === 0) {
    writeCode(endCode);
  } else {
    let prefix = indices[0];
    for (let index = 1; index < indices.length; index += 1) {
      const suffix = indices[index];
      const key = `${prefix}:${suffix}`;
      const existing = dictionary.get(key);
      if (existing !== undefined) {
        prefix = existing;
        continue;
      }
      writeCode(prefix);
      if (nextCode < 4096) {
        dictionary.set(key, nextCode);
        nextCode += 1;
        // A GIF decoder adds the matching dictionary entry after it reads the
        // next code, so its table is one entry behind the encoder here. Keep
        // the boundary code at the old width, then grow for following codes.
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize += 1;
      } else {
        writeCode(clearCode);
        reset();
      }
      prefix = suffix;
    }
    writeCode(prefix);
    writeCode(endCode);
  }
  if (bitCount > 0) output.push(bitBuffer & 0xff);
  return new Uint8Array(output);
}

export function encodeAnimatedGif(
  frames: RgbaFrame[],
  width: number,
  height: number,
  durationMs: number,
): Uint8Array {
  if (frames.length < 2 || width < 1 || height < 1 || width > 65_535 || height > 65_535) {
    throw new Error("GIF 프레임이나 크기가 올바르지 않아요.");
  }
  const palette = gifPalette(frames, width, height);
  const bytes: number[] = [...ascii("GIF89a")];
  writeUint16(bytes, width);
  writeUint16(bytes, height);
  bytes.push(0xf7, 0, 0, ...palette.bytes);
  bytes.push(0x21, 0xff, 0x0b, ...ascii("NETSCAPE2.0"), 0x03, 0x01, 0, 0, 0);
  const delay = Math.max(1, Math.min(65_535, Math.round(durationMs / 10)));
  frames.forEach((frame) => {
    bytes.push(0x21, 0xf9, 0x04, 0x09);
    writeUint16(bytes, delay);
    bytes.push(0, 0);
    bytes.push(0x2c, 0, 0, 0, 0);
    writeUint16(bytes, width);
    writeUint16(bytes, height);
    bytes.push(0, 8);
    const compressed = gifLzw(frameToGifIndices(frame, width, height, palette));
    for (let offset = 0; offset < compressed.length; offset += 255) {
      const block = compressed.slice(offset, offset + 255);
      bytes.push(block.length, ...block);
    }
    bytes.push(0);
  });
  bytes.push(0x3b);
  return new Uint8Array(bytes);
}

function webpChunk(name: string, payload: Uint8Array): Uint8Array {
  const bytes = new Uint8Array(8 + payload.length + payload.length % 2);
  bytes.set(ascii(name), 0);
  const size: number[] = [];
  writeUint32(size, payload.length);
  bytes.set(size, 4);
  bytes.set(payload, 8);
  return bytes;
}

function staticWebPFrameChunks(data: Uint8Array): Uint8Array {
  if (
    String.fromCharCode(...data.slice(0, 4)) !== "RIFF" ||
    String.fromCharCode(...data.slice(8, 12)) !== "WEBP"
  ) {
    throw new Error("WebP 프레임 형식이 아니에요.");
  }
  const output: number[] = [];
  for (let offset = 12; offset + 8 <= data.length;) {
    const name = String.fromCharCode(...data.slice(offset, offset + 4));
    const size = readUint32(data, offset + 4);
    const end = offset + 8 + size + size % 2;
    if (end > data.length) throw new Error("WebP 프레임이 손상되었어요.");
    if (name === "ALPH" || name === "VP8 " || name === "VP8L") {
      output.push(...data.slice(offset, end));
    }
    offset = end;
  }
  if (output.length === 0) throw new Error("WebP 프레임 이미지를 찾지 못했어요.");
  return new Uint8Array(output);
}

export function assembleAnimatedWebP(
  frames: Uint8Array[],
  width: number,
  height: number,
  durationMs: number,
): Uint8Array {
  if (frames.length < 2 || width < 1 || height < 1 || width > 16_777_216 || height > 16_777_216) {
    throw new Error("애니메이션 WebP 프레임이나 크기가 올바르지 않아요.");
  }
  const extended = new Uint8Array(10);
  extended[0] = 0x12;
  const extendedBytes = [...extended];
  extendedBytes.splice(4, 3, (width - 1) & 0xff, ((width - 1) >>> 8) & 0xff, ((width - 1) >>> 16) & 0xff);
  extendedBytes.splice(7, 3, (height - 1) & 0xff, ((height - 1) >>> 8) & 0xff, ((height - 1) >>> 16) & 0xff);
  const animation = new Uint8Array([0, 0, 0, 0, 0, 0]);
  const chunks: Uint8Array[] = [
    webpChunk("VP8X", new Uint8Array(extendedBytes)),
    webpChunk("ANIM", animation),
  ];
  frames.forEach((frame) => {
    const header: number[] = [];
    writeUint24(header, 0);
    writeUint24(header, 0);
    writeUint24(header, width - 1);
    writeUint24(header, height - 1);
    writeUint24(header, Math.max(1, Math.min(16_777_215, Math.round(durationMs))));
    header.push(2);
    const frameChunks = staticWebPFrameChunks(frame);
    const payload = new Uint8Array(header.length + frameChunks.length);
    payload.set(header, 0);
    payload.set(frameChunks, header.length);
    chunks.push(webpChunk("ANMF", payload));
  });
  const bodyLength = 4 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result: number[] = [...ascii("RIFF")];
  writeUint32(result, bodyLength);
  result.push(...ascii("WEBP"));
  chunks.forEach((chunk) => result.push(...chunk));
  return new Uint8Array(result);
}

const crcTable = Array.from({ length: 256 }, (_, value) => {
  let current = value;
  for (let bit = 0; bit < 8; bit += 1) {
    current = current & 1 ? 0xedb88320 ^ current >>> 1 : current >>> 1;
  }
  return current >>> 0;
});

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  data.forEach((byte) => {
    crc = crcTable[(crc ^ byte) & 0xff] ^ crc >>> 8;
  });
  return (crc ^ 0xffffffff) >>> 0;
}

export function createStoredZip(
  files: Array<{ name: string; data: Uint8Array }>,
): Uint8Array {
  const local: number[] = [];
  const central: number[] = [];
  files.forEach((file) => {
    const name = encoder.encode(file.name);
    const crc = crc32(file.data);
    const offset = local.length;
    writeUint32(local, 0x04034b50);
    writeUint16(local, 20);
    writeUint16(local, 0x0800);
    writeUint16(local, 0);
    writeUint16(local, 0);
    writeUint16(local, 33);
    writeUint32(local, crc);
    writeUint32(local, file.data.length);
    writeUint32(local, file.data.length);
    writeUint16(local, name.length);
    writeUint16(local, 0);
    local.push(...name, ...file.data);

    writeUint32(central, 0x02014b50);
    writeUint16(central, 20);
    writeUint16(central, 20);
    writeUint16(central, 0x0800);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 33);
    writeUint32(central, crc);
    writeUint32(central, file.data.length);
    writeUint32(central, file.data.length);
    writeUint16(central, name.length);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint16(central, 0);
    writeUint32(central, 0);
    writeUint32(central, offset);
    central.push(...name);
  });
  const output = [...local, ...central];
  writeUint32(output, 0x06054b50);
  writeUint16(output, 0);
  writeUint16(output, 0);
  writeUint16(output, files.length);
  writeUint16(output, files.length);
  writeUint32(output, central.length);
  writeUint32(output, local.length);
  writeUint16(output, 0);
  return new Uint8Array(output);
}

export function makeFurnitureExportMetadata(
  furniture: FurnitureDefinition,
  frameSize: number,
  durationMs: number,
  directionsDegrees: number[],
): FurnitureExportMetadata {
  return {
    schema: "character-room-builder/furniture-export-1",
    name: furniture.name,
    frame: {
      width: frameSize,
      height: frameSize,
      count: directionsDegrees.length,
      durationMs,
      directionsDegrees: [...directionsDegrees],
      groundAnchor: { x: 0.5, y: 0.82 },
    },
    furniture: {
      placement: furniture.placement,
      resolution: furniture.resolution,
      rendererVersion: furniture.rendererVersion,
    },
    rights: {
      license: furniture.provenance.license,
      ...(furniture.provenance.credit ? { credit: furniture.provenance.credit } : {}),
      generatedImageModel: false,
    },
  };
}

export function licenseText(furniture: FurnitureDefinition): string {
  const license = furniture.provenance.license === "CC-BY-4.0"
    ? "Creative Commons Attribution 4.0 International (CC BY 4.0)"
    : furniture.provenance.license === "CC0-1.0"
      ? "CC0 1.0 Universal"
      : "All rights reserved. Permission is required before reuse.";
  return [
    furniture.name,
    furniture.provenance.credit ? `Creator: ${furniture.provenance.credit}` : null,
    `License: ${license}`,
    "Generated-image model used for this asset: no",
    "Rendered locally with Character Room Builder Canvas code.",
  ].filter(Boolean).join("\n") + "\n";
}

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}
